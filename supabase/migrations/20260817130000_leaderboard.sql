-- Weekly leaderboard, in the spirit the design asks for: quiet, score-based,
-- no XP and no levels. Ranks users by their average quiz score.
--
-- SECURITY DEFINER because quiz_sessions RLS is owner-only. The function
-- exposes only display names and aggregate percentages — never sessions,
-- answers, or per-question data. Top 50 rows, plus the caller's own row when
-- they rank below that, so "You" always appears.

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
set search_path = public
as $$
  with scored as (
    select s.user_id,
           avg(s.correct_count::numeric / s.answered_count) as avg_score,
           count(*) as quizzes
    from quiz_sessions s
    where s.finished_at is not null
      and s.answered_count > 0
      and (p_all_time or s.finished_at >= date_trunc('week', now()))
    group by s.user_id
  ),
  ranked as (
    select sc.user_id,
           coalesce(p.display_name, p.username, 'Anonymous') as display_name,
           round(sc.avg_score * 100) as avg_score,
           sc.quizzes,
           row_number() over (order by sc.avg_score desc, sc.quizzes desc, sc.user_id) as rank
    from scored sc
    join profiles p on p.id = sc.user_id
  )
  select r.user_id, r.display_name, r.avg_score, r.quizzes, r.rank,
         r.user_id = auth.uid() as is_me
  from ranked r
  where r.rank <= 50 or r.user_id = auth.uid()
  order by r.rank;
$$;

revoke all on function public.get_leaderboard(boolean) from public;
grant execute on function public.get_leaderboard(boolean) to authenticated;
