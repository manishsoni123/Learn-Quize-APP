-- Learn-Quize · promote ONE named account to staff.
--
--   Local:
--     docker exec -i supabase_db_Learn-Quize \
--       psql -U postgres -d postgres -v email="'you@example.com'" \
--       -f - < supabase/dev/promote_staff.sql
--   Hosted (connection string from Dashboard → Connect → Session pooler):
--     psql "$SUPABASE_DB_URL" -v email="'you@example.com'" \
--       -f supabase/dev/promote_staff.sql
--
-- psql only — `supabase db query` cannot pass variables. The email must be
-- explicit: this file replaces an earlier script that promoted whichever
-- account signed up most recently, which on a live project would have handed
-- content-write access to a stranger.

\set ON_ERROR_STOP on

select set_config('app.promote_email', :email, false);

do $$
declare
  v_email text := current_setting('app.promote_email');
  v_id    uuid;
begin
  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(v_email);

  if v_id is null then
    raise exception 'No account with email %. Sign up in the app first.', v_email;
  end if;

  update public.profiles set is_staff = true where id = v_id;

  raise notice 'Promoted % (%) to staff.', v_email, v_id;
end $$;
