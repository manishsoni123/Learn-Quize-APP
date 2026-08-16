-- Learn-Quize · 014 · The Ludo engine
--
-- Every rule lives here rather than on the phone, for the usual reason: the
-- anon key ships inside the APK, so a client-decided die is a client-chosen
-- die. The app has its own copy of the move rules in src/lib/ludoBoard.ts, but
-- only to know which tokens to light up — ludo_move() re-derives the legal set
-- and refuses anything outside it, whatever the UI allowed.
--
-- Positions are stored **relative to each player's own start**:
--
--     -1        in the yard
--     0 .. 51   on the shared 52-square track
--     52 .. 56  in that player's home column
--     57        home
--
-- so a move is `pos + roll` for everyone, with no per-seat arithmetic. The
-- absolute square only matters when checking whether two tokens collide, and
-- that is the one place the seat offset is applied. Storing absolute positions
-- instead would push "whose turn is it" into every single rule.

-- ============================================================ geometry

-- Seat entry points, evenly spaced around the 52-square track.
create or replace function public.ludo_abs(p_seat integer, p_pos integer)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
           when p_pos between 0 and 51
           then ((array[0, 13, 26, 39])[p_seat + 1] + p_pos) % 52
           else -1                      -- yard or home column: off the track
         end;
$$;

-- The four coloured start squares and the four stars. A token standing on one
-- cannot be captured, which is what stops the game becoming pure attrition.
create or replace function public.ludo_is_safe(p_abs integer)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_abs = any(array[0, 8, 13, 21, 26, 34, 39, 47]);
$$;

-- ============================================================ rules

