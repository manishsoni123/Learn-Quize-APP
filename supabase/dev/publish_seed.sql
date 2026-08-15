-- Learn-Quize · make the most recently signed-up account staff, then approve
-- the seed question bank under that account.
--
--   npx supabase db query --local  --file supabase/dev/publish_seed.sql
--   npx supabase db query --linked --file supabase/dev/publish_seed.sql
--
-- This exists because the seed lands as `in_review` on purpose: the approval
-- gate is the product's quality story, and seeding around it would be the
-- first crack in it. Approving is a separate, deliberate act — but it should
-- not require hand-copying UUIDs out of the dashboard.
--
-- DEVELOPMENT AND STAGING ONLY. On production, approve through the admin panel
-- so `approved_by` records who actually reviewed the question.

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
  select id, email into v_admin, v_email
    from auth.users
   order by created_at desc
   limit 1;

  if v_admin is null then
    raise exception
      'No accounts exist yet. Sign up in the app first, then run this again.';
  end if;

  update public.profiles set is_staff = true where id = v_admin;

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

  raise notice 'staff account  : % (%)', v_email, v_admin;
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
