-- TOEFL Yuk — Schema v3: leaderboard periode (harian/mingguan/bulanan) + 30 dummy pemain
-- Jalankan SETELAH v1 + v2 di Supabase SQL Editor.
-- WARNING pergelaran: dummy rows dipisah di tabel khusus agar tidak terkontaminasi data user asli.

-- ═══ 1. Tabel dummy (bukan auth user — bebas insert, RLS read-only) ═══
create table if not exists public.dummy_results (
  id          bigint generated always as identity primary key,
  player_name text not null,
  best_score  int  not null check (best_score between 310 and 677),
  attempts    int  not null default 1,
  created_at  timestamptz not null default now()
);

alter table public.dummy_results enable row level security;

create policy "dummy readable by all"
  on public.dummy_results for select
  using (true);
-- tidak ada policy insert/update/delete → hanya service_role/dashboard yang bisa tulis

-- ═══ 2. Seed 30 nama Indonesia, skor kompetitif medium (450–620), sebar 30 hari ═══
truncate public.dummy_results;
insert into public.dummy_results (player_name, best_score, attempts, created_at) values
  ('Rizky Pratama',      587, 4, now() - interval '2 hours'),
  ('Siti Nurhaliza',     563, 3, now() - interval '5 hours'),
  ('Bagas Firmansyah',   601, 6, now() - interval '11 hours'),
  ('Dewi Lestari',       545, 2, now() - interval '15 hours'),
  ('Andika Putra',       520, 5, now() - interval '21 hours'),
  ('Ayu Wulandari',      597, 7, now() - interval '1 day'),
  ('Fajar Ramadhan',     480, 2, now() - interval '1 day 3 hours'),
  ('Intan Permata',      552, 4, now() - interval '1 day 9 hours'),
  ('Yoga Saputra',       612, 8, now() - interval '2 days'),
  ('Ratna Sari',         505, 3, now() - interval '2 days 6 hours'),
  ('Dimas Anggara',      577, 5, now() - interval '3 days'),
  ('Nadia Rahmawati',    469, 1, now() - interval '3 days 8 hours'),
  ('Eko Prasetyo',       534, 4, now() - interval '4 days'),
  ('Maya Kusuma',        623, 9, now() - interval '4 days 5 hours'),
  ('Reza Febrian',       491, 2, now() - interval '5 days'),
  ('Putri Ayudia',       559, 3, now() - interval '6 days'),
  ('Gilang Nugraha',     583, 6, now() - interval '6 days 12 hours'),
  ('Fitri Handayani',    527, 2, now() - interval '7 days'),
  ('Arif Budiman',       605, 5, now() - interval '8 days'),
  ('Sinta Dewanti',      474, 1, now() - interval '9 days'),
  ('Hendra Wijaya',      569, 4, now() - interval '11 days'),
  ('Lia Anggraini',      541, 3, now() - interval '12 days'),
  ('Budi Santoso',       498, 2, now() - interval '14 days'),
  ('Rina Marlina',       591, 6, now() - interval '16 days'),
  ('Doni Kurniawan',     513, 3, now() - interval '18 days'),
  ('Wulan Astuti',       566, 4, now() - interval '20 days'),
  ('Agus Setiawan',      537, 2, now() - interval '22 days'),
  ('Tania Puspita',      574, 5, now() - interval '24 days'),
  ('Fikri Hidayat',      487, 1, now() - interval '27 days'),
  ('Sari Mulyani',       555, 3, now() - interval '29 days');

-- ═══ 3. View per periode — UNION dummy + user asli ═══
-- drop view lama dulu (signature return berubah)
drop view if exists public.leaderboard_30d;

-- helper: nama asli user (sudah disamarkan di client, jadi kita kirim nama apa adanya)
create or replace view public.leaderboard_daily as
with real_rows as (
  select p.full_name as player_name,
         max(t.total_score) as best_score,
         count(*) as attempts,
         max(t.created_at) as last_attempt
  from public.test_results t
  join public.profiles p on p.id = t.user_id
  where t.created_at > now() - interval '24 hours'
    and t.mode = 'fulltest' and t.total_score is not null
  group by p.id, p.full_name
),
dummy_rows as (
  select player_name,
         max(best_score) as best_score,
         sum(attempts) as attempts,
         max(created_at) as last_attempt
  from public.dummy_results
  where created_at > now() - interval '24 hours'
  group by player_name
)
select player_name, null::text as avatar_url, max(best_score) as best_score,
       sum(attempts) as attempts, max(last_attempt) as last_attempt
from (select * from real_rows union all select * from dummy_rows) u
group by player_name
order by best_score desc, last_attempt asc
limit 50;

create or replace view public.leaderboard_weekly as
with real_rows as (
  select p.full_name as player_name,
         max(t.total_score) as best_score,
         count(*) as attempts,
         max(t.created_at) as last_attempt
  from public.test_results t
  join public.profiles p on p.id = t.user_id
  where t.created_at > now() - interval '7 days'
    and t.mode = 'fulltest' and t.total_score is not null
  group by p.id, p.full_name
),
dummy_rows as (
  select player_name, max(best_score) as best_score, sum(attempts) as attempts, max(created_at) as last_attempt
  from public.dummy_results
  where created_at > now() - interval '7 days'
  group by player_name
)
select player_name, null::text as avatar_url, max(best_score) as best_score,
       sum(attempts) as attempts, max(last_attempt) as last_attempt
from (select * from real_rows union all select * from dummy_rows) u
group by player_name
order by best_score desc, last_attempt asc
limit 100;

create or replace view public.leaderboard_monthly as
with real_rows as (
  select p.full_name as player_name,
         max(t.total_score) as best_score,
         count(*) as attempts,
         max(t.created_at) as last_attempt
  from public.test_results t
  join public.profiles p on p.id = t.user_id
  where t.created_at > now() - interval '30 days'
    and t.mode = 'fulltest' and t.total_score is not null
  group by p.id, p.full_name
),
dummy_rows as (
  select player_name, max(best_score) as best_score, sum(attempts) as attempts, max(created_at) as last_attempt
  from public.dummy_results
  where created_at > now() - interval '30 days'
  group by player_name
)
select player_name, null::text as avatar_url, max(best_score) as best_score,
       sum(attempts) as attempts, max(last_attempt) as last_attempt
from (select * from real_rows union all select * from dummy_rows) u
group by player_name
order by best_score desc, last_attempt asc
limit 100;

grant select on public.leaderboard_daily to anon, authenticated;
grant select on public.leaderboard_weekly to anon, authenticated;
grant select on public.leaderboard_monthly to anon, authenticated;
