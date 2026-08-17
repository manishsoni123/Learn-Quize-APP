-- Learn-Quize · 020 · Session lifecycle integrity
--
--   1. start_quiz_session only accepts the modes the product actually offers.
--      It previously accepted any quiz_mode value — a raw RPC call could
--      create a "survival" row that rendered in history and counted toward
--      the leaderboard without any of that mode's rules applying.
--
--   2. Starting a quiz closes out the caller's previous unfinished focus
--      sessions (ludo already did this for matches; focus never did).
--      Zero-answer abandonments are deleted outright so they never clutter
--      history; partially-answered ones are closed so their answers count.
--
--   3. finish_quiz_session becomes idempotent and stops paying for nothing.
--      Before: a second call re-ran record_run (double-counting
--      mode_records.runs), and a start-then-finish with zero answers still
--      touched the daily streak and could unlock session-count badges —
--      streaks and badges were farmable without answering a question.
--
--   4. Indexes for the two hot finished-session scans: the leaderboard's
--      weekly aggregate and the history screen's per-user ordering. Both
--      were sequential scans of quiz_sessions.

-- ------------------------------------------------------ start_quiz_session

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

  -- The only modes the product offers. Arcade modes have their own (sealed)
  -- entry points; daily_challenge has no generator; rapid_fire was retired.
  if p_mode not in ('practice', 'timed_test', 'weak_spots') then
    raise exception 'mode % is not available', p_mode using errcode = '22023';
  end if;

  if p_question_count < 1 or p_question_count > 50 then
    raise exception 'question_count must be between 1 and 50' using errcode = '22023';
  end if;

  -- Close out anything the user walked away from. Scoped by mode to the
  -- sessions this function creates — arcade/ludo rows manage their own
  -- lifecycle, and `state` is no discriminator: submit_answer leaves an empty
  -- jsonb object on focus sessions too. Delete the never-answered ones, close
  -- the partially-answered.
  delete from public.quiz_sessions
   where user_id = v_user and finished_at is null
     and mode in ('practice', 'timed_test', 'weak_spots')
     and answered_count = 0;

  update public.quiz_sessions
     set finished_at = now()
   where user_id = v_user and finished_at is null
     and mode in ('practice', 'timed_test', 'weak_spots');

  v_limit := case p_mode
               when 'timed_test' then p_question_count * 60   -- a minute each
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

-- ----------------------------------------------------- finish_quiz_session

create or replace function public.finish_quiz_session(p_session_id uuid)
returns table (
  correct_count  smallint,
  answered_count smallint,
  question_count smallint,
  xp_earned      integer,
  new_level      integer,
  new_streak     integer,
  unlocked       text[],
  run            jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_session  public.quiz_sessions%rowtype;
  v_already  boolean;
  v_streak   integer;
  v_level    integer;
  v_unlocked text[];
  v_run      jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_session
  from public.quiz_sessions
  where id = p_session_id and user_id = v_user
  for update;

  if not found then
    raise exception 'session not found' using errcode = '42501';
  end if;

  v_already := v_session.finished_at is not null;

  if not v_already then
    if v_session.answered_count = 0 then
      -- Nothing was answered: erase the session rather than recording a 0/0
      -- row in history. The caller still gets a zeros row back so the client
      -- can navigate to results and away.
      delete from public.quiz_sessions where id = p_session_id;
      v_session.finished_at := now();
    else
      update public.quiz_sessions
         set finished_at = now()
       where id = p_session_id
      returning * into v_session;
    end if;
  end if;

  if not v_already and v_session.answered_count > 0 then
    -- Before achievements, so a badge for "bank 500 XP in one ladder run" can
    -- read a record that already exists.
    v_run := public.record_run(p_session_id);

    v_streak := public.touch_daily_streak(v_user);

    select coalesce(array_agg(s), '{}')
      into v_unlocked
    from public.award_achievements(v_user) s;
  else
    -- Re-finish or zero answers: report state, move nothing. A second call
    -- must not re-count a run, and closing an untouched session must not
    -- feed the streak or the session-count badges.
    v_run      := null;
    v_unlocked := '{}';
    select p.current_streak into v_streak
    from public.profiles p where p.id = v_user;
  end if;

  select p.level into v_level from public.profiles p where p.id = v_user;

  return query
  select v_session.correct_count,
         v_session.answered_count,
         v_session.question_count,
         v_session.xp_earned,
         v_level,
         v_streak,
         v_unlocked,
         v_run;
end;
$$;

-- ------------------------------------------------------------------ indexes

-- The leaderboard's weekly aggregate: filters on finished_at and scans wide.
create index if not exists quiz_sessions_finished_idx
  on public.quiz_sessions (finished_at desc)
  where finished_at is not null;

-- The history screen: this user's finished sessions, newest first. The
-- existing quiz_sessions_user_idx orders by started_at, so history sorted.
create index if not exists quiz_sessions_user_finished_idx
  on public.quiz_sessions (user_id, finished_at desc)
  where finished_at is not null;
