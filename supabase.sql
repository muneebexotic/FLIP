-- FLIP global leaderboard — run this in the Supabase SQL editor.
-- One table, anonymous inserts, public reads, guarded by RLS + CHECK constraints.

create table if not exists public.scores (
  id         uuid primary key default gen_random_uuid(),
  level      int  not null check (level >= 0 and level < 100),
  name       text not null check (char_length(name) between 1 and 24),
  time_ms    int  not null check (time_ms > 0 and time_ms < 3600000),
  deaths     int  not null check (deaths >= 0 and deaths < 100000),
  created_at timestamptz not null default now()
);

-- Fast per-level leaderboard queries.
create index if not exists scores_level_time_idx  on public.scores (level, time_ms);
create index if not exists scores_level_death_idx on public.scores (level, deaths);

alter table public.scores enable row level security;

-- Anyone (anon key) may read the board.
drop policy if exists "scores_read" on public.scores;
create policy "scores_read" on public.scores
  for select using (true);

-- Anyone may submit a score. The CHECK constraints above sanitise the payload;
-- created_at/id are server-defaulted and cannot be spoofed by the client.
drop policy if exists "scores_insert" on public.scores;
create policy "scores_insert" on public.scores
  for insert with check (
    char_length(name) between 1 and 24
    and time_ms > 0 and time_ms < 3600000
    and deaths >= 0
  );

-- Note: this is an anonymous, best-effort board (no auth). For a hardened
-- leaderboard, move inserts behind an Edge Function that rate-limits by IP
-- and validates runs; the client adapter (SupabaseLeaderboard) would then POST
-- to that function instead of the table.
