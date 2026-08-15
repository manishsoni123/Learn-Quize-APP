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

  const league = await call('/rest/v1/league_members?select=xp_earned,final_rank&limit=5', { token });
  check('league standing is readable', league.ok, league.raw.slice(0, 160));
  check('the session put the player in a league room', league.body?.length === 1, `${league.body?.length} rows`);
  check('league xp tracks the session', league.body?.[0]?.xp_earned === summary.xp_earned, `${league.body?.[0]?.xp_earned} vs ${summary.xp_earned}`);

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

// ------------------------------------------------------------------ arcade

console.log('\narcade');
{
  const modes = await call('/rest/v1/game_modes?select=slug,name,rules&lane=eq.arcade&order=sort_order', { token });
  check('arcade modes are readable', modes.ok && modes.body?.length === 3, modes.raw.slice(0, 200));

  const ladderRules = (modes.body || []).find((m) => m.slug === 'ladder')?.rules;
  check('ladder ships a rung curve', Array.isArray(ladderRules?.rungs) && ladderRules.rungs.length === 10);

  // ---- ladder: climb three rungs, then bank
  const started = await rpc('start_arcade_run', { p_mode_slug: 'ladder', p_category_id: category.id }, token);
  check('start_arcade_run', started.ok && typeof started.body === 'string', started.raw.slice(0, 200));
  const run = started.body;

  const before = await call(`/rest/v1/profiles?select=xp&id=eq.${userId}`, { token });
  const xpBefore = before.body?.[0]?.xp ?? 0;

  const served = new Set();
  let lastState = null;

  for (let i = 1; i <= 3; i++) {
    const q = await rpc('next_question', { p_session_id: run }, token);
    if (!q.ok || !q.body) {
      check(`next_question #${i}`, false, q.raw.slice(0, 200));
      break;
    }
    check(`next_question #${i} carries options`, (q.body.options?.length ?? 0) >= 2);
    check(`next_question #${i} is a fresh question`, !served.has(q.body.id));
    served.add(q.body.id);

    const right = q.body.options.find((o) => o.is_correct);
    const res = await rpc(
      'submit_answer',
      { p_session_id: run, p_question_id: q.body.id, p_option_id: right.id, p_time_ms: 3000 },
      token,
    );
    if (!res.ok) {
      check(`ladder answer #${i}`, false, res.raw.slice(0, 200));
      break;
    }
    lastState = res.body?.[0]?.run_state;

    // The mechanic depends on this: nothing is earned per answer, it is only
    // ever riding on the run.
    check(`ladder answer #${i} pays nothing up front`, res.body?.[0]?.xp_awarded === 0, `got ${res.body?.[0]?.xp_awarded}`);
    check(`ladder answer #${i} climbed to rung ${i}`, lastState?.rung === i, `rung ${lastState?.rung}`);
  }

  const during = await call(`/rest/v1/profiles?select=xp&id=eq.${userId}`, { token });
  check('ladder credits nothing before banking', during.body?.[0]?.xp === xpBefore, `${during.body?.[0]?.xp} vs ${xpBefore}`);

  const banked = await rpc('bank_ladder', { p_session_id: run }, token);
  check('bank_ladder', banked.ok, banked.raw.slice(0, 200));
  check('rung 3 banks exactly 40 by the seeded curve', banked.body?.[0]?.banked === 40, `got ${banked.body?.[0]?.banked}`);

  const after = await call(`/rest/v1/profiles?select=xp&id=eq.${userId}`, { token });
  check('banked xp reached the profile', after.body?.[0]?.xp === xpBefore + 40, `${after.body?.[0]?.xp} vs ${xpBefore + 40}`);

  const done = await rpc('finish_quiz_session', { p_session_id: run }, token);
  check('finishing a run reports what it scored', done.body?.[0]?.run?.value === 40, JSON.stringify(done.body?.[0]?.run));
  check('a first run is a personal best', done.body?.[0]?.run?.is_record === true);

  // ---- ladder: bust
  const bust = await rpc('start_arcade_run', { p_mode_slug: 'ladder', p_category_id: category.id }, token);
  const bustRun = bust.body;
  const bustBefore = (await call(`/rest/v1/profiles?select=xp&id=eq.${userId}`, { token })).body?.[0]?.xp;

  const q1 = await rpc('next_question', { p_session_id: bustRun }, token);
  await rpc('submit_answer', {
    p_session_id: bustRun, p_question_id: q1.body.id,
    p_option_id: q1.body.options.find((o) => o.is_correct).id, p_time_ms: 3000,
  }, token);

  const q2 = await rpc('next_question', { p_session_id: bustRun }, token);
  const missed = await rpc('submit_answer', {
    p_session_id: bustRun, p_question_id: q2.body.id,
    p_option_id: q2.body.options.find((o) => !o.is_correct).id, p_time_ms: 3000,
  }, token);

  check('a wrong answer ends the ladder', missed.body?.[0]?.run_state?.run_over === true);
  check('a bust leaves nothing riding', missed.body?.[0]?.run_state?.unbanked === 0);

  await rpc('bank_ladder', { p_session_id: bustRun }, token);
  const bustAfter = (await call(`/rest/v1/profiles?select=xp&id=eq.${userId}`, { token })).body?.[0]?.xp;
  check('a busted ladder pays nothing, even if banked', bustAfter === bustBefore, `${bustAfter} vs ${bustBefore}`);
  await rpc('finish_quiz_session', { p_session_id: bustRun }, token);

  // ---- survival: three lives
  const surv = await rpc('start_arcade_run', { p_mode_slug: 'survival', p_category_id: category.id }, token);
  check('start survival', surv.ok, surv.raw.slice(0, 200));

  for (let i = 1; i <= 3; i++) {
    const q = await rpc('next_question', { p_session_id: surv.body }, token);
    const wrong = q.body.options.find((o) => !o.is_correct);
    const res = await rpc('submit_answer', {
      p_session_id: surv.body, p_question_id: q.body.id,
      p_option_id: wrong.id, p_time_ms: 3000,
    }, token);
    check(`survival: ${3 - i} lives left after ${i} misses`, res.body?.[0]?.run_state?.lives === 3 - i, `got ${res.body?.[0]?.run_state?.lives}`);
    check(`survival run_over is ${i === 3} after ${i} misses`, res.body?.[0]?.run_state?.run_over === (i === 3));
  }
  await rpc('finish_quiz_session', { p_session_id: surv.body }, token);

  // ---- boundaries
  const anonRun = await rpc('start_arcade_run', { p_mode_slug: 'ladder', p_category_id: category.id });
  check('anon cannot start a run', !anonRun.ok, `status ${anonRun.status}`);

  const fakeMode = await rpc('start_arcade_run', { p_mode_slug: 'not_a_mode', p_category_id: category.id }, token);
  check('an unknown mode is refused', !fakeMode.ok, `status ${fakeMode.status}`);

  const cheatRecord = await call('/rest/v1/mode_records', {
    method: 'POST', token,
    body: { user_id: userId, mode_slug: 'survival', week_start: '2026-08-10', best_value: 999999 },
  });
  check('a user cannot write a leaderboard row', !cheatRecord.ok, `status ${cheatRecord.status}`);

  const cheatState = await call(`/rest/v1/quiz_sessions?id=eq.${surv.body}`, {
    method: 'PATCH', token, body: { state: { lives: 99 } },
  });
  check('a user cannot write run state', !cheatState.ok, `status ${cheatState.status}`);

  const internal = await rpc('apply_mode_rules', { p_session_id: surv.body, p_correct: true }, token);
  check('apply_mode_rules is not callable', !internal.ok, `status ${internal.status}`);

  const board = await call('/rest/v1/mode_records?select=mode_slug,best_value&order=best_value.desc&limit=5', { token });
  check('the board is readable', board.ok && board.body?.length > 0, board.raw.slice(0, 160));
}

report();

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
