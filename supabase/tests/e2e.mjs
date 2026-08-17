/**
 * Learn-Quize · end-to-end test over the real HTTP surface.
 *
 *   node supabase/tests/e2e.mjs                       # against `supabase start`
 *   node supabase/tests/e2e.mjs <api-url> <anon-key>  # against anything else
 *
 * 01_smoke_test.sql proves the SQL. This proves the layer the app actually
 * talks to: GoTrue issues a real JWT, PostgREST resolves the embedded select,
 * RLS is evaluated for a genuine `authenticated` role rather than a SET ROLE,
 * and the RPC argument names match what src/api sends.
 *
 * That gap is not theoretical. `session_questions?select=...,questions!inner(...)`
 * depends on PostgREST detecting the foreign key and on the `options` embed
 * resolving one level deeper — neither of which any amount of psql will tell
 * you about. It is also the single request the quiz player cannot start without.
 *
 * Node 24+ (global fetch). No dependencies, on purpose: a test that needs a
 * install step is a test nobody runs.
 */

const API = (process.argv[2] || 'http://127.0.0.1:54321').replace(/\/$/, '');
const ANON = process.argv[3] || process.env.SUPABASE_ANON_KEY;

if (!ANON) {
  console.error(
    'Missing anon key.\n' +
      '  npx supabase status          # copy "anon key"\n' +
      '  node supabase/tests/e2e.mjs <api-url> <anon-key>',
  );
  process.exit(2);
}

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token || ANON}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* PostgREST returns text on some errors; keep the raw body for the message */
  }
  return { status: res.status, ok: res.ok, body: json, raw: text };
}

const rpc = (name, args, token) =>
  call(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args });

// A fresh account per run, so repeated runs never collide on the unique email
// and never inherit the previous run's XP, streak or answer history.
const stamp = `${Date.now()}-${process.pid}`;
const email = `e2e-${stamp}@learnquize.test`;
const password = 'e2e-test-password';

console.log(`\nLearn-Quize e2e · ${API}\n`);

// ---------------------------------------------------------------- anon access

console.log('catalogue, signed out');
{
  const tracks = await call('/rest/v1/tracks?select=slug,name&is_active=eq.true');
  check('anon can list tracks', tracks.ok && tracks.body?.length > 0, tracks.raw.slice(0, 160));

  const cats = await call(
    '/rest/v1/categories?select=id,slug,approved_question_count&is_active=eq.true&order=slug',
  );
  check('anon can list categories', cats.ok && cats.body?.length > 0, cats.raw.slice(0, 160));

  const playable = (cats.body || []).filter((c) => c.approved_question_count > 0);
  check(
    'at least one category has approved questions',
    playable.length > 0,
    playable.length === 0
      ? 'run: npx supabase db query --local --file supabase/dev/publish_seed.sql'
      : '',
  );
  if (playable.length === 0) {
    report();
  }
  globalThis.__category = playable[0];

  // Signed out, the questions table is not reachable at all — anon has no
  // SELECT grant on it, so this is a 403 rather than an empty result set. The
  // catalogue is browsable logged out; the content itself is not.
  const leak = await call('/rest/v1/questions?select=id&limit=1');
  check('anon cannot read questions at all', !leak.ok, `status ${leak.status}`);

  // Anonymous play would mean XP with nowhere to land.
  const denied = await rpc('start_quiz_session', {
    p_mode: 'practice',
    p_category_id: globalThis.__category.id,
    p_question_count: 5,
  });
  check('anon cannot start a session', !denied.ok, `status ${denied.status}`);
}

// ------------------------------------------------------------------ sign up

console.log('\nauth');
const signup = await call('/auth/v1/signup', {
  method: 'POST',
  body: { email, password, data: { full_name: 'E2E Runner' } },
});
check('sign up succeeds', signup.ok, signup.raw.slice(0, 200));

const token = signup.body?.access_token;
const userId = signup.body?.user?.id;
check('sign up returns a session', Boolean(token), 'email confirmation may be on');
if (!token) report();

// The trigger on auth.users is the only thing standing between a new account
// and a foreign key violation on its first quiz.
const profile = await call(
  `/rest/v1/profiles?select=id,display_name,xp,level,current_streak&id=eq.${userId}`,
  { token },
);
check('profile auto-created by trigger', profile.ok && profile.body?.length === 1, profile.raw.slice(0, 160));
check('display_name carried through from sign up', profile.body?.[0]?.display_name === 'E2E Runner');
check('new account starts at 0 xp, level 1', profile.body?.[0]?.xp === 0 && profile.body?.[0]?.level === 1);

