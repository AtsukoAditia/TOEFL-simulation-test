-- TOEFL Simulator — Schema v2 (account detail + leaderboard)
-- Jalankan SETELAH schema v1.

-- Kolom tambahan untuk detail test
alter table public.test_results
  add column if not exists elapsed_seconds int,
  add column if not exists questions_answered int,
  add column if not exists questions_total int;

-- Leaderboard view: top user per best fulltest score, 30 hari terakhir
-- Public readable (tanpa RLS restriction — view ini agregat, hanya tampilkan nama depan)
create or replace view public.leaderboard_30d as
select
  p.full_name,
  p.avatar_url,
  max(t.total_score) as best_score,
  count(*) as attempts,
  max(t.created_at) as last_attempt
from public.test_results t
join public.profiles p on p.id = t.user_id
where t.created_at > now() - interval '30 days'
  and t.mode = 'fulltest'
  and t.total_score is not null
group by p.id, p.full_name, p.avatar_url
order by best_score desc, last_attempt asc
limit 100;

-- Izinkan semua orang baca leaderboard view (agregat saja)
grant select on public.leaderboard_30d to anon;
grant select on public.leaderboard_30d to authenticated;

-- Izinkan user INSERT profil sendiri (untuk legacy users tanpa trigger)
create policy "insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Index untuk query leaderboard
create index if not exists idx_test_results_mode_score_created
  on public.test_results (mode, total_score desc, created_at desc)
  where mode = 'fulltest' and total_score is not null;
