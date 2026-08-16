-- Learn-Quize · 013 · Ludo table changes
--
-- Ludo needs no tables of its own. A match is a quiz_session whose `state`
-- holds a board, which is the same mechanism already carrying survival lives
-- and the ladder's unbanked XP — and it inherits the property that matters:
-- quiz_sessions has SELECT granted to authenticated and no UPDATE grant, so a
-- board cannot be edited from a phone.

-- Ladder is scored on XP banked and Survival on how long you lasted, so
-- best_value carries both. Ludo is scored on matches won, and there is nowhere
-- to put that — a win is not a bigger number than a loss, it is a different
-- fact.
alter table public.mode_records
  add column if not exists wins integer not null default 0 check (wins >= 0);

-- Finding an unfinished match to resume. Partial, because finished sessions
-- are the overwhelming majority and none of them are ever the answer.
create index if not exists quiz_sessions_active_ludo_idx
  on public.quiz_sessions (user_id, started_at desc)
  where finished_at is null and mode = 'ludo';
