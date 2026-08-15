-- Learn-Quize · 004 · Achievements, daily challenges, leagues, reports

-- ============================================================ achievements

create table public.achievements (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null,
  icon        text,
  xp_reward   integer not null default 0 check (xp_reward >= 0),

  -- Badges are data, not code. award_achievements() evaluates these rules, so
  -- adding a new badge is an INSERT and not an app release.
  rule_kind text not null check (rule_kind in (
    'total_xp',
    'level_reached',
    'streak_days',
    'questions_answered',
    'sessions_completed'
  )),
  rule_threshold integer not null check (rule_threshold > 0),

  sort_order smallint not null default 0,
  is_active  boolean  not null default true,
  created_at timestamptz not null default now()
);

create table public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index user_achievements_user_idx
  on public.user_achievements (user_id, earned_at desc);

-- ============================================================ daily challenge

-- Same five questions for everyone on a given day. That is what makes the
-- daily board a fair comparison rather than a measure of who got lucky.
create table public.daily_challenges (
  on_date    date primary key,
  track_id   uuid references public.tracks(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.daily_challenge_questions (
  on_date     date not null references public.daily_challenges(on_date) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position    smallint not null,
  primary key (on_date, question_id)
);

-- ============================================================ leagues

-- Weekly rooms of ~30. Competing against 30 people at your own level beats a
-- global board where you are permanently rank 40,000.
create table public.leagues (
  id         uuid primary key default gen_random_uuid(),
  tier       public.league_tier not null,
  week_start date not null,               -- Monday
  room_no    integer not null check (room_no > 0),
  created_at timestamptz not null default now(),
  unique (tier, week_start, room_no)
);

create table public.league_members (
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  xp_earned  integer not null default 0 check (xp_earned >= 0),
  final_rank integer,
  joined_at  timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- The board itself: one room, ordered.
create index league_members_board_idx on public.league_members (league_id, xp_earned desc);
create index league_members_user_idx  on public.league_members (user_id);

-- ============================================================ reports

-- Users find wrong answers faster than any reviewer will. Make it one tap.
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  reason      public.report_reason not null,
  detail      text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- The reviewer's inbox.
create index reports_open_idx
  on public.reports (created_at)
  where resolved_at is null;

create index reports_question_idx on public.reports (question_id);
