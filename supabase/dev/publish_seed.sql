-- Learn-Quize · approve the seed question bank under an EXISTING staff account.
--
--   npx supabase db query --local  --file supabase/dev/publish_seed.sql
--   npx supabase db query --linked --file supabase/dev/publish_seed.sql
--
-- This exists because the seed lands as `in_review` on purpose: the approval
-- gate is the product's quality story, and seeding around it would be the
-- first crack in it. Approving is a separate, deliberate act.
--
-- This script promotes nobody. It requires a staff account to already exist —
-- create one first with supabase/dev/promote_staff.sql, which takes an
-- explicit email. (An earlier version promoted the most recent signup, which
-- on a live project would have made a stranger staff.)

-- Deliberately a single statement. `supabase db query` sends a file as one
-- prepared statement, and Postgres rejects multiple commands in that form —
-- so a trailing diagnostic SELECT would make this file fail with a message
-- ("cannot insert multiple commands into a prepared statement") that tells you
-- nothing about what is actually wrong. The per-category counts come out as
-- notices instead.
do $$
declare
  v_admin  uuid;
  v_email  text;
  v_staff  integer;
  v_ok     integer;
  r        record;
begin
  select p.id, u.email into v_admin, v_email
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.is_staff
   order by u.created_at
   limit 1;

  if v_admin is null then
    raise exception
      'No staff account exists. Run supabase/dev/promote_staff.sql with your email first.';
  end if;

  -- `approved_by` is NOT NULL for approved rows (questions_approved_has_approver),
  -- so the staff account has to exist before this runs — hence the order here.
  update public.questions
     set status      = 'approved',
         approved_by = v_admin,
         approved_at = now()
   where source = 'seed'
     and status = 'in_review';

  get diagnostics v_staff = row_count;

  select count(*) into v_ok from public.questions where status = 'approved';

  raise notice 'approved under : % (%)', v_email, v_admin;
  raise notice 'newly approved : % questions', v_staff;
  raise notice 'now playable   : % questions total', v_ok;
  raise notice '';

  -- What the app will actually show on the home screen. A category sitting at
  -- 0 here is why a track looks empty, and it is worth seeing before you go
  -- hunting through the client for a bug that is not there.
  for r in
    select c.slug, c.approved_question_count as n
      from public.categories c
     where c.is_active
     order by c.approved_question_count, c.slug
  loop
    raise notice '  % %', rpad(r.slug, 22), r.n;
  end loop;
end $$;
