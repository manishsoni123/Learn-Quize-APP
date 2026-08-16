-- Learn-Quize · 015 · Ludo entry points
--
-- A match is a quiz_session whose state is a board, so everything already
-- built keeps working unchanged: next_question() serves each turn's question,
-- submit_answer() scores it and awards XP, spaced repetition and league XP
-- carry on. The only new idea is that a correct answer buys a die roll.

-- ============================================================ start / resume

-- The unfinished match, if there is one. Matches run long enough that closing
-- the app mid-game is normal rather than exceptional, so resuming has to be
-- the default rather than a feature.
create or replace function public.active_ludo_match()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.quiz_sessions s
  where s.user_id = auth.uid()
    and s.mode = 'ludo'
    and s.finished_at is null
    and s.state ->> 'winner' is null
  order by s.started_at desc
  limit 1;
$$;

create or replace function public.start_ludo_match(p_category_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_mode      public.game_modes%rowtype;
  v_level     integer;
  v_available integer;
  v_needed    integer;
  v_session   uuid;
  v_state     jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_mode from public.game_modes where slug = 'ludo' and is_active;
  if not found then
    raise exception 'ludo is not available' using errcode = 'P0002';
  end if;

  select p.level into v_level from public.profiles p where p.id = v_user;
  if coalesce(v_level, 1) < v_mode.min_level then
    raise exception 'ludo unlocks at level %', v_mode.min_level using errcode = '42501';
  end if;

  -- A full match asks the human 30-50 questions, and a question cannot repeat
  -- inside a session. Starting on a category with ten in it produces a game
  -- that silently runs out of things to ask halfway through, which is far
  -- worse to debug than being told no.
  v_needed := coalesce((v_mode.rules ->> 'min_questions')::integer, 30);

  select count(*) into v_available
  from public.questions q
  where q.status = 'approved'
    and (p_category_id is null or q.category_id = p_category_id);

  if v_available < v_needed then
    raise exception
      'ludo needs at least % approved questions here, found %', v_needed, v_available
      using errcode = 'P0002';
  end if;

  -- Only one match at a time. Abandoning the previous one explicitly beats
  -- leaving a drawer of half-played boards nobody will ever return to.
  update public.quiz_sessions
     set finished_at = now()
   where user_id = v_user and mode = 'ludo' and finished_at is null;

  -- Seat 0 is always the human. The bots climb in accuracy so the table has a
  -- weak player to catch and a strong one to chase, which is a better game
  -- than three opponents of identical strength.
  v_state := jsonb_build_object(
    'slug',         'ludo',
    'turn',         0,
    'pending_roll', null,
    'sixes',        0,
    'winner',       null,
    'players', jsonb_build_array(
      jsonb_build_object('seat', 0, 'kind', 'human', 'tokens', jsonb_build_array(-1, -1, -1, -1)),
      jsonb_build_object('seat', 1, 'kind', 'bot', 'accuracy', 0.60, 'name', 'Ravi',
                         'tokens', jsonb_build_array(-1, -1, -1, -1)),
      jsonb_build_object('seat', 2, 'kind', 'bot', 'accuracy', 0.72, 'name', 'Priya',
                         'tokens', jsonb_build_array(-1, -1, -1, -1)),
      jsonb_build_object('seat', 3, 'kind', 'bot', 'accuracy', 0.85, 'name', 'Meera',
                         'tokens', jsonb_build_array(-1, -1, -1, -1))
    )
  );

  insert into public.quiz_sessions (
    user_id, category_id, mode, question_count, time_limit_s, state
  )
  values (v_user, p_category_id, 'ludo', 0, null, v_state)
  returning id into v_session;

  return v_session;
end;
$$;

-- ============================================================ take a turn

-- Applies the human's move, then plays every bot until it is their turn again.
-- p_token null means "I cannot move" — a wrong answer, three sixes, or a roll
-- with no legal move.
create or replace function public.ludo_move(
  p_session_id uuid,
  p_token      integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := auth.uid();
  v_session public.quiz_sessions%rowtype;
  v_state   jsonb;
  v_roll    integer;
  v_res     jsonb;
  v_bots    jsonb;
  v_log     jsonb := '[]'::jsonb;
  v_extra   boolean := false;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_session
  from public.quiz_sessions
  where id = p_session_id
  for update;

  if not found or v_session.user_id <> v_user then
    raise exception 'match not found' using errcode = '42501';
  end if;

  v_state := v_session.state;

  if v_state ->> 'slug' is distinct from 'ludo' then
    raise exception 'not a ludo match' using errcode = '22023';
  end if;

  if v_state ->> 'winner' is not null then
    raise exception 'match already won' using errcode = '22023';
  end if;

  if (v_state ->> 'turn')::integer <> 0 then
    raise exception 'not your turn' using errcode = '22023';
  end if;

  v_roll := (v_state ->> 'pending_roll')::integer;

  if p_token is not null then
    if v_roll is null then
      -- No roll was earned, so there is nothing to spend. Rejecting rather
      -- than ignoring, because a client that gets here is either broken or
      -- trying it on.
      raise exception 'no roll to move with' using errcode = '22023';
    end if;

    v_res   := public.ludo_apply_move(v_state, 0, p_token, v_roll);
    v_state := v_res -> 'state';
    v_extra := (v_res ->> 'extra')::boolean;

    v_log := jsonb_build_array(jsonb_build_object(
      'seat', 0, 'roll', v_roll, 'event', 'move', 'move', v_res -> 'move'
    ));
  end if;

  -- Spent either way: the next roll needs another correct answer.
  v_state := jsonb_set(v_state, '{pending_roll}', 'null'::jsonb);

  if v_state ->> 'winner' is null then
    if v_extra then
      -- Another turn means another question, not another free roll. Knowledge
      -- stays the thing that moves a token.
      v_state := jsonb_set(v_state, '{sixes}', to_jsonb(0));
    else
      v_state := jsonb_set(v_state, '{turn}',  to_jsonb(1));
      v_state := jsonb_set(v_state, '{sixes}', to_jsonb(0));

      v_bots  := public.ludo_bot_turns(v_state);
      v_state := v_bots -> 'state';
      v_log   := v_log || (v_bots -> 'log');
    end if;
  end if;

  update public.quiz_sessions set state = v_state where id = p_session_id;

  return jsonb_build_object('state', v_state, 'log', v_log);
end;
$$;

-- ============================================================ mode rules

-- Rewritten to add the ludo branch. Ladder and survival are unchanged from
-- 20260816090200 — reproduced here because a plpgsql body cannot be patched.
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
  v_state  jsonb;
  v_slug   text;
  v_rules  jsonb;
  v_lives  integer;
  v_rung   integer;
  v_rungs  jsonb;
  v_roll   integer;
  v_sixes  integer;
  v_moves  jsonb;
  v_over   boolean := false;
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
      v_rung  := least(v_rung + 1, jsonb_array_length(v_rungs));
      v_state := v_state || jsonb_build_object(
        'rung',     v_rung,
        'unbanked', coalesce((v_rungs -> (v_rung - 1))::text::integer, 0)
      );
      v_over := v_rung >= jsonb_array_length(v_rungs);
    else
      -- The whole point of the mode. Everything unbanked is gone.
      v_state := v_state || jsonb_build_object('unbanked', 0);
      v_over  := true;
    end if;

  elsif v_slug = 'ludo' then
    v_sixes := coalesce((v_state ->> 'sixes')::integer, 0);

    if p_correct then
      -- Rolled here, never on the phone. A client-rolled die is a
      -- client-chosen die, and this one decides a leaderboard.
      v_roll := 1 + floor(random() * 6)::integer;

      if v_roll = 6 then
        v_sixes := v_sixes + 1;
      else
        v_sixes := 0;
      end if;

      if v_sixes >= 3 then
        -- Three in a row forfeits, exactly as at a real board. Without it, a
        -- lucky streak never ends.
        v_state := v_state || jsonb_build_object('pending_roll', null, 'sixes', 0);
      else
        v_state := v_state || jsonb_build_object('pending_roll', v_roll, 'sixes', v_sixes);
        v_moves := public.ludo_legal_moves(v_state, 0, v_roll);
      end if;
    else
      v_state := v_state || jsonb_build_object('pending_roll', null, 'sixes', 0);
    end if;

    -- A match ends when it is won, not when a question is missed.
    v_over := v_state ->> 'winner' is not null;
  end if;

  update public.quiz_sessions set state = v_state where id = p_session_id;

  return v_state
      || jsonb_build_object('run_over', v_over)
      || case when v_moves is null then '{}'::jsonb
              else jsonb_build_object('moves', v_moves) end;
end;
$$;

-- ============================================================ records

-- Rewritten to count wins. Ladder and survival scoring is unchanged.
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
  v_won     integer := 0;
begin
  select * into v_session from public.quiz_sessions where id = p_session_id;

  v_slug := v_session.state ->> 'slug';
  if v_slug is null then
    return null;   -- a Focus quiz; nothing to record
  end if;

  -- Ludo is scored on correct answers, because that is the part the player
  -- controls — the die is not a skill. Winning is counted separately, since a
  -- win is a different fact rather than a bigger number.
  v_value := case v_slug
               when 'ladder' then coalesce((v_session.state ->> 'banked')::integer, 0)
               else               v_session.correct_count
             end;

  if v_slug = 'ludo' and (v_session.state ->> 'winner') = '0' then
    v_won := 1;
  end if;

  v_week := date_trunc('week', now())::date;

  -- Read the previous best before writing, so the results screen can say
  -- "personal best" honestly.
  select r.best_value into v_before
  from public.mode_records r
  where r.user_id = v_session.user_id and r.mode_slug = v_slug and r.week_start = v_week;

  insert into public.mode_records (user_id, mode_slug, week_start, best_value, runs, wins)
  values (v_session.user_id, v_slug, v_week, v_value, 1, v_won)
  on conflict (user_id, mode_slug, week_start) do update set
    -- greatest(), not overwrite: a bad run must never erase a good week.
    best_value  = greatest(public.mode_records.best_value, excluded.best_value),
    runs        = public.mode_records.runs + 1,
    wins        = public.mode_records.wins + excluded.wins,
    achieved_at = case
                    when excluded.best_value > public.mode_records.best_value
                    then now()
                    else public.mode_records.achieved_at
                  end;

  return jsonb_build_object(
    'slug',      v_slug,
    'value',     v_value,
    'best',      greatest(coalesce(v_before, 0), v_value),
    'is_record', v_value > coalesce(v_before, 0),
    'won',       v_won = 1
  );
end;
$$;
