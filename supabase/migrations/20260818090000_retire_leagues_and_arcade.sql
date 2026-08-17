-- Learn-Quize · 018 · Retire leagues and seal the arcade surface
--
-- The app removed the Arcade lane (Ladder, Survival, Blitz, Ludo) and the
-- weekly XP leagues. The schema stays — history rows reference it and the
-- features may return — but the live behaviour goes:
--
--   1. add_league_xp becomes a no-op. It is called from submit_answer (both
--      lanes) and bank_ladder, so one CREATE OR REPLACE retires all three
--      call sites without touching them. Before this, every XP-earning answer
--      grew leagues/league_members forever with no reader: the league UI is
--      deleted, final_rank was never written, and there is no rollover job.
--
--   2. The arcade and ludo entry points lose EXECUTE. The UI that called them
--      is gone, but the functions were still reachable with any valid JWT —
--      including bank_ladder, a live profiles.xp credit path. Server rules
--      make them safe; sealed is safer than safe.
--
-- Reversal is one migration: restore the original add_league_xp body and
-- re-grant the entry points.

create or replace function public.add_league_xp(p_user uuid, p_xp integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Leagues retired 2026-08-18. Intentionally does nothing; kept so the
  -- callers (submit_answer, bank_ladder) did not need to change, and so the
  -- security posture (sealed internal function) stays identical.
  return;
end;
$$;

revoke execute on function public.start_arcade_run(text, uuid) from authenticated;
revoke execute on function public.next_question(uuid)          from authenticated;
revoke execute on function public.bank_ladder(uuid)            from authenticated;
revoke execute on function public.start_ludo_match(uuid)       from authenticated;
revoke execute on function public.active_ludo_match()          from authenticated;
revoke execute on function public.ludo_move(uuid, integer)     from authenticated;
