-- Learn-Quize · 006 · Row Level Security and privileges
--
-- Supabase exposes this database straight to the app. The anon key ships
-- inside the APK and anyone can read it out, so without the policies below a
-- bored user could edit anyone's XP or dump every row in the database.
--
-- The shape of the rules:
--   · content   — readable when approved, writable only by staff
--   · user data — readable only by its owner
--   · progress  — not directly writable by anyone; migration 005 owns it
--
-- Writes that award XP go through SECURITY DEFINER functions, which run as the
-- owner and bypass RLS on purpose. That is why almost no INSERT/UPDATE policy
-- appears here: the client is not supposed to have one.

-- ============================================================ close everything

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

alter table public.tracks                    enable row level security;
alter table public.categories                enable row level security;
alter table public.questions                 enable row level security;
alter table public.options                   enable row level security;
alter table public.profiles                  enable row level security;
alter table public.quiz_sessions             enable row level security;
alter table public.session_questions         enable row level security;
alter table public.answers                   enable row level security;
alter table public.user_question_stats       enable row level security;
alter table public.achievements              enable row level security;
alter table public.user_achievements         enable row level security;
alter table public.daily_challenges          enable row level security;
alter table public.daily_challenge_questions enable row level security;
alter table public.leagues                   enable row level security;
alter table public.league_members            enable row level security;
alter table public.reports                   enable row level security;

-- ============================================================ content

grant select on public.tracks, public.categories to anon, authenticated;
grant select on public.questions, public.options to authenticated;
grant insert, update, delete on public.questions, public.options,
                                public.categories, public.tracks to authenticated;

create policy tracks_read_active on public.tracks
  for select using (is_active or public.is_staff());

create policy tracks_staff_write on public.tracks
  for all using (public.is_staff()) with check (public.is_staff());

create policy categories_read_active on public.categories
  for select using (is_active or public.is_staff());

create policy categories_staff_write on public.categories
  for all using (public.is_staff()) with check (public.is_staff());

-- Drafts are invisible to users. This is the approval gate — an AI-generated
-- question with a wrong answer cannot reach anyone until a human approves it.
create policy questions_read_approved on public.questions
  for select using (status = 'approved' or public.is_staff());

create policy questions_staff_write on public.questions
  for all using (public.is_staff()) with check (public.is_staff());

-- Options follow their question. Note the app *can* see is_correct: it needs
-- it for instant feedback and for offline play. That is deliberate — XP is
-- awarded by submit_answer(), which re-checks the answer server-side, so
-- knowing the answer early buys a cheater nothing on the leaderboard.
create policy options_read_with_question on public.options
  for select using (
    exists (
      select 1 from public.questions q
      where q.id = options.question_id
        and (q.status = 'approved' or public.is_staff())
    )
  );

create policy options_staff_write on public.options
  for all using (public.is_staff()) with check (public.is_staff());

-- ============================================================ profiles

grant select on public.profiles to authenticated;

-- Progress columns are absent from this list on purpose. A user may rename
-- themselves; they may not award themselves 40 million XP.
grant update (username, display_name, avatar_url,
              primary_track_id, daily_goal_xp, timezone)
  on public.profiles to authenticated;

-- Leaderboards need to read other people's names, avatars and XP. No email or
-- other PII lives on this table — that stays in auth.users, which is not
-- exposed to the client at all.
create policy profiles_read_all on public.profiles
  for select to authenticated using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================ own activity

grant select on public.quiz_sessions, public.session_questions,
                public.answers, public.user_question_stats to authenticated;

create policy sessions_read_own on public.quiz_sessions
  for select to authenticated using (user_id = auth.uid());

create policy session_questions_read_own on public.session_questions
  for select to authenticated using (
    exists (
      select 1 from public.quiz_sessions s
      where s.id = session_questions.session_id
        and s.user_id = auth.uid()
    )
  );

