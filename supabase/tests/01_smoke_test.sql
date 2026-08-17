-- Learn-Quize · smoke test
--
-- Exercises the whole game loop and the security boundary against a real
-- database. Every check is an assert, so the script fails loudly rather than
-- printing something nobody reads. Runs inside a transaction and rolls back,
-- so it is safe to run repeatedly against the same database.
--
--   docker exec -i <container> psql -U postgres -d learnquize -v ON_ERROR_STOP=1 \
--     < supabase/tests/01_smoke_test.sql

\set ON_ERROR_STOP on

begin;

-- ============================================================ fixtures

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.dev', '{"full_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.dev',   '{"full_name":"Bob"}');

do $$
declare n integer;
begin
  select count(*) into n from public.profiles;
  assert n = 2, format('signup trigger should have created 2 profiles, found %s', n);
end
$$;

-- Alice reviews content.
update public.profiles set is_staff = true
where id = '11111111-1111-1111-1111-111111111111';

-- Eight approved questions plus one draft, so we can prove drafts stay hidden.
insert into public.questions
  (id, category_id, difficulty, status, body, explanation, approved_by, source)
select
  ('aaaa0000-0000-0000-0000-00000000000' || n)::uuid,
  (select id from public.categories where slug = 'javascript'),
  'medium', 'approved',
  'Approved question ' || n, 'Because reason ' || n,
  '11111111-1111-1111-1111-111111111111', 'test'
from generate_series(1, 8) n;

insert into public.questions
  (id, category_id, difficulty, status, body, explanation, source)
values
  ('bbbb0000-0000-0000-0000-000000000001',
   (select id from public.categories where slug = 'javascript'),
   'easy', 'draft', 'Unreviewed question', 'Because draft', 'test');

insert into public.options (question_id, body, is_correct, sort_order)
select q.id, 'Option ' || o, (o = 1), o
from public.questions q, generate_series(1, 4) o
where q.source = 'test';

do $$
declare n integer;
begin
  select approved_question_count into n
  from public.categories where slug = 'javascript';
  assert n = 8, format('category counter should be 8 after 8 approvals, got %s', n);
end
$$;

-- ============================================================ integrity rules

do $$
declare ok boolean := false;
begin
  begin
    -- A second correct option on the same question must be impossible.
    insert into public.options (question_id, body, is_correct, sort_order)
    values ('aaaa0000-0000-0000-0000-000000000001', 'Also correct', true, 9);
  exception when unique_violation then ok := true;
  end;
  assert ok, 'a question was allowed two correct options';
end
$$;

do $$
declare ok boolean := false;
begin
  begin
    -- Approving without recording who approved it must be impossible.
    insert into public.questions (category_id, status, body, explanation)
    values ((select id from public.categories where slug = 'javascript'),
            'approved', 'Sneaky', 'No approver');
  exception when check_violation then ok := true;
  end;
  assert ok, 'a question reached approved status with no approver';
end
$$;

-- ============================================================ the game loop

do $$
declare
  v_alice     uuid := '11111111-1111-1111-1111-111111111111';
  v_cat       uuid := (select id from public.categories where slug = 'javascript');
  v_session   uuid;
  v_session2  uuid;
  v_row       record;
  v_qid       uuid;
  v_opt       uuid;
  v_count     integer;
  v_xp        integer;
  v_level     integer;
  v_fresh_xp  integer := null;
  v_repeat_xp integer := null;
  v_seen      boolean;
  ok          boolean;
begin
  perform set_config('request.jwt.claim.sub', v_alice::text, true);

  -- ---- start ------------------------------------------------------------
  v_session := public.start_quiz_session('practice', v_cat, 5);

  select count(*) into v_count
  from public.session_questions where session_id = v_session;
  assert v_count = 5, format('expected 5 served questions, got %s', v_count);

  -- The draft must never be served.
  assert not exists (
    select 1 from public.session_questions
    where session_id = v_session
      and question_id = 'bbbb0000-0000-0000-0000-000000000001'
  ), 'an unapproved question was served to a user';

  -- ---- answer everything correctly --------------------------------------
  for v_qid in
    select question_id from public.session_questions
    where session_id = v_session order by position
  loop
    select id into v_opt from public.options
    where question_id = v_qid and is_correct;

    select * into v_row from public.submit_answer(v_session, v_qid, v_opt, 4000);

    assert v_row.is_correct, 'the correct option was scored as wrong';
    -- medium (1.5) x no speed bonus (untimed) x streak 0 (1.0) x first time (1.0)
    assert v_row.xp_awarded = 15,
      format('first-time medium answer should pay 15 xp, paid %s', v_row.xp_awarded);
    assert v_row.explanation is not null, 'no explanation returned';
  end loop;

  -- ---- replay protection ------------------------------------------------
  select question_id into v_qid from public.session_questions
  where session_id = v_session order by position limit 1;
  select id into v_opt from public.options where question_id = v_qid and is_correct;

  ok := false;
  begin
    perform * from public.submit_answer(v_session, v_qid, v_opt, 100);
  exception when unique_violation then ok := true;
  end;
  assert ok, 'the same question was answered twice in one session';

  -- ---- questions outside the served set ---------------------------------
  ok := false;
  begin
    perform * from public.submit_answer(
      v_session, 'bbbb0000-0000-0000-0000-000000000001', null, 100);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'an answer was accepted for a question the session never served';

  -- ---- finish -----------------------------------------------------------
  select * into v_row from public.finish_quiz_session(v_session);
  assert v_row.xp_earned = 75,
    format('session should have earned 75 xp, earned %s', v_row.xp_earned);
  assert v_row.correct_count = 5, 'correct_count did not match';
  assert v_row.new_streak = 1,
    format('first day should start a streak of 1, got %s', v_row.new_streak);
  assert 'first-steps' = any(v_row.unlocked),
    format('first session should unlock first-steps, unlocked %s', v_row.unlocked);

  select xp, level into v_xp, v_level from public.profiles where id = v_alice;
  assert v_xp = 75,  format('profile xp should be 75, is %s', v_xp);
  assert v_level = 2, format('75 xp should be level 2, is %s', v_level);

  -- A finished session must not accept more answers.
  ok := false;
  begin
    perform * from public.submit_answer(v_session, v_qid, v_opt, 100);
  exception when others then ok := (sqlstate = '22023');
  end;
  assert ok, 'a finished session still accepted an answer';

  -- ---- leagues are retired -----------------------------------------------
  -- add_league_xp is a no-op since 20260818090000. Earning XP must no longer
  -- create league rows; this locks the retirement in.
  select count(*) into v_count
  from public.league_members where user_id = v_alice;
  assert v_count = 0,
    format('leagues are retired but %s league_members rows appeared', v_count);

  -- ---- repeat questions must pay less -----------------------------------
  v_session2 := public.start_quiz_session('practice', v_cat, 8);

  for v_qid in
    select question_id from public.session_questions
    where session_id = v_session2 order by position
  loop
    select id into v_opt from public.options where question_id = v_qid and is_correct;

    select coalesce(s.ever_correct, false) into v_seen
    from public.user_question_stats s
    where s.user_id = v_alice and s.question_id = v_qid;

    select * into v_row from public.submit_answer(v_session2, v_qid, v_opt, 4000);

    if coalesce(v_seen, false) then
      v_repeat_xp := v_row.xp_awarded;
    else
      v_fresh_xp := v_row.xp_awarded;
    end if;
  end loop;

  assert v_fresh_xp is not null and v_repeat_xp is not null,
    'second session did not mix fresh and repeated questions';
  assert v_repeat_xp > 0, 'a repeated question paid nothing at all';
  assert v_repeat_xp < v_fresh_xp,
    format('repeat (%s xp) should pay less than fresh (%s xp) — the anti-farming multiplier is not working',
           v_repeat_xp, v_fresh_xp);

  perform * from public.finish_quiz_session(v_session2);

  -- ---- spaced repetition scheduled --------------------------------------
  select count(*) into v_count
  from public.user_question_stats
  where user_id = v_alice and next_review_on is not null;
  assert v_count = 8,
    format('all 8 answered questions should be scheduled for review, %s were', v_count);

  -- ---- weak spots has nothing due yet -----------------------------------
  ok := false;
  begin
    perform public.start_quiz_session('weak_spots', v_cat, 5);
  exception when others then ok := (sqlstate = 'P0002');
  end;
  assert ok, 'weak_spots returned a session despite nothing being due or wrong';

  raise notice 'game loop OK — xp, levels, streaks, replay protection, spaced repetition, leagues retired';
end
$$;

-- ============================================================ arcade

do $$
declare
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_cat   uuid := (select id from public.categories where slug = 'javascript');
  v_run   uuid;
  v_q     jsonb;
  v_qid   uuid;
  v_opt   uuid;
  v_row   record;
  v_xp0   integer;
  v_xp1   integer;
  v_seen  uuid[] := '{}';
  v_count integer;
  ok      boolean;
  i       integer;
begin
  perform set_config('request.jwt.claim.sub', v_alice::text, true);

  -- ---- ladder: climb three rungs, then bank -----------------------------
  v_run := public.start_arcade_run('ladder', v_cat);
  select xp into v_xp0 from public.profiles where id = v_alice;

  for i in 1..3 loop
    v_q := public.next_question(v_run);
    assert v_q is not null, format('ladder ran dry at rung %s', i);
    v_qid := (v_q ->> 'id')::uuid;

    assert not (v_qid = any(v_seen)),
      'next_question served the same question twice in one run';
    v_seen := v_seen || v_qid;

    assert jsonb_array_length(v_q -> 'options') >= 2,
      'next_question returned a question with no options';

    select o.id into v_opt
    from public.options o where o.question_id = v_qid and o.is_correct;

    select * into v_row from public.submit_answer(v_run, v_qid, v_opt, 4000);

    assert v_row.is_correct, 'ladder scored a correct option as wrong';
    -- The mechanic depends on this: nothing is earned per answer, it is only
    -- ever riding on the run.
    assert v_row.xp_awarded = 0,
      format('ladder paid %s xp per answer; it must pay only on bank', v_row.xp_awarded);
    assert (v_row.run_state ->> 'rung')::integer = i,
      format('expected rung %s, state says %s', i, v_row.run_state ->> 'rung');
    assert not (v_row.run_state ->> 'run_over')::boolean,
      'ladder ended the run on a correct answer';
  end loop;

  select xp into v_xp1 from public.profiles where id = v_alice;
  assert v_xp1 = v_xp0, 'ladder credited xp to the profile before it was banked';

  select * into v_row from public.bank_ladder(v_run);
  assert v_row.banked = 40,
    format('rung 3 pays 40 by the seeded curve, banked %s', v_row.banked);

  select xp into v_xp1 from public.profiles where id = v_alice;
  assert v_xp1 = v_xp0 + 40,
    format('banked xp did not reach the profile: %s vs %s', v_xp1, v_xp0 + 40);

  select * into v_row from public.finish_quiz_session(v_run);
  assert (v_row.run -> 'is_record')::boolean, 'first ladder run was not a personal best';
  assert (v_row.run ->> 'value')::integer = 40, 'ladder run recorded the wrong value';

  -- ---- ladder: climb, then bust ------------------------------------------
  v_run  := public.start_arcade_run('ladder', v_cat);
  v_seen := '{}';
  select xp into v_xp0 from public.profiles where id = v_alice;

  v_q   := public.next_question(v_run);
  v_qid := (v_q ->> 'id')::uuid;
  select o.id into v_opt from public.options o
  where o.question_id = v_qid and o.is_correct;
  perform * from public.submit_answer(v_run, v_qid, v_opt, 4000);

  v_q   := public.next_question(v_run);
  v_qid := (v_q ->> 'id')::uuid;
  select o.id into v_opt from public.options o
  where o.question_id = v_qid and not o.is_correct limit 1;

  select * into v_row from public.submit_answer(v_run, v_qid, v_opt, 4000);
  assert (v_row.run_state ->> 'run_over')::boolean,
    'a wrong answer did not end the ladder run';
  assert (v_row.run_state ->> 'unbanked')::integer = 0,
    'a bust left xp still riding on the run';

  select xp into v_xp1 from public.profiles where id = v_alice;
  assert v_xp1 = v_xp0, format('a busted ladder paid out %s xp', v_xp1 - v_xp0);

  ok := false;
  begin
    perform * from public.bank_ladder(v_run);
    select xp into v_xp1 from public.profiles where id = v_alice;
    ok := v_xp1 = v_xp0;      -- banking a bust must pay nothing
  exception when others then ok := true;
  end;
  assert ok, 'banking after a bust paid out';

  perform * from public.finish_quiz_session(v_run);

  -- ---- survival: three lives, three wrong answers ------------------------
  v_run := public.start_arcade_run('survival', v_cat);

  for i in 1..3 loop
    v_q   := public.next_question(v_run);
    assert v_q is not null, format('survival ran dry at question %s', i);
    v_qid := (v_q ->> 'id')::uuid;

    select o.id into v_opt from public.options o
    where o.question_id = v_qid and not o.is_correct limit 1;

    select * into v_row from public.submit_answer(v_run, v_qid, v_opt, 4000);

    assert (v_row.run_state ->> 'lives')::integer = 3 - i,
      format('after %s wrong answers expected %s lives, state says %s',
             i, 3 - i, v_row.run_state ->> 'lives');
    assert (v_row.run_state ->> 'run_over')::boolean = (i = 3),
      format('survival run_over was wrong after %s misses', i);
  end loop;

  perform * from public.finish_quiz_session(v_run);

  -- ---- a run that is not yours is not playable ---------------------------
  perform set_config('request.jwt.claim.sub',
                     '22222222-2222-2222-2222-222222222222', true);
  ok := false;
  begin
    perform public.next_question(v_run);
  exception when insufficient_privilege then ok := true;
       when others then ok := (sqlstate = '22023');
  end;
  assert ok, 'another user could pull a question from someone else''s run';

  perform set_config('request.jwt.claim.sub', v_alice::text, true);

  -- ---- an unknown or locked mode cannot be started -----------------------
  ok := false;
  begin
    perform public.start_arcade_run('not_a_mode', v_cat);
  exception when others then ok := (sqlstate = 'P0002');
  end;
  assert ok, 'start_arcade_run accepted a mode that does not exist';

  select count(*) into v_count from public.mode_records where user_id = v_alice;
  assert v_count = 2,
    format('expected ladder and survival records, found %s', v_count);

  raise notice 'arcade OK — ladder banks and busts, survival lives, streamed questions';
end
$$;

-- ============================================================ ludo

-- The rules are tested against hand-built boards rather than by playing, so
-- each assertion pins exactly one rule. Playing a whole match is the e2e
-- suite's job; this is where "a six is required to leave the yard" is proved.
do $$
declare
  v_board jsonb;
  v_moves jsonb;
  v_res   jsonb;
  ok      boolean;
begin
  -- A board where seat 0 has one token out on relative 10 and three in the
  -- yard, and seat 1 has a token sitting on the same absolute square.
  v_board := jsonb_build_object(
    'slug', 'ludo', 'turn', 0, 'pending_roll', null, 'sixes', 0, 'winner', null,
    'players', jsonb_build_array(
      jsonb_build_object('seat', 0, 'kind', 'human', 'tokens', jsonb_build_array(10, -1, -1, -1)),
      jsonb_build_object('seat', 1, 'kind', 'bot', 'accuracy', 0.7,
                         'tokens', jsonb_build_array(-1, -1, -1, -1)),
      jsonb_build_object('seat', 2, 'kind', 'bot', 'accuracy', 0.7,
                         'tokens', jsonb_build_array(-1, -1, -1, -1)),
      jsonb_build_object('seat', 3, 'kind', 'bot', 'accuracy', 0.7,
                         'tokens', jsonb_build_array(-1, -1, -1, -1))
    )
  );

  -- ---- geometry ----------------------------------------------------------
  assert public.ludo_abs(0, 0) = 0,   'seat 0 must enter at absolute 0';
  assert public.ludo_abs(1, 0) = 13,  'seat 1 must enter at absolute 13';
  assert public.ludo_abs(3, 20) = 7,  'the track must wrap: 39 + 20 = 7 mod 52';
  assert public.ludo_abs(0, 55) = -1, 'a token in the home column is off the track';
  assert public.ludo_is_safe(8),      'square 8 is a star and must be safe';
  assert not public.ludo_is_safe(9),  'square 9 is ordinary and must not be safe';

  -- ---- a six is the only way out -----------------------------------------
  v_moves := public.ludo_legal_moves(v_board, 0, 3);
  assert jsonb_array_length(v_moves) = 1,
    format('only the token already out may move on a 3, got %s moves',
           jsonb_array_length(v_moves));

  v_moves := public.ludo_legal_moves(v_board, 0, 6);
  assert jsonb_array_length(v_moves) = 4,
    format('a six should free three yard tokens plus the one out, got %s',
           jsonb_array_length(v_moves));

  -- ---- home must be hit exactly -------------------------------------------
  v_board := jsonb_set(v_board, '{players,0,tokens,0}', to_jsonb(55));
  v_moves := public.ludo_legal_moves(v_board, 0, 2);
  assert jsonb_array_length(v_moves) = 1, 'a token on 55 must be able to reach 57 with a 2';

  v_moves := public.ludo_legal_moves(v_board, 0, 4);
  assert jsonb_array_length(v_moves) = 0,
    'a token on 55 must not be able to overshoot home with a 4';

  -- ---- capture ------------------------------------------------------------
  -- Seat 0 lands on relative 10 (absolute 10); seat 1 sits on relative 49,
  -- which is absolute (13 + 49) % 52 = 10. Not a safe square, so it goes home.
  v_board := jsonb_set(v_board, '{players,0,tokens,0}', to_jsonb(7));
  v_board := jsonb_set(v_board, '{players,1,tokens,0}', to_jsonb(49));
  assert public.ludo_abs(1, 49) = 10, 'test board is wrong: seat 1 is not on square 10';

  v_res := public.ludo_apply_move(v_board, 0, 0, 3);
  assert (v_res -> 'state' -> 'players' -> 1 -> 'tokens' ->> 0)::integer = -1,
    'a captured token was not sent back to the yard';
  assert (v_res ->> 'extra')::boolean, 'a capture must grant another turn';

  -- ---- safe squares block capture -----------------------------------------
  -- Seat 0 moving to relative 8 is absolute 8, a star. Seat 1 on relative 47
  -- is also absolute 8, and must survive.
  v_board := jsonb_set(v_board, '{players,0,tokens,0}', to_jsonb(5));
  v_board := jsonb_set(v_board, '{players,1,tokens,0}', to_jsonb(47));
  assert public.ludo_abs(1, 47) = 8, 'test board is wrong: seat 1 is not on square 8';

  v_res := public.ludo_apply_move(v_board, 0, 0, 3);
  assert (v_res -> 'state' -> 'players' -> 1 -> 'tokens' ->> 0)::integer = 47,
    'a token on a safe square was captured';

  -- ---- an illegal move is refused whatever the client says ----------------
  ok := false;
  begin
    -- Token 1 is in the yard and 3 is not a six.
    perform public.ludo_apply_move(v_board, 0, 1, 3);
  exception when others then ok := (sqlstate = '22023');
  end;
  assert ok, 'ludo_apply_move accepted a token that could not legally move';

  -- ---- winning ------------------------------------------------------------
  v_board := jsonb_set(v_board, '{players,0,tokens}', '[57, 57, 57, 55]'::jsonb);
  v_res   := public.ludo_apply_move(v_board, 0, 3, 2);
  assert (v_res -> 'state' ->> 'winner') = '0', 'the last token home did not win the match';
  assert not (v_res ->> 'extra')::boolean, 'a won match must not grant another turn';

  raise notice 'ludo OK — yard, exact home, capture, safe squares, illegal moves, winning';
end
$$;

-- The full loop, played as a user: start, answer, roll, move, bots reply.
do $$
declare
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_match uuid;
  v_q     jsonb;
  v_qid   uuid;
  v_opt   uuid;
  v_row   record;
  v_state jsonb;
  v_res   jsonb;
  v_count integer;
  ok      boolean;
begin
  perform set_config('request.jwt.claim.sub', v_alice::text, true);

  -- Only 8 questions are approved in this harness, well under the 30 a match
  -- needs — so the refusal is the correct behaviour and is what gets asserted.
  ok := false;
  begin
    perform public.start_ludo_match(null);
  exception when others then ok := (sqlstate = 'P0002');
  end;
  assert ok, 'ludo started on a bank too small to finish a match';

  -- Drop the bar for the rest of the test.
  update public.game_modes
     set rules = rules || jsonb_build_object('min_questions', 1)
   where slug = 'ludo';

  v_match := public.start_ludo_match(null);
  assert v_match is not null, 'start_ludo_match returned nothing';

  select state into v_state from public.quiz_sessions where id = v_match;
  assert jsonb_array_length(v_state -> 'players') = 4, 'a match must seat four players';
  assert v_state -> 'players' -> 0 ->> 'kind' = 'human', 'seat 0 must be the human';
  -- `->>` on a JSON null yields SQL NULL, not the text 'null'.
  assert v_state ->> 'pending_roll' is null, 'a match must start with no roll in hand';

  assert public.active_ludo_match() = v_match, 'the new match was not reported as active';

  -- ---- a correct answer earns a roll --------------------------------------
  v_q   := public.next_question(v_match);
  v_qid := (v_q ->> 'id')::uuid;
  select o.id into v_opt from public.options o where o.question_id = v_qid and o.is_correct;

  select * into v_row from public.submit_answer(v_match, v_qid, v_opt, 3000);
  assert (v_row.run_state ->> 'pending_roll')::integer between 1 and 6,
    format('a correct answer must earn a roll, state says %s',
           v_row.run_state ->> 'pending_roll');

  -- ---- a wrong answer earns nothing ---------------------------------------
  perform public.ludo_move(v_match, null);          -- spend the roll by passing

  v_q   := public.next_question(v_match);
  v_qid := (v_q ->> 'id')::uuid;
  select o.id into v_opt from public.options o
  where o.question_id = v_qid and not o.is_correct limit 1;

  select * into v_row from public.submit_answer(v_match, v_qid, v_opt, 3000);
  assert v_row.run_state ->> 'pending_roll' is null,
    'a wrong answer handed out a roll';

  -- ---- moving without a roll is refused -----------------------------------
  ok := false;
  begin
    perform public.ludo_move(v_match, 0);
  exception when others then ok := (sqlstate = '22023');
  end;
  assert ok, 'a token moved with no roll in hand';

  -- ---- passing hands the turn to the bots, who play ------------------------
  v_res := public.ludo_move(v_match, null);
  assert jsonb_array_length(v_res -> 'log') > 0, 'the bots did not take their turns';
  assert (v_res -> 'state' ->> 'turn')::integer = 0,
    'control did not come back to the human';

  -- ---- someone else's match is not playable --------------------------------
  perform set_config('request.jwt.claim.sub',
                     '22222222-2222-2222-2222-222222222222', true);
  ok := false;
  begin
    perform public.ludo_move(v_match, null);
  exception when insufficient_privilege then ok := true;
       when others then ok := (sqlstate = '22023');
  end;
  assert ok, 'another user could take a turn in someone else''s match';

  perform set_config('request.jwt.claim.sub', v_alice::text, true);

  -- ---- starting again abandons the old board -------------------------------
  perform public.start_ludo_match(null);
  select count(*) into v_count
  from public.quiz_sessions
  where user_id = v_alice and mode = 'ludo' and finished_at is null;
  assert v_count = 1, format('expected exactly one live match, found %s', v_count);

  raise notice 'ludo loop OK — answer earns a roll, bots reply, one live match, resume';
end
$$;

-- ============================================================ session integrity

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  v_cat    uuid := (select id from public.categories where slug = 'javascript');
  v_s1     uuid;
  v_s2     uuid;
  v_s3     uuid;
  v_s4     uuid;
  v_row    record;
  v_row2   record;
  v_qid    uuid;
  v_opt    uuid;
  v_streak integer;
  ok       boolean;
begin
  -- ---- only real modes can start ------------------------------------------
  ok := false;
  begin
    perform public.start_quiz_session('survival', v_cat, 5);
  exception when others then ok := (sqlstate = '22023');
  end;
  assert ok, 'start_quiz_session accepted the retired survival mode';

  ok := false;
  begin
    perform public.start_quiz_session('daily_challenge', v_cat, 5);
  exception when others then ok := (sqlstate = '22023');
  end;
  assert ok, 'start_quiz_session accepted daily_challenge, which has no generator';

  -- ---- finishing twice must not double anything ---------------------------
  v_s1 := public.start_quiz_session('practice', v_cat, 3);
  select question_id into v_qid from public.session_questions
   where session_id = v_s1 order by position limit 1;
  select id into v_opt from public.options
   where question_id = v_qid and is_correct;
  perform * from public.submit_answer(v_s1, v_qid, v_opt, 500);

  select * into v_row  from public.finish_quiz_session(v_s1);
  select * into v_row2 from public.finish_quiz_session(v_s1);
  assert v_row2.answered_count = v_row.answered_count
     and v_row2.correct_count  = v_row.correct_count
     and v_row2.new_streak     = v_row.new_streak,
    'a second finish reported different numbers than the first';

  -- ---- a zero-answer finish moves nothing and leaves no history -----------
  v_s2 := public.start_quiz_session('practice', v_cat, 3);
  select current_streak into v_streak from public.profiles where id = auth.uid();

  select * into v_row from public.finish_quiz_session(v_s2);
  assert v_row.answered_count = 0, 'zero-answer finish reported answers';
  assert v_row.new_streak = v_streak,
    'closing an untouched session moved the daily streak';
  assert v_row.unlocked = '{}', 'closing an untouched session unlocked a badge';
  assert not exists (select 1 from public.quiz_sessions where id = v_s2),
    'a zero-answer session left a 0/0 row in history';

  -- ---- starting a quiz closes what the user walked away from --------------
  v_s3 := public.start_quiz_session('practice', v_cat, 3);
  select question_id into v_qid from public.session_questions
   where session_id = v_s3 order by position limit 1;
  select id into v_opt from public.options
   where question_id = v_qid and is_correct;
  perform * from public.submit_answer(v_s3, v_qid, v_opt, 500);

  v_s4 := public.start_quiz_session('practice', v_cat, 3);
  assert (select finished_at from public.quiz_sessions where id = v_s3) is not null,
    'an abandoned session with answers was not closed by the next start';

  perform public.start_quiz_session('practice', v_cat, 3);
  assert not exists (select 1 from public.quiz_sessions where id = v_s4),
    'an abandoned zero-answer session was not deleted by the next start';

  raise notice 'session integrity OK — mode allow-list, idempotent finish, abandoned-session cleanup';
end
$$;

-- ============================================================ leaderboard

do $$
declare
  v_alice uuid := '11111111-1111-1111-1111-111111111111';
  v_row   record;
begin
  -- Alice has finished well over three sessions by now, so she is ranked.
  select * into v_row from public.get_leaderboard(true) where user_id = v_alice;
  assert found, 'a player with 3+ finished quizzes is missing from the board';
  assert v_row.is_me, 'the caller''s own row is not flagged is_me';
  assert v_row.avg_score between 0 and 100,
    format('avg_score %s is not a percentage', v_row.avg_score);
  assert v_row.display_name = 'Alice', 'the board shows the wrong display name';

  -- The floor: nobody with fewer than three finished quizzes is ranked.
  assert not exists (select 1 from public.get_leaderboard(true) g where g.quizzes < 3),
    'the board ranks players below the three-quiz floor';

  -- Bob has never finished a quiz and must not appear.
  assert not exists (
    select 1 from public.get_leaderboard(true) g
    where g.user_id = '22222222-2222-2222-2222-222222222222'
  ), 'a player with no finished quizzes appears on the board';

  raise notice 'leaderboard OK — ranked with floor, self-row flagged, names only';
end
$$;

-- ============================================================ security

-- Everything below runs as an ordinary signed-in user, not the owner.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
declare n integer; ok boolean;
begin
  -- Other people's activity is invisible.
  select count(*) into n from public.answers;
  assert n = 0, format('RLS leak: another user can read %s answer rows', n);

  select count(*) into n from public.quiz_sessions;
  assert n = 0, format('RLS leak: another user can read %s sessions', n);

  select count(*) into n from public.user_question_stats;
  assert n = 0, format('RLS leak: another user can read %s learning-state rows', n);

  -- Approved content is readable; drafts are not.
  select count(*) into n from public.questions;
  assert n = 8, format('a user should see exactly the 8 approved questions, saw %s', n);

  -- Awarding yourself XP must be impossible.
  ok := false;
  begin
    update public.profiles set xp = 999999 where id = auth.uid();
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'a user was able to write directly to profiles.xp';

  ok := false;
  begin
    update public.profiles set current_streak = 500 where id = auth.uid();
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'a user was able to write directly to profiles.current_streak';

  -- Run state is the arcade equivalent of profiles.xp: whoever can write it
  -- has infinite lives and a full ladder.
  ok := false;
  begin
    update public.quiz_sessions set state = '{"lives": 99}'::jsonb;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'a user was able to write quiz_sessions.state';

  ok := false;
  begin
    insert into public.mode_records (user_id, mode_slug, week_start, best_value)
    values (auth.uid(), 'survival', current_date, 999999);
  exception when insufficient_privilege then ok := true;
       when others then ok := true;
  end;
  assert ok, 'a user was able to write themselves onto a leaderboard';

  -- The functions that decide the rules must not be reachable over the API.
  ok := false;
  begin
    perform public.apply_mode_rules(gen_random_uuid(), true);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'apply_mode_rules is callable from a client';

  ok := false;
  begin
    perform public.record_run(gen_random_uuid());
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'record_run is callable from a client';

  -- Editing your own display name is fine.
  update public.profiles set username = 'bob_test' where id = auth.uid();
  select count(*) into n from public.profiles
  where id = auth.uid() and username = 'bob_test';
  assert n = 1, 'a user could not rename themselves';

  -- Non-staff cannot publish content.
  ok := false;
  begin
    insert into public.questions (category_id, body, explanation)
    values ((select id from public.categories where slug = 'javascript'),
            'Injected', 'Injected');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'a non-staff user was able to insert a question';

  -- Reporting a bad question is allowed, and only for yourself.
  insert into public.reports (question_id, user_id, reason)
  values ('aaaa0000-0000-0000-0000-000000000001', auth.uid(), 'wrong_answer');

  ok := false;
  begin
    insert into public.reports (question_id, user_id, reason)
    values ('aaaa0000-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111', 'typo');
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'a user was able to file a report in someone else''s name';

  -- The internal scoring helpers must be unreachable from the client.
  ok := false;
  begin
    perform public.add_league_xp(auth.uid(), 1000000);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'add_league_xp is callable by a signed-in user';

  ok := false;
  begin
    perform public.award_achievements(auth.uid());
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'award_achievements is callable by a signed-in user';

  -- The retired arcade and ludo entry points are sealed (20260818090000).
  ok := false;
  begin
    perform public.start_arcade_run('ladder', null);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'start_arcade_run is still callable though the arcade is retired';

  ok := false;
  begin
    perform public.next_question(gen_random_uuid());
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'next_question is still callable though the arcade is retired';

  ok := false;
  begin
    perform public.bank_ladder(gen_random_uuid());
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'bank_ladder is still callable though the arcade is retired';

  ok := false;
  begin
    perform public.start_ludo_match(null);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'start_ludo_match is still callable though ludo is retired';

  ok := false;
  begin
    perform public.active_ludo_match();
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'active_ludo_match is still callable though ludo is retired';

  ok := false;
  begin
    perform public.ludo_move(gen_random_uuid(), 0);
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'ludo_move is still callable though ludo is retired';

  -- Another user's profile row is invisible (profiles went own-row-only).
  select count(*) into n from public.profiles
  where id <> auth.uid();
  assert n = 0, format('RLS leak: another user can read %s other profiles', n);

  -- A non-staff user cannot resolve reports — not even their own.
  update public.reports set resolved_at = now() where user_id = auth.uid();
  select count(*) into n from public.reports
  where user_id = auth.uid() and resolved_at is not null;
  assert n = 0, 'a non-staff user resolved a report';

  raise notice 'security OK — RLS isolation, column grants, staff gate, internal functions sealed';
end
$$;

-- ---- staff can drain the reports inbox --------------------------------------

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$
declare n integer;
begin
  update public.reports
     set resolved_at = now(), resolved_by = auth.uid()
   where resolved_at is null;

  select count(*) into n from public.reports where resolved_at is null;
  assert n = 0, format('%s reports remained unresolved after a staff sweep', n);

  raise notice 'reports OK — staff can resolve, non-staff cannot';
end
$$;

-- ---- a user can delete their own account ------------------------------------

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

do $$
begin
  perform public.delete_account();
end
$$;

reset role;

-- The deletion cascaded: no orphaned auth row, profile, or activity.
do $$
declare v_bob uuid := '22222222-2222-2222-2222-222222222222';
begin
  assert not exists (select 1 from auth.users       where id = v_bob),      'auth row survived delete_account';
  assert not exists (select 1 from public.profiles  where id = v_bob),      'profile survived delete_account';
  assert not exists (select 1 from public.reports   where user_id = v_bob), 'reports survived delete_account';

  raise notice 'account deletion OK — auth row, profile and activity all cascade';
end
$$;

-- Signed-out browsing: the catalogue is public, the questions are not.
set role anon;
do $$
declare n integer;
begin
  select count(*) into n from public.categories;
  assert n = 12, format('anon should see the 12 active categories, saw %s', n);

  select count(*) into n from public.tracks;
  assert n = 3, format('anon should see 3 tracks, saw %s', n);

  raise notice 'anon OK — catalogue readable while signed out';
end
$$;
reset role;

rollback;