-- Whoever would be sent home if `p_seat` landed on `p_to`, or null.
create or replace function public.ludo_capture_at(
  p_state jsonb,
  p_seat  integer,
  p_to    integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_abs    integer;
  v_tokens jsonb;
  v_pos    integer;
  s        integer;
  j        integer;
begin
  -- The home column is private to its owner, so nothing can be met there.
  if p_to > 51 then
    return null;
  end if;

  v_abs := public.ludo_abs(p_seat, p_to);
  if public.ludo_is_safe(v_abs) then
    return null;
  end if;

  for s in 0..3 loop
    if s = p_seat then
      continue;
    end if;

    v_tokens := p_state -> 'players' -> s -> 'tokens';

    for j in 0 .. jsonb_array_length(v_tokens) - 1 loop
      v_pos := (v_tokens -> j)::text::integer;
      if v_pos between 0 and 51 and public.ludo_abs(s, v_pos) = v_abs then
        return jsonb_build_object('seat', s, 'token', j);
      end if;
    end loop;
  end loop;

  return null;
end;
$$;

-- Every move `p_roll` allows, as an array the client can light up directly.
create or replace function public.ludo_legal_moves(
  p_state jsonb,
  p_seat  integer,
  p_roll  integer
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_tokens jsonb := p_state -> 'players' -> p_seat -> 'tokens';
  v_moves  jsonb := '[]'::jsonb;
  v_pos    integer;
  v_to     integer;
  i        integer;
begin
  for i in 0 .. jsonb_array_length(v_tokens) - 1 loop
    v_pos := (v_tokens -> i)::text::integer;

    if v_pos = 57 then
      continue;                              -- already home, nothing to do

    elsif v_pos = -1 then
      if p_roll <> 6 then
        continue;                            -- a six is the only way out
      end if;
      v_to := 0;

    else
      v_to := v_pos + p_roll;
      -- Home must be hit exactly. Overshooting does not creep or bounce, the
      -- token simply cannot use this roll.
      if v_to > 57 then
        continue;
      end if;
    end if;

    v_moves := v_moves || jsonb_build_array(jsonb_build_object(
      'token',   i,
      'from',    v_pos,
      'to',      v_to,
      'capture', public.ludo_capture_at(p_state, p_seat, v_to)
    ));
  end loop;

  return v_moves;
end;
$$;

-- Applies one move and reports whether the mover goes again.
--
-- Raises rather than returning a failure: an illegal move is never a thing a
-- correct client sends, so it is a tampering signal and should read like one
-- in the logs.
create or replace function public.ludo_apply_move(
  p_state jsonb,
  p_seat  integer,
  p_token integer,
  p_roll  integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_move   jsonb;
  v_state  jsonb := p_state;
  v_cap    jsonb;
  v_to     integer;
  v_extra  boolean := false;
  v_home   integer;
  v_count  integer;
begin
  select m into v_move
  from jsonb_array_elements(public.ludo_legal_moves(p_state, p_seat, p_roll)) as t(m)
  where (m ->> 'token')::integer = p_token;

  if v_move is null then
    raise exception 'illegal move: token % cannot use a %', p_token, p_roll
      using errcode = '22023';
  end if;

  v_to    := (v_move ->> 'to')::integer;
  v_state := jsonb_set(
    v_state, array['players', p_seat::text, 'tokens', p_token::text], to_jsonb(v_to)
  );

  v_cap := v_move -> 'capture';
  if v_cap is not null and v_cap <> 'null'::jsonb then
    v_state := jsonb_set(
      v_state,
      array['players', v_cap ->> 'seat', 'tokens', v_cap ->> 'token'],
      to_jsonb(-1)
    );
    v_extra := true;                          -- a capture buys another turn
  end if;

  if v_to = 57 then
    v_extra := true;                          -- so does bringing one home
  end if;

  if p_roll = 6 then
    v_extra := true;
  end if;

  select count(*), count(*) filter (where (t.v)::text::integer = 57)
    into v_count, v_home
  from jsonb_array_elements(v_state -> 'players' -> p_seat -> 'tokens') as t(v);

  if v_home = v_count then
    v_state := jsonb_set(v_state, '{winner}', to_jsonb(p_seat));
    v_extra := false;
  end if;

  return jsonb_build_object('state', v_state, 'extra', v_extra, 'move', v_move);
end;
$$;

-- Bot choice, in priority order: take a capture, bring a token home, get one
-- out of the yard, otherwise push the leader further. Not clever, but it never
-- makes the move that makes a human feel patronised.
create or replace function public.ludo_bot_pick(p_moves jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select m
  from jsonb_array_elements(p_moves) as t(m)
  order by
    (m -> 'capture' is not null and m -> 'capture' <> 'null'::jsonb) desc,
    ((m ->> 'to')::integer = 57)   desc,
    ((m ->> 'from')::integer = -1) desc,
    (m ->> 'to')::integer          desc
  limit 1;
$$;

-- Plays every bot seat until it is the human's turn again, or someone wins.
--
-- Resolved in one call rather than one per bot so the phone makes a single
-- round trip per turn, and returns a log so the app can replay the moves as
-- animation instead of snapping three tokens at once.
create or replace function public.ludo_bot_turns(p_state jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_state jsonb := p_state;
  v_log   jsonb := '[]'::jsonb;
  v_seat  integer;
  v_acc   numeric;
  v_roll  integer;
  v_moves jsonb;
  v_pick  jsonb;
  v_res   jsonb;
  v_sixes integer;
  v_guard integer := 0;
begin
  loop
    -- Backstop, not a rule. Every path below either advances the turn or
    -- exits, but a bug in one of them should end a match rather than pin a
    -- database connection at 100% forever.
    v_guard := v_guard + 1;
    exit when v_guard > 400;

    exit when v_state ->> 'winner' is not null;

    v_seat := (v_state ->> 'turn')::integer;
    exit when v_state -> 'players' -> v_seat ->> 'kind' = 'human';

    v_acc   := coalesce((v_state -> 'players' -> v_seat ->> 'accuracy')::numeric, 0.7);
    v_sixes := 0;

    -- The bot "answers a question". Simulated rather than served, so bots
    -- never consume the question bank — with 120 questions in it, three bots
    -- drawing a card each per turn would drain a category in one match.
    if random() < v_acc then
      loop
        v_roll := 1 + floor(random() * 6)::integer;

        if v_roll = 6 then
          v_sixes := v_sixes + 1;
        else
          v_sixes := 0;
        end if;

        if v_sixes >= 3 then
          v_log := v_log || jsonb_build_array(
            jsonb_build_object('seat', v_seat, 'event', 'three_sixes')
          );
          exit;
        end if;

        v_moves := public.ludo_legal_moves(v_state, v_seat, v_roll);

        if jsonb_array_length(v_moves) = 0 then
          v_log := v_log || jsonb_build_array(
            jsonb_build_object('seat', v_seat, 'roll', v_roll, 'event', 'blocked')
          );
          exit;
        end if;

        v_pick  := public.ludo_bot_pick(v_moves);
        v_res   := public.ludo_apply_move(
                     v_state, v_seat, (v_pick ->> 'token')::integer, v_roll);
        v_state := v_res -> 'state';

        v_log := v_log || jsonb_build_array(jsonb_build_object(
          'seat', v_seat, 'roll', v_roll, 'event', 'move', 'move', v_res -> 'move'
        ));

        exit when v_state ->> 'winner' is not null;
        exit when not (v_res ->> 'extra')::boolean;
      end loop;
    else
      v_log := v_log || jsonb_build_array(
        jsonb_build_object('seat', v_seat, 'event', 'missed')
      );
    end if;

    exit when v_state ->> 'winner' is not null;

    v_state := jsonb_set(v_state, '{turn}', to_jsonb((v_seat + 1) % 4));
  end loop;

  return jsonb_build_object('state', v_state, 'log', v_log);
end;
$$;