create policy answers_read_own on public.answers
  for select to authenticated using (user_id = auth.uid());

create policy stats_read_own on public.user_question_stats
  for select to authenticated using (user_id = auth.uid());

-- ============================================================ gamification

grant select on public.achievements, public.user_achievements,
                public.daily_challenges, public.daily_challenge_questions,
                public.leagues, public.league_members to authenticated;

create policy achievements_read_active on public.achievements
  for select to authenticated using (is_active or public.is_staff());

create policy achievements_staff_write on public.achievements
  for all using (public.is_staff()) with check (public.is_staff());

create policy user_achievements_read_own on public.user_achievements
  for select to authenticated using (user_id = auth.uid());

create policy daily_challenges_read on public.daily_challenges
  for select to authenticated using (on_date <= current_date);

create policy daily_challenge_questions_read on public.daily_challenge_questions
  for select to authenticated using (on_date <= current_date);

-- The leagues the caller belongs to.
--
-- SECURITY DEFINER is load-bearing here, not a shortcut. A policy on
-- league_members that reads league_members re-enters itself, and Postgres
-- aborts the query with 42P17 "infinite recursion detected in policy". The
-- leagues policy inherits the same fault the moment its subquery touches
-- league_members. Running the lookup as the owner bypasses RLS inside the
-- function, which is what breaks the cycle.
--
-- Safe because the function takes no arguments and is hard-wired to
-- auth.uid(): it can only ever describe the caller, whoever calls it.
create or replace function public.my_league_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select lm.league_id
    from public.league_members lm
   where lm.user_id = (select auth.uid());
$$;

-- You can see your own room, and nothing else. Reading every league in the
-- system would let a client build a global board the product does not have.
create policy leagues_read_own_room on public.leagues
  for select to authenticated
  using (id in (select public.my_league_ids()));

create policy league_members_read_own_room on public.league_members
  for select to authenticated
  using (league_id in (select public.my_league_ids()));

-- ============================================================ reports

grant select, insert on public.reports to authenticated;

create policy reports_insert_own on public.reports
  for insert to authenticated with check (user_id = auth.uid());

create policy reports_read_own on public.reports
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create policy reports_staff_resolve on public.reports
  for update using (public.is_staff()) with check (public.is_staff());

-- ============================================================ function access

grant execute on function public.start_quiz_session(public.quiz_mode, uuid, integer)  to authenticated;
grant execute on function public.submit_answer(uuid, uuid, uuid, integer)             to authenticated;
grant execute on function public.finish_quiz_session(uuid)                            to authenticated;
grant execute on function public.level_for_xp(integer)                                to authenticated, anon;
grant execute on function public.xp_for_level(integer)                                to authenticated, anon;
-- anon needs this too: the tracks and categories policies call is_staff(), and
-- policy expressions run with the caller's privileges. SQL does not promise to
-- short-circuit `is_active or is_staff()`, so a signed-out user browsing the
-- category list would hit a permission error without this grant. It returns
-- false for anon — auth.uid() is null, so no profile row matches.
grant execute on function public.is_staff()                                           to authenticated, anon;
-- Same reasoning as is_staff(): the league policies call this, and a policy
-- expression runs with the caller's privileges. The revoke is not redundant —
-- this function is created further down this file than the blanket revoke at
-- the top, so it still carries Postgres's default EXECUTE grant to PUBLIC.
revoke execute on function public.my_league_ids()                                   from public, anon;
grant  execute on function public.my_league_ids()                                     to authenticated;

-- Internal only — reachable through the three entry points above, never
-- directly, or a client could hand itself league XP and badges.
revoke execute on function public.touch_daily_streak(uuid) from public, anon, authenticated;
revoke execute on function public.add_league_xp(uuid, integer) from public, anon, authenticated;
revoke execute on function public.award_achievements(uuid) from public, anon, authenticated;
revoke execute on function public.review_interval_days(integer) from public, anon, authenticated;
