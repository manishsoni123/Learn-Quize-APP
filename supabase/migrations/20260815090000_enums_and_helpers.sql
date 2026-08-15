-- Learn-Quize · 001 · Enums and shared helpers
--
-- Every later migration depends on the types declared here, so this file runs
-- first. gen_random_uuid() is built into Postgres 13+, so no extension needed.

-- ============================================================ enums

create type public.difficulty_level as enum ('easy', 'medium', 'hard');

create type public.question_kind as enum (
  'single_choice',   -- one correct option out of N
  'true_false',
  'code_output'      -- "what does this snippet print" — still one correct option
);

-- Nothing reaches a user until a human moves it to 'approved'.
create type public.content_status as enum (
  'draft',       -- AI-generated or bulk-imported, unreviewed
  'in_review',
  'approved',    -- live
  'rejected',
  'retired'      -- was live, pulled after a report
);

create type public.quiz_mode as enum (
  'practice',
  'timed_test',
  'rapid_fire',
  'daily_challenge',
  'weak_spots'
);

create type public.league_tier as enum ('bronze', 'silver', 'gold', 'platinum', 'diamond');

create type public.report_reason as enum (
  'wrong_answer', 'unclear', 'typo', 'outdated', 'duplicate', 'other'
);

-- ============================================================ helpers

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Cumulative XP to reach level n is 25 * n * (n - 1):
-- level 2 at 50, level 5 at 500, level 10 at 2,250, level 25 at 15,000.
-- Fast at the start so a first session feels like progress; steep later so a
-- high level still means something.
create or replace function public.level_for_xp(p_xp integer)
returns integer
language sql
immutable
parallel safe
as $$
  select greatest(1, floor((25 + sqrt(625 + 100 * greatest(p_xp, 0))) / 50)::integer);
$$;

create or replace function public.xp_for_level(p_level integer)
returns integer
language sql
immutable
parallel safe
as $$
  select (25 * greatest(p_level, 1) * (greatest(p_level, 1) - 1))::integer;
$$;

-- Spaced-repetition ladder. A right answer climbs one rung, a wrong answer
-- drops back to the bottom. Step 0 and 1 both mean "come back tomorrow".
--
-- Takes integer, not smallint: Postgres will not implicitly narrow an integer
-- when resolving a function call, so a smallint parameter would force a cast
-- at every call site.
create or replace function public.review_interval_days(p_step integer)
returns integer
language sql
immutable
parallel safe
as $$
  select (array[1, 3, 7, 21, 45, 90])[least(greatest(p_step, 1), 6)];
$$;
