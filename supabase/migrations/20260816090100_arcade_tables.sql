-- Learn-Quize · 008 · Arcade tables
--
-- Arcade runs differ from Focus quizzes in one structural way: they carry
-- state that persists across answers. Lives remaining, which rung you are on,
-- how much XP is riding on the next question. All of it lives here, on the
-- server, because it is exactly the state a client would rewrite first.

-- ============================================================ run state

-- quiz_sessions has SELECT granted to authenticated and no UPDATE grant at
-- all (20260815090500_rls_and_grants.sql:104), so this column is unwritable
-- from a client by construction. It moves only through the SECURITY DEFINER
-- functions in the next migration.
--
-- Shape depends on the mode:
--   survival  {"lives": 2, "run": 14}
--   ladder    {"rung": 6, "unbanked": 130, "banked": 0}
--   rapid_fire {}
alter table public.quiz_sessions
  add column if not exists state jsonb not null default '{}'::jsonb;

-- question_count was `check (question_count between 1 and 50)`, which assumed
-- every session knows its length up front. An arcade run does not: it starts
-- at zero questions served and grows one at a time until the player dies or
-- the clock runs out, so both ends of that range are wrong now.
--
-- The upper bound stays finite deliberately. It is not a gameplay limit — the
-- question bank runs dry long before 500 — it is a backstop against a bug in
-- next_question() appending rows forever.
alter table public.quiz_sessions
  drop constraint if exists quiz_sessions_question_count_check;

alter table public.quiz_sessions
  add constraint quiz_sessions_question_count_check
  check (question_count between 0 and 500);

-- ============================================================ mode catalogue

-- Modes are rows, not a hardcoded CASE. Lives, durations and the rung payout
-- curve are the numbers that get tuned constantly once real people play, and
-- a migration per tweak is a tax nobody pays twice — they hardcode it in the
-- app instead, and then the server and client disagree about the rules.
--
-- Behaviour still lives in code. This table holds only the parameters.
create table public.game_modes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  mode        public.quiz_mode not null,
  name        text not null,
  tagline     text not null,

  -- 'focus' is the calm study lane, 'arcade' is the game lane. The app renders
  -- them with entirely different palettes, so this drives more than sorting.
  lane        text not null check (lane in ('focus', 'arcade')),

  -- Mode parameters. Read by the functions, never by the client for anything
  -- that matters — the server is still the authority on every rule in here.
  --   survival   {"lives": 3, "defer_xp": false}
  --   ladder     {"rungs": [...], "defer_xp": true}
  --   rapid_fire {"duration_s": 60, "defer_xp": false}
  rules       jsonb not null default '{}'::jsonb,

  accent_hex  text not null default '#FFB33C'
              check (accent_hex ~ '^#[0-9A-Fa-f]{6}$'),
  icon        text,
  min_level   integer not null default 1 check (min_level >= 1),
  is_active   boolean not null default true,
  sort_order  smallint not null default 0
);

create index game_modes_lane_idx on public.game_modes (lane, sort_order)
  where is_active;

-- ============================================================ records

-- One row per user per mode per week. All-time best is max() over the rows,
-- so this single table serves both the weekly board and the personal best
-- without a second place for the same number to drift out of sync.
--
-- What best_value counts depends on the mode, and each is the number that run
-- was actually about:
--   ladder     XP banked
--   survival   correct answers before the last life went
--   rapid_fire correct answers inside the 60 seconds
create table public.mode_records (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  mode_slug   text not null references public.game_modes(slug) on delete cascade,
  week_start  date not null,

  best_value  integer not null default 0 check (best_value >= 0),
  runs        integer not null default 0 check (runs >= 0),
  achieved_at timestamptz not null default now(),

  primary key (user_id, mode_slug, week_start)
);

create index mode_records_board_idx
  on public.mode_records (mode_slug, week_start, best_value desc);

-- ============================================================ future formats

-- Kind-specific data for the formats that cannot be expressed as a list of
-- options: the shuffled lines of a Parsons problem, which line holds the bug,
-- the pairs in a matching grid. Null for single_choice and code_output, which
-- is every question that exists today.
--
-- Added now, unused now. The alternative is a second migration against the
-- largest table in the schema at the exact moment the admin panel needs it.
alter table public.questions
  add column if not exists payload jsonb;
