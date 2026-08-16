-- Learn-Quize · 016 · Ludo grants
--
-- Same posture as 20260816090300. Every function here was created after the
-- blanket revoke in 20260815090500, so each still carries Postgres's default
-- EXECUTE grant to PUBLIC until it is taken away below.

grant execute on function public.start_ludo_match(uuid)        to authenticated;
grant execute on function public.active_ludo_match()           to authenticated;
grant execute on function public.ludo_move(uuid, integer)      to authenticated;

revoke execute on function public.start_ludo_match(uuid)   from public, anon;
revoke execute on function public.active_ludo_match()      from public, anon;
revoke execute on function public.ludo_move(uuid, integer) from public, anon;

-- The engine is internal. ludo_apply_move and ludo_bot_turns write boards, and
-- a client that could call them directly could hand itself the win — no die,
-- no question, no turn order.
revoke execute on function public.ludo_apply_move(jsonb, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.ludo_bot_turns(jsonb)
  from public, anon, authenticated;

-- These three are pure functions of their arguments — they read no table and
-- decide nothing on their own. They stay sealed anyway: the client has its own
-- copy of the same rules in src/lib/ludoBoard.ts, so exposing them buys
-- nothing and widens the surface for no reason.
revoke execute on function public.ludo_legal_moves(jsonb, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.ludo_capture_at(jsonb, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.ludo_bot_pick(jsonb)
  from public, anon, authenticated;
revoke execute on function public.ludo_abs(integer, integer)
  from public, anon, authenticated;
revoke execute on function public.ludo_is_safe(integer)
  from public, anon, authenticated;
