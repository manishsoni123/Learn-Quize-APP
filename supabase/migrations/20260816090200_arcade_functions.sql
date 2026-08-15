-- Learn-Quize · 009 · Arcade game logic
--
-- Focus quizzes pick their whole question set at start_quiz_session() and lock
-- it in session_questions. That lock is the anti-cheat model: a client cannot
-- submit an answer for a question it was never served.
--
-- Survival has no set to pick — it runs until you die. So arcade streams
-- instead: next_question() picks one, appends it to session_questions, and
-- returns it. The lock is untouched; the server still decides what was served.
-- Adaptive difficulty falls out of this almost free, because the server now
-- chooses each question knowing how the run is going.

-- ============================================================ start a run

create or replace function public.start_arcade_run(
  p_mode_slug   text,
  p_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_mode    public.game_modes%rowtype;
  v_level   integer;
  v_session uuid;
  v_state   jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_mode
  from public.game_modes
  where slug = p_mode_slug and lane = 'arcade' and is_active;

  if not found then
    raise exception 'unknown arcade mode %', p_mode_slug using errcode = 'P0002';
  end if;

  select p.level into v_level from public.profiles p where p.id = v_user;

  if coalesce(v_level, 1) < v_mode.min_level then
    raise exception 'mode % unlocks at level %', p_mode_slug, v_mode.min_level
      using errcode = '42501';
  end if;

  -- Refuse to start a run that cannot be played. Without this the player gets
  -- a countdown, an empty screen, and no idea the category was simply empty.
  if not exists (
    select 1 from public.questions q
    where q.status = 'approved'
      and (p_category_id is null or q.category_id = p_category_id)
  ) then
    raise exception 'no questions available for this selection' using errcode = 'P0002';
  end if;

  -- The slug is carried in state so submit_answer() can find this mode's rules
  -- without a second lookup path. quiz_sessions.mode stays the enum, because
  -- everything downstream — history, stats, leagues — already reads that.
  v_state := jsonb_build_object('slug', v_mode.slug, 'run', 0);

  if v_mode.slug = 'survival' then
    v_state := v_state || jsonb_build_object(
      'lives', coalesce((v_mode.rules ->> 'lives')::integer, 3)
    );
  elsif v_mode.slug = 'ladder' then
    v_state := v_state || jsonb_build_object('rung', 0, 'unbanked', 0, 'banked', 0);
  end if;

  insert into public.quiz_sessions (
    user_id, category_id, mode, question_count, time_limit_s, state
  )
  values (
    v_user, p_category_id, v_mode.mode, 0,
    (v_mode.rules ->> 'duration_s')::integer,   -- null for untimed modes
    v_state
  )
  returning id into v_session;

  return v_session;
end;
$$;

-- ============================================================ serve one question

-- Returns the question and its options as a single jsonb object — the same
-- shape the Focus player builds client-side from its embedded select, so both
-- lanes can hand the identical object to the same question renderer.
create or replace function public.next_question(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_session  public.quiz_sessions%rowtype;
  v_slug     text;
  v_served   integer;
  v_rung     integer;
  v_target   public.difficulty_level;
  v_recent   numeric;
  v_question public.questions%rowtype;
  v_position smallint;
  v_result   jsonb;
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
    raise exception 'run already over' using errcode = '22023';
  end if;

  v_slug   := v_session.state ->> 'slug';
  v_served := coalesce((v_session.state ->> 'run')::integer, 0);
  v_rung   := coalesce((v_session.state ->> 'rung')::integer, 0);

  -- Difficulty. Survival and Ladder escalate on a fixed curve because the
  -- climb *is* the game — the player should feel it getting harder. Everything
  -- else adapts to recent accuracy, aiming to sit near 80% success, which is
  -- roughly where challenge stops being boring and starts being frustrating.
  if v_slug = 'survival' then
    v_target := case
                  when v_served < 5  then 'easy'
                  when v_served < 12 then 'medium'
                  else                    'hard'
                end::public.difficulty_level;
  elsif v_slug = 'ladder' then
    v_target := case
                  when v_rung < 3 then 'easy'
                  when v_rung < 7 then 'medium'
                  else                 'hard'
                end::public.difficulty_level;
  else
    select avg(case when a.is_correct then 1.0 else 0.0 end)
      into v_recent
    from (
      select a2.is_correct
      from public.answers a2
      where a2.user_id = v_user
      order by a2.answered_at desc
      limit 20
    ) a;

    v_target := case
                  when v_recent is null   then 'easy'
                  when v_recent >= 0.85   then 'hard'
                  when v_recent >= 0.70   then 'medium'
                  else                         'easy'
                end::public.difficulty_level;
  end if;

  -- Prefer the target difficulty and questions this user has seen least, but
  -- never hard-fail on difficulty: a category with no hard questions should
  -- keep playing, not end the run with an error.
  select q.* into v_question
  from public.questions q
  left join public.user_question_stats s
         on s.question_id = q.id and s.user_id = v_user
  where q.status = 'approved'
    and (v_session.category_id is null or q.category_id = v_session.category_id)
    and not exists (
      select 1 from public.session_questions sq
      where sq.session_id = p_session_id and sq.question_id = q.id
    )
  order by (q.difficulty = v_target) desc,
           coalesce(s.times_seen, 0) asc,
           random()
  limit 1;

  -- The bank is exhausted. Not an error — the run simply ends, and the caller
  -- shows the results screen rather than a failure.
  if not found then
    return null;
  end if;

  v_position := (v_served + 1)::smallint;

  insert into public.session_questions (session_id, question_id, position)
  values (p_session_id, v_question.id, v_position);

  update public.quiz_sessions
     set question_count = v_position,
         state          = state || jsonb_build_object('run', v_position)
   where id = p_session_id;

  select jsonb_build_object(
    'id',            v_question.id,
    'position',      v_position,
    'body',          v_question.body,
    'code_snippet',  v_question.code_snippet,
    'code_language', v_question.code_language,
    'difficulty',    v_question.difficulty,
    'kind',          v_question.kind,
    'explanation',   v_question.explanation,
    'options',       coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'id', o.id, 'body', o.body,
                  'is_correct', o.is_correct, 'sort_order', o.sort_order
                ) order by o.sort_order)
       from public.options o where o.question_id = v_question.id),
      '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ============================================================ mode rules

