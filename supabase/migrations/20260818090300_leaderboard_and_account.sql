-- Learn-Quize · 021 · Leaderboard hardening and account deletion
--
--   1. get_leaderboard gets the same search_path posture as every other
--      SECURITY DEFINER function (empty, names qualified), and a floor:
--      three finished quizzes before you are ranked. Without it, one perfect
--      1-question session (the server accepts p_question_count down to 1 via
--      raw RPC) held rank #1 forever — averages without a denominator floor
--      reward playing less.
--
--   2. delete_account(): the user's own erasure path, required by Google
--      Play's account-deletion policy and GDPR. Deleting the auth.users row
--      cascades to profiles and from there to every user table; GoTrue's own
--      FKs clean up sessions and refresh tokens. SECURITY DEFINER because
--      authenticated has no grants on auth.users — this function is the only
--      path, and it can only ever delete the caller.

create or replace function public.get_leaderboard(p_all_time boolean default false)
returns table (
  user_id      uuid,
  display_name text,
  avg_score    numeric,
  quizzes      bigint,
  rank         bigint,
  is_me        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with scored as (
    select s.user_id,
           avg(s.correct_count::numeric / s.answered_count) as avg_score,
           count(*) as quizzes
    from public.quiz_sessions s
    where s.finished_at is not null
      and s.answered_count > 0
      and (p_all_time or s.finished_at >= date_trunc('week', now()))
    group by s.user_id
    -- Three finished quizzes before a rank. An average over one quiz is not
    -- a score, it is a coin flip that would sit at #1 forever.
    having count(*) >= 3
  ),
  ranked as (
    select sc.user_id,
           coalesce(p.display_name, p.username, 'Anonymous') as display_name,
           round(sc.avg_score * 100) as avg_score,
           sc.quizzes,
           row_number() over (order by sc.avg_score desc, sc.quizzes desc, sc.user_id) as rank
    from scored sc
    join public.profiles p on p.id = sc.user_id
  )
  select r.user_id, r.display_name, r.avg_score, r.quizzes, r.rank,
         r.user_id = auth.uid() as is_me
  from ranked r
  where r.rank <= 50 or r.user_id = auth.uid()
  order by r.rank;
$$;

-- Same signature as before, so the existing grant survives the replace.

-- ----------------------------------------------------------- delete_account

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from auth.users where id = v_user;
end;
$$;

-- Created after the blanket revoke, so PUBLIC still holds EXECUTE until now.
grant execute on function public.delete_account() to authenticated;
revoke execute on function public.delete_account() from public, anon;