// ------------------------------------------------------------- play a quiz

const category = globalThis.__category;
console.log(`\nquiz loop · ${category.slug}`);

const started = await rpc(
  'start_quiz_session',
  { p_mode: 'practice', p_category_id: category.id, p_question_count: 5 },
  token,
);
check('start_quiz_session', started.ok && typeof started.body === 'string', started.raw.slice(0, 200));
const sessionId = started.body;
if (!sessionId) report();

// The exact request src/api/player.ts makes. If PostgREST cannot resolve this
// embed, the player renders an error screen and nothing else in the app matters.
const embed = await call(
  `/rest/v1/session_questions?select=position,questions!inner(id,body,code_snippet,code_language,difficulty,kind,explanation,options(id,body,is_correct,sort_order))&session_id=eq.${sessionId}&order=position`,
  { token },
);
check('session questions embed resolves', embed.ok, embed.raw.slice(0, 300));
const rows = embed.body || [];
check('served exactly 5 questions', rows.length === 5, `got ${rows.length}`);
check(
  'every question carries its options',
  rows.length > 0 && rows.every((r) => (r.questions?.options?.length ?? 0) >= 2),
);
check(
  'every question has exactly one correct option',
  rows.length > 0 && rows.every((r) => r.questions.options.filter((o) => o.is_correct).length === 1),
);

let expectedCorrect = 0;
for (const [i, row] of rows.entries()) {
  const q = row.questions;
  // Answer the first four correctly and the last one wrong, so the results
  // screen has a non-trivial score to render and the wrong path is exercised.
  const correct = q.options.find((o) => o.is_correct);
  const wrong = q.options.find((o) => !o.is_correct);
  const pick = i < rows.length - 1 ? correct : wrong;
  if (pick.is_correct) expectedCorrect++;

  const res = await rpc(
    'submit_answer',
    { p_session_id: sessionId, p_question_id: q.id, p_option_id: pick.id, p_time_ms: 4000 },
    token,
  );
  if (!res.ok) {
    check(`submit_answer #${i + 1}`, false, res.raw.slice(0, 200));
    report();
  }
  const answer = res.body?.[0];
  if (i === 0) {
    check('submit_answer returns a verdict', answer?.is_correct === true);
    check('submit_answer returns the explanation', typeof answer?.explanation === 'string' && answer.explanation.length > 0);
    check('a correct first-time answer pays xp', answer?.xp_awarded > 0, `got ${answer?.xp_awarded}`);
  }
  if (i === rows.length - 1) {
    check('a wrong answer pays nothing', answer?.xp_awarded === 0, `got ${answer?.xp_awarded}`);
    check('a wrong answer still reveals the right one', Boolean(answer?.correct_option_id));
  }
}

// Replay protection: the same question, twice, in one session.
const replay = await rpc(
  'submit_answer',
  {
    p_session_id: sessionId,
    p_question_id: rows[0].questions.id,
    p_option_id: rows[0].questions.options.find((o) => o.is_correct).id,
    p_time_ms: 1000,
  },
  token,
);
check('the same question cannot be answered twice', !replay.ok, `status ${replay.status}`);

const finished = await rpc('finish_quiz_session', { p_session_id: sessionId }, token);
check('finish_quiz_session', finished.ok, finished.raw.slice(0, 200));
const summary = finished.body?.[0];
check('score is counted correctly', summary?.correct_count === expectedCorrect, `got ${summary?.correct_count} want ${expectedCorrect}`);
check('session earned xp', summary?.xp_earned > 0, `got ${summary?.xp_earned}`);
check('day one starts a streak of 1', summary?.new_streak === 1, `got ${summary?.new_streak}`);
check('unlocked badges come back as an array', Array.isArray(summary?.unlocked));

// -------------------------------------------------------- progress + limits

