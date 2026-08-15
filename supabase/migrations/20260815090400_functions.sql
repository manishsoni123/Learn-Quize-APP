-- Learn-Quize · 005 · Server-side game logic
--
-- Everything that awards XP lives here. The app submits *answers*; these
-- functions decide what they were worth. If scoring ran on the phone, someone
-- would decompile the APK and sit at rank 1 with fabricated points inside a
-- week — and retrofitting this later means deleting every leaderboard.
--
-- All functions are SECURITY DEFINER with an empty search_path, so they run
-- with owner rights against fully-qualified names only.

-- ============================================================ authorisation

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_staff from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ============================================================ start a session

-- p_question_count is integer rather than smallint on purpose: Postgres will
-- not implicitly narrow an integer literal when resolving a function call, so
-- a smallint parameter makes every caller write `10::smallint`.
create or replace function public.start_quiz_session(
  p_mode           public.quiz_mode,
  p_category_id    uuid    default null,
  p_question_count integer default 10
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_session uuid;
  v_limit   integer;
  v_picked  integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_question_count < 1 or p_question_count > 50 then
    raise exception 'question_count must be between 1 and 50' using errcode = '22023';
  end if;

  v_limit := case p_mode
               when 'timed_test' then p_question_count * 60   -- a minute each
               when 'rapid_fire' then 60                      -- 60s, all in
               else null                                      -- untimed
             end;

  insert into public.quiz_sessions (user_id, category_id, mode, question_count, time_limit_s)
  values (v_user, p_category_id, p_mode, p_question_count, v_limit)
  returning id into v_session;

  -- Question selection.
  --   weak_spots : only questions the user has seen and is currently getting
  --                wrong, or that are due for spaced review.
  --   everything : weighted random, preferring questions they have seen least.
  insert into public.session_questions (session_id, question_id, position)
  select v_session, chosen.id, (row_number() over ())::smallint
  from (
    select q.id
    from public.questions q
    left join public.user_question_stats s
           on s.question_id = q.id
          and s.user_id = v_user
    where q.status = 'approved'
      and (p_category_id is null or q.category_id = p_category_id)
      and (
        p_mode <> 'weak_spots'
        or (s.user_id is not null
            and (s.streak = 0 or s.next_review_on <= current_date))
      )
    order by
      case when p_mode = 'weak_spots'
           then coalesce(s.times_seen - s.times_correct, 0)
           else 0
      end desc,
      coalesce(s.times_seen, 0) asc,
      random()
    limit p_question_count
  ) chosen;

  get diagnostics v_picked = row_count;

  if v_picked = 0 then
    -- Roll the session back rather than leaving an empty one to confuse the
    -- history screen. Usually means an unseeded category or, for weak_spots,
    -- a user with nothing due — both worth telling the app about explicitly.
    delete from public.quiz_sessions where id = v_session;
    raise exception 'no questions available for this selection' using errcode = 'P0002';
  end if;

  -- A short session is fine; a session that claims 10 questions and serves 4
  -- would break the results screen.
  update public.quiz_sessions
     set question_count = v_picked
   where id = v_session;

  return v_session;
end;
$$;

-- ============================================================ submit an answer

-- Returns the verdict, the correct option, the XP actually awarded, and the
-- explanation. The client may already know the correct answer (it needs it for
-- instant feedback and offline play) — but only this function can move XP, and
-- it re-derives correctness from its own data.
create or replace function public.submit_answer(
  p_session_id  uuid,
  p_question_id uuid,
  p_option_id   uuid,
  p_time_ms     integer
)
returns table (
  is_correct        boolean,
  correct_option_id uuid,
  xp_awarded        integer,
  explanation       text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user       uuid := auth.uid();
  v_session    public.quiz_sessions%rowtype;
  v_question   public.questions%rowtype;
  v_correct_id uuid;
  v_correct    boolean;
  v_first_time boolean;
  v_fast       boolean;
  v_streak     integer;
  v_step       smallint;
  v_xp         integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_session
  from public.quiz_sessions
  where id = p_session_id
  for update;

  if not found or v_session.user_id <> v_user then
    raise exception 'session not found' using errcode = '42501';
  end if;

  if v_session.finished_at is not null then
    raise exception 'session already finished' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.session_questions
    where session_id = p_session_id and question_id = p_question_id
  ) then
    raise exception 'question was not served in this session' using errcode = '42501';
  end if;

  select * into v_question from public.questions where id = p_question_id;

  select o.id into v_correct_id
  from public.options o
  where o.question_id = p_question_id and o.is_correct
  limit 1;

  v_correct := p_option_id is not null and p_option_id = v_correct_id;

  select coalesce(s.ever_correct, false), coalesce(s.repetition_step, 0)
    into v_first_time, v_step
  from public.user_question_stats s
  where s.user_id = v_user and s.question_id = p_question_id;

  v_first_time := not coalesce(v_first_time, false);
  v_step       := coalesce(v_step, 0);

  -- Speed bonus: answered inside half the per-question allowance. Untimed
  -- modes never qualify, so Practice cannot be farmed for the multiplier.
  v_fast := v_correct
        and v_session.time_limit_s is not null
        and p_time_ms <= (v_session.time_limit_s::numeric / v_session.question_count) * 500;

  select p.current_streak into v_streak from public.profiles p where p.id = v_user;

  v_xp := case
    when not v_correct then 0
    else round(
      10
      * case v_question.difficulty
          when 'easy'   then 1.0
          when 'medium' then 1.5
          else               2.5
        end
      * case when v_fast then 1.25 else 1.0 end
      * least(1 + coalesce(v_streak, 0) * 0.02, 2.0)   -- caps at 2x on day 50
      -- Re-answering something already known pays 30%. Without this, the
      -- fastest route up the leaderboard is one easy question for six hours,
      -- and nobody learns anything doing it.
      * case when v_first_time then 1.0 else 0.3 end
    )::integer
  end;

  insert into public.answers (
    session_id, user_id, question_id, option_id, is_correct, time_ms, xp_awarded
  )
  values (
    p_session_id, v_user, p_question_id, p_option_id,
    v_correct, greatest(p_time_ms, 0), v_xp
  )
  on conflict (session_id, question_id) do nothing;

  if not found then
    raise exception 'question already answered in this session' using errcode = '23505';
  end if;

  -- Spaced repetition: right climbs a rung, wrong drops to the bottom.
  insert into public.user_question_stats as s (
    user_id, question_id, times_seen, times_correct, streak,
    repetition_step, next_review_on, last_seen_at, ever_correct
  )
  values (
    v_user, p_question_id, 1,
    case when v_correct then 1 else 0 end,
    case when v_correct then 1 else 0 end,
    case when v_correct then 1 else 0 end,
    current_date + public.review_interval_days(case when v_correct then 1 else 0 end),
    now(), v_correct
  )
  on conflict (user_id, question_id) do update set
    times_seen      = s.times_seen + 1,
    times_correct   = s.times_correct + case when v_correct then 1 else 0 end,
    streak          = case when v_correct then s.streak + 1 else 0 end,
    repetition_step = case when v_correct then least(s.repetition_step + 1, 6) else 0 end,
    next_review_on  = current_date + public.review_interval_days(
                        case when v_correct then least(s.repetition_step + 1, 6) else 0 end
                      ),
    last_seen_at    = now(),
    ever_correct    = s.ever_correct or v_correct;

  update public.quiz_sessions
     set answered_count = answered_count + 1,
         correct_count  = correct_count + case when v_correct then 1 else 0 end,
         xp_earned      = xp_earned + v_xp
   where id = p_session_id;

  -- Observed difficulty, for spotting badly-worded questions later.
  update public.questions
     set times_answered = times_answered + 1,
         times_correct  = times_correct + case when v_correct then 1 else 0 end
   where id = p_question_id;

  if v_xp > 0 then
    update public.profiles
       set xp    = xp + v_xp,
           level = public.level_for_xp(xp + v_xp)
     where id = v_user;

    perform public.add_league_xp(v_user, v_xp);
  end if;

  return query select v_correct, v_correct_id, v_xp, v_question.explanation;
end;
$$;

-- ============================================================ streaks

create or replace function public.touch_daily_streak(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz      text;
  v_last    date;
  v_streak  integer;
  v_freezes smallint;
  v_today   date;
begin
  select p.timezone, p.last_active_on, p.current_streak, p.streak_freezes
    into v_tz, v_last, v_streak, v_freezes
  from public.profiles p
  where p.id = p_user
  for update;

  -- Streaks are judged in the user's own day, not UTC. Getting this wrong
  -- means people in IST lose streaks at 5:30am for no visible reason.
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;

  if v_last = v_today then
    return v_streak;                                  -- already counted today
  elsif v_last = v_today - 1 then
    v_streak := v_streak + 1;                         -- consecutive
  elsif v_last = v_today - 2 and v_freezes > 0 then
    -- One missed day and a freeze in hand. Spend it. A broken streak is when
    -- most people quit for good, so this is worth the complexity.
    v_streak  := v_streak + 1;
    v_freezes := v_freezes - 1;
  else
    v_streak := 1;                                    -- broken, or first ever
  end if;

  update public.profiles
     set current_streak = v_streak,
         longest_streak = greatest(longest_streak, v_streak),
         streak_freezes = v_freezes,
         last_active_on = v_today
   where id = p_user;

  return v_streak;
end;
$$;

-- ============================================================ leagues

create or replace function public.add_league_xp(p_user uuid, p_xp integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week   date := date_trunc('week', current_date)::date;   -- Monday
  v_tier   public.league_tier;
  v_league uuid;
begin
  select l.id into v_league
  from public.league_members m
  join public.leagues l on l.id = m.league_id
  where m.user_id = p_user and l.week_start = v_week;

  if v_league is null then
    -- First XP of the week: place them in a room of their current tier,
    -- carried over from last week, defaulting to bronze.
    select coalesce(
      (select l.tier
         from public.league_members m
         join public.leagues l on l.id = m.league_id
        where m.user_id = p_user
        order by l.week_start desc
        limit 1),
      'bronze'::public.league_tier
    ) into v_tier;

    select l.id into v_league
    from public.leagues l
    where l.tier = v_tier
      and l.week_start = v_week
      and (select count(*) from public.league_members m where m.league_id = l.id) < 30
    order by l.room_no
    limit 1;

    if v_league is null then
      -- Two users can race here; the unique (tier, week_start, room_no)
      -- constraint makes the loser retry into the room the winner created.
      insert into public.leagues (tier, week_start, room_no)
      values (
        v_tier, v_week,
        coalesce((select max(room_no) + 1 from public.leagues
                   where tier = v_tier and week_start = v_week), 1)
      )
      on conflict (tier, week_start, room_no) do nothing
      returning id into v_league;

      if v_league is null then
        select l.id into v_league
        from public.leagues l
        where l.tier = v_tier and l.week_start = v_week
        order by l.room_no desc
        limit 1;
      end if;
    end if;

    insert into public.league_members (league_id, user_id)
    values (v_league, p_user)
    on conflict do nothing;
  end if;

  update public.league_members
     set xp_earned = xp_earned + p_xp
   where league_id = v_league and user_id = p_user;
end;
$$;

-- ============================================================ achievements

create or replace function public.award_achievements(p_user uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp       integer;
  v_level    integer;
  v_streak   integer;
  v_answered integer;
  v_sessions integer;
  a          record;
begin
  select p.xp, p.level, p.current_streak
    into v_xp, v_level, v_streak
  from public.profiles p where p.id = p_user;

  select count(*) into v_answered
  from public.answers where user_id = p_user;

  select count(*) into v_sessions
  from public.quiz_sessions
  where user_id = p_user and finished_at is not null;

  for a in
    select * from public.achievements ach
    where ach.is_active
      and not exists (
        select 1 from public.user_achievements ua
        where ua.user_id = p_user and ua.achievement_id = ach.id
      )
  loop
    if (a.rule_kind = 'total_xp'           and v_xp       >= a.rule_threshold)
    or (a.rule_kind = 'level_reached'      and v_level    >= a.rule_threshold)
    or (a.rule_kind = 'streak_days'        and v_streak   >= a.rule_threshold)
    or (a.rule_kind = 'questions_answered' and v_answered >= a.rule_threshold)
    or (a.rule_kind = 'sessions_completed' and v_sessions >= a.rule_threshold)
    then
      insert into public.user_achievements (user_id, achievement_id)
      values (p_user, a.id)
      on conflict do nothing;

      if a.xp_reward > 0 then
        update public.profiles
           set xp    = xp + a.xp_reward,
               level = public.level_for_xp(xp + a.xp_reward)
         where id = p_user;
      end if;

      return next a.slug;
    end if;
  end loop;
end;
$$;

-- ============================================================ finish a session

create or replace function public.finish_quiz_session(p_session_id uuid)
returns table (
  correct_count  smallint,
  answered_count smallint,
  question_count smallint,
  xp_earned      integer,
  new_level      integer,
  new_streak     integer,
  unlocked       text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_session  public.quiz_sessions%rowtype;
  v_streak   integer;
  v_level    integer;
  v_unlocked text[];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.quiz_sessions
     set finished_at = coalesce(finished_at, now())
   where id = p_session_id and user_id = v_user
  returning * into v_session;

  if not found then
    raise exception 'session not found' using errcode = '42501';
  end if;

  v_streak := public.touch_daily_streak(v_user);

  select coalesce(array_agg(s), '{}')
    into v_unlocked
  from public.award_achievements(v_user) s;

  select p.level into v_level from public.profiles p where p.id = v_user;

  return query
  select v_session.correct_count,
         v_session.answered_count,
         v_session.question_count,
         v_session.xp_earned,
         v_level,
         v_streak,
         v_unlocked;
end;
$$;
