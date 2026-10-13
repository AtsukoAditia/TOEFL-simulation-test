-- TOEFL Simulator — Supabase schema
-- Jalankan di Supabase SQL Editor sekali.

create table if not exists public.test_results (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  mode          text not null check (mode in ('fulltest', 'section')),
  set_name      text not null,
  section       text check (section in ('listening', 'structure', 'reading')),
  listening     jsonb,
  structure     jsonb,
  reading       jsonb,
  total_score   int,
  cefr          text,
  accuracy      int,
  created_at    timestamptz not null default now()
);

-- Satu baris profil per user (nama + avatar dari Google)
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  target_score int default 550,
  created_at  timestamptz not null default now()
);

-- Trigger isi profil otomatis saat user pertama login
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
          coalesce(new.raw_user_meta_data->>'avatar_url', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security: tiap user hanya akses data miliknya
alter table public.test_results enable row level security;
alter table public.profiles enable row level security;

create policy "select own results"  on public.test_results for select using (auth.uid() = user_id);
create policy "insert own results"  on public.test_results for insert with check (auth.uid() = user_id);
create policy "delete own results"  on public.test_results for delete using (auth.uid() = user_id);

create policy "select own profile"  on public.profiles for select using (auth.uid() = id);
create policy "update own profile"  on public.profiles for update using (auth.uid() = id);

-- Index biar query history cepat
create index if not exists idx_test_results_user_created
  on public.test_results (user_id, created_at desc);