-- Applies one answer to the run state and reports whether the run is over.
-- Internal: EXECUTE is revoked from every client role in the next migration,
-- because this is the function that decides how many lives you have left.
create or replace function public.apply_mode_rules(
  p_session_id uuid,
  p_correct    boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state    jsonb;
  v_slug     text;
  v_rules    jsonb;
  v_lives    integer;
  v_rung     integer;
  v_rungs    jsonb;
  v_over     boolean := false;
begin
  select s.state into v_state
  from public.quiz_sessions s
  where s.id = p_session_id;

  v_slug := v_state ->> 'slug';

  if v_slug is null then
    -- A Focus quiz. No run state, nothing to apply.
    return jsonb_build_object('run_over', false);
  end if;

  select gm.rules into v_rules from public.game_modes gm where gm.slug = v_slug;

  if v_slug = 'survival' then
    v_lives := coalesce((v_state ->> 'lives')::integer, 3);
    if not p_correct then
      v_lives := v_lives - 1;
    end if;
    v_over  := v_lives <= 0;
    v_state := v_state || jsonb_build_object('lives', greatest(v_lives, 0));

  elsif v_slug = 'ladder' then
    v_rung  := coalesce((v_state ->> 'rung')::integer, 0);
    v_rungs := coalesce(v_rules -> 'rungs', '[]'::jsonb);

    if p_correct then
      v_rung := least(v_rung + 1, jsonb_array_length(v_rungs));
      v_state := v_state || jsonb_build_object(
        'rung',     v_rung,
        'unbanked', coalesce((v_rungs -> (v_rung - 1))::text::integer, 0)
      );
      -- Cleared the top rung: the run ends won, and banking is automatic.
      v_over := v_rung >= jsonb_array_length(v_rungs);
    else
      -- The whole point of the mode. Everything unbanked is gone.
      v_state := v_state || jsonb_build_object('unbanked', 0);
      v_over  := true;
    end if;
  end if;

  update public.quiz_sessions set state = v_state where id = p_session_id;

  return v_state || jsonb_build_object('run_over', v_over);
end;
$$;

-- ============================================================ submit an answer

-- Replaces the four-column version. The return type changes, which CREATE OR
-- REPLACE cannot do, so the old one is dropped — and because the signature
-- gains p_response, the grant is reissued in the next migration.
--
-- p_response is unused today. It is the seat for the formats that cannot be
-- expressed as "one chosen option": the ordering of a Parsons problem, the
-- pairs of a matching grid. Adding it now means the later formats do not force
-- a second drop-and-regrant of the single most security-sensitive function in
-- the schema.
drop function if exists public.submit_answer(uuid, uuid, uuid, integer);

create or replace function public.submit_answer(
  p_session_id  uuid,
  p_question_id uuid,
  p_option_id   uuid,
  p_time_ms     integer,
  p_response    jsonb default null
)
returns table (
  is_correct        boolean,
  correct_option_id uuid,
  xp_awarded        integer,
  explanation       text,
  run_state         jsonb
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
  v_credit     integer;
  v_defer      boolean := false;
  v_slug       text;
  v_run        jsonb;
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
  --
  -- question_count grows as an arcade run streams, so this denominator moves
  -- during a run rather than being fixed. That is the intended reading: the
  -- allowance is "the clock divided by what you have played so far".
  v_fast := v_correct
        and v_session.time_limit_s is not null
        and v_session.question_count > 0
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

  -- Ladder pays nothing per answer. Its payout is the rung curve, banked or
  -- lost as a lump — crediting XP per question as well would mean a bust still
  -- paid out, which is the one thing the mode must not do.
  v_slug := v_session.state ->> 'slug';
  if v_slug is not null then
    select coalesce((gm.rules ->> 'defer_xp')::boolean, false)
      into v_defer
    from public.game_modes gm where gm.slug = v_slug;
  end if;

  v_credit := case when coalesce(v_defer, false) then 0 else v_xp end;

  insert into public.answers (
    session_id, user_id, question_id, option_id, is_correct, time_ms, xp_awarded
  )
  values (
    p_session_id, v_user, p_question_id, p_option_id,
    v_correct, greatest(p_time_ms, 0), v_credit
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
         xp_earned      = xp_earned + v_credit
   where id = p_session_id;

  -- Observed difficulty, for spotting badly-worded questions later.
  update public.questions
     set times_answered = times_answered + 1,
         times_correct  = times_correct + case when v_correct then 1 else 0 end
   where id = p_question_id;

  if v_credit > 0 then
    update public.profiles
       set xp    = xp + v_credit,
           level = public.level_for_xp(xp + v_credit)
     where id = v_user;

    perform public.add_league_xp(v_user, v_credit);
  end if;

  v_run := public.apply_mode_rules(p_session_id, v_correct);

  return query select v_correct, v_correct_id, v_credit, v_question.explanation, v_run;
end;
$$;

-- ============================================================ bank the ladder

-- Takes what is riding on the run, pays it, and ends the session. This is the
-- only path by which ladder XP ever reaches a profile.
create or replace function public.bank_ladder(p_session_id uuid)
returns table (
  banked integer,
  rung   integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_session  public.quiz_sessions%rowtype;
  v_unbanked integer;
  v_rung     integer;
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

  if v_session.state ->> 'slug' is distinct from 'ladder' then
    raise exception 'not a ladder run' using errcode = '22023';
  end if;

  if v_session.finished_at is not null then
    raise exception 'run already over' using errcode = '22023';
  end if;

  v_unbanked := coalesce((v_session.state ->> 'unbanked')::integer, 0);
  v_rung     := coalesce((v_session.state ->> 'rung')::integer, 0);

  if v_unbanked > 0 then
    update public.profiles
       set xp    = xp + v_unbanked,
           level = public.level_for_xp(xp + v_unbanked)
     where id = v_user;

    perform public.add_league_xp(v_user, v_unbanked);
  end if;

  update public.quiz_sessions
     set xp_earned = xp_earned + v_unbanked,
         state     = state || jsonb_build_object('banked', v_unbanked, 'unbanked', 0)
   where id = p_session_id;

  return query select v_unbanked, v_rung;
end;
$$;

-- ============================================================ records

-- What a run is scored on differs per mode, and each is the number that run
-- was actually about. Internal — called by finish_quiz_session only.
create or replace function public.record_run(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.quiz_sessions%rowtype;
  v_slug    text;
  v_value   integer;
  v_week    date;
  v_before  integer;
begin
  select * into v_session from public.quiz_sessions where id = p_session_id;

  v_slug := v_session.state ->> 'slug';
  if v_slug is null then
    return null;   -- a Focus quiz; nothing to record
  end if;

  v_value := case v_slug
               when 'ladder'   then coalesce((v_session.state ->> 'banked')::integer, 0)
               when 'survival' then v_session.correct_count
               else                 v_session.correct_count
             end;

  v_week := date_trunc('week', now())::date;

  -- Read the previous best before writing, so the results screen can say
  -- "personal best" honestly. Beating your own number is the single most
  -- reliable good feeling this app can hand someone, and it is worth one
  -- extra select to get it right.
  select r.best_value into v_before
  from public.mode_records r
  where r.user_id = v_session.user_id and r.mode_slug = v_slug and r.week_start = v_week;

  insert into public.mode_records (user_id, mode_slug, week_start, best_value, runs)
  values (v_session.user_id, v_slug, v_week, v_value, 1)
  on conflict (user_id, mode_slug, week_start) do update set
    -- greatest(), not overwrite: a bad run must never erase a good week.
    best_value  = greatest(public.mode_records.best_value, excluded.best_value),
    runs        = public.mode_records.runs + 1,
    achieved_at = case
                    when excluded.best_value > public.mode_records.best_value
                    then now()
                    else public.mode_records.achieved_at
                  end;

  return jsonb_build_object(
    'slug',      v_slug,
    'value',     v_value,
    'best',      greatest(coalesce(v_before, 0), v_value),
    'is_record', v_value > coalesce(v_before, 0)
  );
end;
$$;

-- ============================================================ finish a run

-- Replaces the seven-column version so a finished run can report what it was
-- worth and whether it beat anything. Return type changes, so this is a drop
-- and recreate, and the grant is reissued in the next migration.
drop function if exists public.finish_quiz_session(uuid);

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
  v_streak   integer;
  v_level    integer;
  v_unlocked text[];
  v_run      jsonb;
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

  -- Before achievements, so a badge for "bank 500 XP in one ladder run" can
  -- read a record that already exists.
  v_run := public.record_run(p_session_id);

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
         v_unlocked,
         v_run;
end;
$$;
