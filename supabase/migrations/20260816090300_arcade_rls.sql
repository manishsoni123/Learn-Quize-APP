-- Learn-Quize · 010 · Arcade RLS and grants
--
-- Same posture as 20260815090500: tables are readable only where a player has
-- a reason to read them, nothing is writable from a client, and the functions
-- that decide the rules are unreachable over HTTP.
--
-- Note this file cannot rely on the blanket `revoke all on all functions` at
-- the top of that migration — it ran before these functions existed, so every
-- function created here still carries Postgres's default EXECUTE grant to
-- PUBLIC until it is revoked below.

alter table public.game_modes   enable row level security;
alter table public.mode_records enable row level security;

-- ============================================================ mode catalogue

grant select on public.game_modes to authenticated;

create policy game_modes_read_active on public.game_modes
  for select to authenticated using (is_active or public.is_staff());

create policy game_modes_staff_write on public.game_modes
  for all using (public.is_staff()) with check (public.is_staff());

-- ============================================================ records

-- Read is deliberately wide: a leaderboard is worthless if you can only see
-- your own row. profiles is already readable by every authenticated user for
-- the same reason (20260815090500:94), and mode_records holds no PII — a
-- user id, a mode, and a number.
grant select on public.mode_records to authenticated;

create policy mode_records_read_all on public.mode_records
  for select to authenticated using (true);

-- No insert, update or delete policy, and no write grant. Records move only
-- through record_run(), which runs as the owner. A client that could write
-- this table could write itself to the top of every board.

-- ============================================================ function access

grant execute on function public.start_arcade_run(text, uuid)                  to authenticated;
grant execute on function public.next_question(uuid)                           to authenticated;
grant execute on function public.bank_ladder(uuid)                             to authenticated;

-- Reissued: both were dropped and recreated with new return types, and a
-- dropped function takes its grants with it. Without these two lines every
-- quiz in the app stops working — the Focus lane included.
grant execute on function public.submit_answer(uuid, uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.finish_quiz_session(uuid)                       to authenticated;

-- Internal. apply_mode_rules decides how many lives you have left and whether
-- the ladder pays out; record_run decides what goes on the leaderboard. Both
-- are reachable only from submit_answer and finish_quiz_session.
revoke execute on function public.apply_mode_rules(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.record_run(uuid)                from public, anon, authenticated;

-- The new entry points were created after the blanket revoke in the earlier
-- migration, so PUBLIC still holds EXECUTE on them until now.
revoke execute on function public.start_arcade_run(text, uuid) from public, anon;
revoke execute on function public.next_question(uuid)          from public, anon;
revoke execute on function public.bank_ladder(uuid)            from public, anon;
revoke execute on function public.submit_answer(uuid, uuid, uuid, integer, jsonb) from public, anon;
revoke execute on function public.finish_quiz_session(uuid)                       from public, anon;
