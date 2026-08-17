-- Learn-Quize · 019 · Tighten profiles visibility, fix reports, gate approval
--
-- Three independent hardenings:
--
--   1. profiles goes own-row-only. The old profiles_read_all policy existed
--      for the League tab; get_leaderboard() is SECURITY DEFINER and joins
--      profiles internally, so no client needs to read anyone else's row.
--      What read-all was leaking to every signed-in user: is_staff (a
--      targeted-attack shortlist), last_active_on, timezone, xp.
--
--   2. reports gains the UPDATE grant its RLS policy always assumed. The
--      reports_staff_resolve policy existed from day one, but the table grant
--      was SELECT, INSERT only — so no staff account could ever set
--      resolved_at through the API and the reviewer inbox could not drain.
--
--   3. Approval now asserts the question is actually playable: at least two
--      options, exactly one correct. The unique index only ever enforced *at
--      most* one correct — an approved question with zero correct options is
--      unanswerable forever, and nothing structural prevented it once content
--      arrives through an admin panel or import instead of the seed script.

-- ------------------------------------------------------------------ profiles

drop policy if exists profiles_read_all on public.profiles;

create policy profiles_read_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- ------------------------------------------------------------------- reports

grant update (resolved_at, resolved_by) on public.reports to authenticated;

-- -------------------------------------------------------- approval integrity

create or replace function public.tg_question_approvable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total   integer;
  v_correct integer;
begin
  select count(*), count(*) filter (where o.is_correct)
    into v_total, v_correct
  from public.options o
  where o.question_id = new.id;

  if v_total < 2 or v_correct <> 1 then
    raise exception
      'question % cannot be approved: needs at least 2 options and exactly 1 correct (has %, % correct)',
      new.id, v_total, v_correct
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.tg_question_approvable()
  from public, anon, authenticated;

-- UPDATE only: a question is inserted before its options exist, so an INSERT
-- check could never pass. The approved-on-insert path is already blocked by
-- questions_approved_has_approver requiring a reviewer, and the review flow
-- is always draft/in_review first, approve second.
create trigger questions_approvable
  before update of status on public.questions
  for each row
  when (new.status = 'approved' and old.status is distinct from new.status)
  execute function public.tg_question_approvable();
