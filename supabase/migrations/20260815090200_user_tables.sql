-- Learn-Quize · 003 · Users, sessions, answers, learning state

-- ============================================================ profiles

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  username     text unique,
  display_name text,
  avatar_url   text,

  -- Progress. None of these columns are client-writable — see migration 006,
  -- which revokes UPDATE and re-grants it column by column. They move only
  -- through the SECURITY DEFINER functions in migration 005.
  xp             integer  not null default 0 check (xp >= 0),
  level          integer  not null default 1 check (level >= 1),
  current_streak integer  not null default 0 check (current_streak >= 0),
  longest_streak integer  not null default 0 check (longest_streak >= 0),
  streak_freezes smallint not null default 2 check (streak_freezes >= 0),
  last_active_on date,

  -- Preferences
  primary_track_id uuid references public.tracks(id) on delete set null,
  daily_goal_xp    integer not null default 50 check (daily_goal_xp > 0),
  timezone         text    not null default 'UTC',

  is_staff   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_]{3,24}$')
);

-- Leaderboards sort by XP constantly.
create index profiles_xp_idx on public.profiles (xp desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.tg_set_updated_at();

-- A row in auth.users without a matching profile would break every join in
-- the app, so create it in the same transaction as the signup.
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.tg_handle_new_user();

-- ============================================================ quiz sessions

create table public.quiz_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  mode        public.quiz_mode not null,

  question_count smallint not null check (question_count between 1 and 50),
  time_limit_s   integer,          -- null for untimed modes

  started_at  timestamptz not null default now(),
  finished_at timestamptz,

  correct_count  smallint not null default 0,
  answered_count smallint not null default 0,
  xp_earned      integer  not null default 0,

  client_version text
);

create index quiz_sessions_user_idx on public.quiz_sessions (user_id, started_at desc);

-- The question set is fixed the moment a session starts. Without this, a
-- client could submit answers for questions it was never served and farm XP
-- off whichever easy question it liked best.
create table public.session_questions (
  session_id  uuid not null references public.quiz_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position    smallint not null,
  primary key (session_id, question_id)
);

create unique index session_questions_position_idx
  on public.session_questions (session_id, position);

-- ============================================================ answers

create table public.answers (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.quiz_sessions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,

  option_id  uuid references public.options(id) on delete set null, -- null = skipped or timed out
  is_correct boolean not null,
  time_ms    integer not null check (time_ms >= 0),
  xp_awarded integer not null default 0,

  answered_at timestamptz not null default now(),

  -- One answer per question per session. This is the anti-replay guarantee.
  unique (session_id, question_id)
);

create index answers_user_idx     on public.answers (user_id, answered_at desc);
create index answers_question_idx on public.answers (question_id);

-- ============================================================ learning state

-- The part that turns a quiz app into something that changes what someone
-- knows. Drives both Weak Spots and the spaced-repetition queue.
create table public.user_question_stats (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,

  times_seen      integer  not null default 0,
  times_correct   integer  not null default 0,
  streak          integer  not null default 0,  -- consecutive correct answers
  repetition_step smallint not null default 0,  -- rung on the interval ladder
  next_review_on  date,
  last_seen_at    timestamptz,

  -- Gates the first-time XP multiplier. Once true, re-answering pays 30%.
  ever_correct boolean not null default false,

  primary key (user_id, question_id)
);

create index user_question_stats_due_idx
  on public.user_question_stats (user_id, next_review_on)
  where next_review_on is not null;