console.log('\nprogress and boundaries');
{
  const after = await call(`/rest/v1/profiles?select=xp,level,current_streak&id=eq.${userId}`, { token });
  const liveXp = after.body?.[0]?.xp;

  // Not `=== xp_earned`. award_achievements() tops the profile up by the reward
  // of every badge that just unlocked, and a first session always unlocks
  // something — so the honest total is the session plus those rewards.
  let bonus = 0;
  if (summary.unlocked?.length) {
    const list = summary.unlocked.map((s) => `"${s}"`).join(',');
    const badges = await call(
      `/rest/v1/achievements?select=slug,xp_reward&slug=in.(${list})`,
      { token },
    );
    check('unlocked badges are readable', badges.ok, badges.raw.slice(0, 160));
    bonus = (badges.body || []).reduce((sum, b) => sum + b.xp_reward, 0);
  }
  check(
    'profile xp = session xp + badge rewards',
    liveXp === summary.xp_earned + bonus,
    `${liveXp} vs ${summary.xp_earned} + ${bonus}`,
  );

  // The level curve is duplicated in mobile/src/lib/levels.ts, so a drift here
  // means the app renders a different level than the database believes.
  const expectedLevel = Math.max(1, Math.floor((25 + Math.sqrt(625 + 100 * liveXp)) / 50));
  check('level matches the curve', after.body?.[0]?.level === expectedLevel, `${after.body?.[0]?.level} vs ${expectedLevel}`);
  check('profile streak reflects the session', after.body?.[0]?.current_streak === 1);

  // The whole anti-cheat model in one request: the anon key ships inside the
  // APK, so this is exactly what an attacker would try first.
  const tamper = await call(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    token,
    body: { xp: 40_000_000, level: 99 },
    headers: { Prefer: 'return=representation' },
  });
  const stillHonest = await call(`/rest/v1/profiles?select=xp&id=eq.${userId}`, { token });
  check(
    'a user cannot write their own xp',
    !tamper.ok && stillHonest.body?.[0]?.xp === liveXp,
    `status ${tamper.status}, xp now ${stillHonest.body?.[0]?.xp}`,
  );

  // Renaming yourself is allowed — that is the point of the column grant.
  const rename = await call(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    token,
    body: { display_name: 'Renamed' },
  });
  check('a user can still edit their own name', rename.ok, rename.raw.slice(0, 160));

  // The internal scoring helpers must not be reachable over HTTP at all.
  const internal = await rpc('add_league_xp', { p_user_id: userId, p_xp: 999999 }, token);
  check('internal helpers are not callable', !internal.ok, `status ${internal.status}`);

  // Leagues are retired: earning XP must no longer create league rows.
  const league = await call(
    `/rest/v1/league_members?select=xp_earned&user_id=eq.${userId}`,
    { token },
  );
  check('leagues are retired — no league row appears', league.ok && league.body?.length === 0, `${league.body?.length} rows`);

  // Profiles are own-row-only: another user's profile is invisible.
  const others = await call(`/rest/v1/profiles?select=id&id=neq.${userId}&limit=5`, { token });
  check('other profiles are not readable', others.ok && others.body?.length === 0, `${others.body?.length} rows`);

  // This is the real leak surface: `authenticated` DOES hold SELECT on
  // questions, so only the RLS policy stands between a signed-in user and the
  // draft bank. Worth testing separately from the anon case above, which is
  // blocked one layer earlier by the missing grant.
  const draft = await call('/rest/v1/questions?select=id,status&status=neq.approved&limit=1', { token });
  check('a signed-in user cannot read unapproved questions', draft.ok && draft.body?.length === 0, draft.raw.slice(0, 160));

  // Staff-only writes, from a non-staff account.
  const write = await call('/rest/v1/questions', {
    method: 'POST',
    token,
    body: { category_id: category.id, kind: 'single_choice', difficulty: 'easy', body: 'x', explanation: 'x' },
  });
  check('a user cannot author questions', !write.ok, `status ${write.status}`);
}

// -------------------------------------------------- retired arcade surface

// The Arcade lane (Ladder, Survival, Blitz, Ludo) was removed from the app
// and its entry points revoked (migration 20260818090000). This section pins
// the seal: every one of them must refuse a valid signed-in token.

console.log('\nretired arcade surface');
{
  for (const [fn, args] of [
    ['start_arcade_run', { p_mode_slug: 'ladder', p_category_id: category.id }],
    ['next_question', { p_session_id: sessionId }],
    ['bank_ladder', { p_session_id: sessionId }],
    ['start_ludo_match', { p_category_id: null }],
    ['active_ludo_match', {}],
    ['ludo_move', { p_session_id: sessionId, p_token: 0 }],
  ]) {
    const sealed = await rpc(fn, args, token);
    check(`${fn} is sealed`, !sealed.ok, `status ${sealed.status}`);
  }

  for (const fn of ['apply_mode_rules', 'ludo_apply_move', 'ludo_bot_turns']) {
    const sealed = await rpc(fn, {}, token);
    check(`${fn} is not callable from a client`, !sealed.ok, `status ${sealed.status}`);
  }

  // The tables behind them still refuse direct writes.
  const cheatRecord = await call('/rest/v1/mode_records', {
    method: 'POST', token,
    body: { user_id: userId, mode_slug: 'survival', week_start: '2026-08-10', best_value: 999999 },
  });
  check('a user cannot write a leaderboard row', !cheatRecord.ok, `status ${cheatRecord.status}`);

  const cheatState = await call(`/rest/v1/quiz_sessions?id=eq.${sessionId}`, {
    method: 'PATCH', token, body: { state: { lives: 99 } },
  });
  check('a user cannot write run state', !cheatState.ok, `status ${cheatState.status}`);

  // The retired modes cannot come back in through the focus entry point.
  const survival = await rpc(
    'start_quiz_session',
    { p_mode: 'survival', p_category_id: category.id, p_question_count: 5 },
    token,
  );
  check('start_quiz_session refuses retired modes', !survival.ok, `status ${survival.status}`);
}

// ------------------------------------------------------------- leaderboard

console.log('\nleaderboard');
{
  // One finished quiz is below the three-quiz floor: not ranked yet.
  const early = await rpc('get_leaderboard', { p_all_time: true }, token);
  check('get_leaderboard responds', early.ok, early.raw.slice(0, 200));
  check(
    'one quiz is below the ranking floor',
    (early.body || []).every((r) => r.user_id !== userId),
  );

  // Play two more quick sessions to cross the floor.
  for (let s = 0; s < 2; s++) {
    const run = await rpc(
      'start_quiz_session',
      { p_mode: 'practice', p_category_id: category.id, p_question_count: 3 },
      token,
    );
    if (!run.ok) { check(`floor session ${s + 1} starts`, false, run.raw.slice(0, 200)); break; }
    const served = await call(
      `/rest/v1/session_questions?select=questions!inner(id,options(id,is_correct))&session_id=eq.${run.body}`,
      { token },
    );
    for (const row of served.body || []) {
      await rpc('submit_answer', {
        p_session_id: run.body,
        p_question_id: row.questions.id,
        p_option_id: row.questions.options.find((o) => o.is_correct).id,
        p_time_ms: 2000,
      }, token);
    }
    await rpc('finish_quiz_session', { p_session_id: run.body }, token);
  }

  const board = await rpc('get_leaderboard', { p_all_time: true }, token);
  const me = (board.body || []).find((r) => r.user_id === userId);
  check('three finished quizzes earn a rank', Boolean(me), `rows: ${board.body?.length}`);
  check('the caller\'s row is flagged is_me', me?.is_me === true);
  check('quizzes counts all three sessions', me?.quizzes === 3, `got ${me?.quizzes}`);
  check(
    'avg_score is a rounded percentage',
    typeof me?.avg_score === 'number' && me.avg_score >= 0 && me.avg_score <= 100,
    `got ${me?.avg_score}`,
  );
  check(
    'the board exposes names and scores, nothing else',
    me && Object.keys(me).sort().join(',') === 'avg_score,display_name,is_me,quizzes,rank,user_id',
    me ? Object.keys(me).join(',') : '',
  );
  check(
    'nobody below the floor is ranked',
    (board.body || []).every((r) => r.quizzes >= 3),
  );
}

// -------------------------------------------------------- account deletion

// Doubles as cleanup: without this, every run of this suite against a hosted
// project would leave a permanent account inflating the leaderboard.
console.log('\naccount deletion');
{
  const del = await rpc('delete_account', {}, token);
  check('delete_account succeeds', del.ok, del.raw.slice(0, 200));

  const gone = await call(`/rest/v1/profiles?select=id&id=eq.${userId}`, { token });
  check('the profile is gone', gone.body?.length === 0, `${gone.body?.length} rows`);

  const relogin = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  check('the deleted account cannot sign in again', !relogin.ok, `status ${relogin.status}`);
}

report();

/* -------------------------------------------------------- retired sections
   The full arcade and ludo gameplay suites (ladder banks and busts, survival
   lives, a complete ludo match against the bots) were deleted along with the
   features on 2026-08-18. If the arcade comes back, recover them from git:
   `git log --diff-filter=D -- supabase/tests/e2e.mjs` — and re-grant the
   entry points revoked in migration 20260818090000. */

function report() {
  console.log('');
  if (failures.length) {
    console.log(`FAIL — ${failures.length} of ${passed + failures.length} checks failed\n`);
    for (const f of failures) console.log(`  · ${f}`);
    console.log('');
    process.exit(1);
  }
  console.log(`PASS — ${passed} checks over the live HTTP API\n`);
  process.exit(0);
}
