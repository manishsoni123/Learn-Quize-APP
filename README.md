# Learn-Quize

A gamified quiz and practice app for developers, AI/ML engineers and traders.
React Native + Expo on the front, Supabase behind it. Android first; the same
codebase builds for iOS whenever the Apple account is bought.

**Status:** database and mobile app built and verified. Admin panel not started.

---

## What is here

```
supabase/
  migrations/          the schema, in apply order
  tests/run.sh         one command, throwaway Postgres, ~30s
  seed.sql             120 questions — 10 for each of the 12 launch categories
mobile/
  app/                 screens (expo-router, file-based)
  src/theme/           design tokens — every colour and spacing value
  src/lib/             supabase client, auth, level curve
  src/api/             typed data layer over the three RPCs
  src/components/      ui primitives + game components
content/
  question-template.csv  the shape the team fills in
```

## Run it

### 1. Database

```bash
bash supabase/tests/run.sh        # verify everything first (needs Docker)
```

**Locally** — no account, no internet, everything in Docker. `start` applies
every migration and loads `seed.sql` for you:

```bash
npx supabase start
npx supabase status               # copy the API URL and anon key into mobile/.env
```

**Against a hosted project:**

```bash
npx supabase login
npx supabase link --project-ref <your-ref>
npx supabase db push
npx supabase db query --linked --file supabase/seed.sql
```

Either way, sign up in the app first, then publish the seed bank:

```bash
npx supabase db query --local --file supabase/dev/publish_seed.sql    # or --linked
```

That makes the newest account staff and approves the seed questions under it.
Until it runs, **every category shows zero questions and no quiz will start** —
seed content deliberately lands as `in_review`. The approval gate is the
product's whole quality story and seeding around it would be the first crack.
On production, approve through the admin panel instead, so `approved_by`
records who actually reviewed the question.

### 2. App

```bash
cd mobile
cp .env.example .env              # fill in URL + anon key
npm install
npx expo start                    # scan the QR code with Expo Go
```

Without a `.env` the app shows setup instructions rather than a stack trace.

> **Pointing a phone at the local stack?** Use your machine's LAN address, not
> `127.0.0.1` — that resolves to the phone itself. `npx supabase status` prints
> the loopback form, so swap the host:
> `EXPO_PUBLIC_SUPABASE_URL=http://192.168.x.x:54321`. Phone and machine must be
> on the same network; on a corporate Wi-Fi that isolates clients, tether both
> to a phone hotspot or use a hosted project.
>
> That address changes whenever the machine joins a different network, and the
> failure is nasty: requests to a dead LAN address do not error, they *hang*, so
> sign-in spins forever and looks like a broken backend. `src/lib/supabase.ts`
> defends against this — in dev, if the configured host is a private address, it
> takes the host from Metro instead, which is by definition reachable because
> the bundle just came over it. Hosted `*.supabase.co` URLs are never rewritten.

> **Adding a dependency?** Use `npx expo install <pkg>`, not `npm install` — it
> picks the version the SDK was built against. `npx expo install --fix` repairs
> a tree that has drifted, and `npx expo-doctor` will tell you if it has.

### 3. Ship to the Play Store

```bash
npm i -g eas-cli && eas login
eas build:configure
eas build --platform android --profile production   # produces an .aab
eas submit --platform android
```

No Mac needed for iOS later — EAS builds it in the cloud.

---

### Why the SDK is pinned to 54

**Do not upgrade the Expo SDK without reading this.** It will look like the
project is a year behind and the fix is a one-line bump. It is not.

Expo Go on the **iOS App Store is version 54.0.2, released September 2025**, and
there is no newer iOS client — verified against the US, GB and IN storefronts.
Expo publishes clients for SDK 55, 56 and 57, but only as `.tar.gz` simulator
builds on GitHub, which cannot be installed on a physical iPhone.

So SDK 54 is the highest version testable on a real iPhone without the $99/yr
Apple Developer Program. Moving to 57 costs nothing technically — it typechecks
and bundles fine — but it silently removes every iPhone from the test loop, and
the error it produces (*"Project is incompatible with this version of Expo
Go"*) points at the phone rather than at the project.

Upgrade when one of these becomes true: Expo ships a newer App Store client, or
the Apple Developer account is bought and iOS testing moves to EAS development
builds. Not before.

Android has no such ceiling — Expo Go 54.0.8+ from the Play Store is fine.

## Verification

`bash supabase/tests/run.sh` spins up a disposable Postgres 17, applies every
migration, loads the seed bank, runs ~25 assertions, and deletes the container.
Run it on every SQL change. It asserts, among other things:

- signing up creates a profile automatically
- an unapproved question is never served to a user
- a correct first-time medium answer pays exactly 15 XP
- re-answering a known question pays strictly less than a fresh one
- the same question cannot be answered twice in one session
- an answer is rejected for a question the session never served
- 75 XP is level 2, day one starts a streak of 1, and a league room exists
- one user cannot read another's answers, sessions, or learning state
- a user cannot write to `profiles.xp` or `profiles.current_streak` at all
- the internal scoring helpers are not callable from a client
- every question has exactly one correct option

`e2e.mjs` adds, over real HTTP: that GoTrue's trigger creates a profile, that
PostgREST resolves the player's embedded select, that a signed-in user cannot
read the draft bank, that `PATCH /profiles {xp}` is refused while `{display_name}`
succeeds, and that a finished session lands in a league room with matching XP.

It earned its place immediately: it found an `infinite recursion detected in
policy` on `league_members` that psql could not see, because the smoke test
exercises RLS through `set_config` rather than as a real `authenticated` role.
The League tab would have thrown for every user on the first run.

`run.sh` stops at the SQL, though. `supabase/tests/e2e.mjs` covers the layer the
app actually talks to — a real GoTrue token, PostgREST resolving the embedded
select, RLS evaluated for a genuine `authenticated` role:

```bash
npx supabase start
node supabase/tests/e2e.mjs                       # or: <api-url> <anon-key>
```

The gap between the two is not theoretical. The quiz player cannot start
without `session_questions?select=...,questions!inner(...,options(...))`, and
whether PostgREST resolves that embed is not something psql can tell you.

For the app: `cd mobile && npm run typecheck`, `npx expo-doctor`, and
`npx expo export --platform android` to prove it bundles.

---

## How the security model works

Supabase exposes this database directly to the app, and the anon key ships
inside the APK. So the rules live in the database, not in the client:

- **Content** is readable once `status = 'approved'`; only staff can write it.
- **User data** is readable only by its owner, enforced by RLS.
- **Progress columns** (`xp`, `level`, `current_streak`, …) have no UPDATE grant
  at all. `GRANT UPDATE (username, display_name, …)` names the columns a user
  may change; everything else moves only through three RPC entry points.

Those entry points are `start_quiz_session`, `submit_answer` and
`finish_quiz_session`. They are `SECURITY DEFINER`, so they run as the owner
and bypass RLS on purpose — that is the only path by which XP can move. The
helpers they call (`add_league_xp`, `award_achievements`, `touch_daily_streak`)
have EXECUTE revoked from every client role.

The app *can* read `options.is_correct`, which is deliberate: it needs the
answer for instant feedback and offline play. Knowing it early buys nothing,
because `submit_answer` re-derives correctness server-side before awarding
anything.

## The XP formula

Lives in `submit_answer`, and is the thing to tune once real usage exists:

```
base       = 10
difficulty = easy 1.0 · medium 1.5 · hard 2.5
speed      = 1.25 when answered inside half the per-question allowance
streak     = min(1 + current_streak * 0.02, 2.0)      -- caps at 2x on day 50
first_time = 1.0 first correct answer, else 0.3

xp = round(base * difficulty * speed * streak * first_time)
```

`first_time` is the line that matters. Without it the fastest route up the
leaderboard is re-answering one easy question for six hours.

Levels use a cumulative curve of `25 * n * (n - 1)` — level 2 at 50 XP, level 5
at 500, level 10 at 2,250. Fast at the start so a first session feels like
progress, steep later so a high level still means something.

## Content

Twelve of the 28 seeded categories are `is_active`. The rest stay dark until
their banks are filled — a category with 30 questions in it reads as abandoned.
Flip `is_active` as each reaches roughly 500 questions.

Every question records `source`, `source_url` and `source_licence`. Keep those
populated on bulk imports; it is the only way to answer a licensing question
later without guesswork.

## Two lanes

**Focus** is the study tool: untimed, explanations on every answer, spaced
repetition, and a whole question set fetched up front so a dropped connection
mid-session costs nothing.

**Arcade** puts something at stake. Same questions, same XP economy, different
contract with the player — and its own palette, because crossing between them
should feel like walking into a different room.

| Mode | Rules | Scored on |
|---|---|---|
| **Ladder** | Ten rungs, each worth more. After every correct answer: bank, or risk it all on the next one. | XP banked |
| **Survival** | Three lives, difficulty escalating, runs until you die. | Questions survived |
| **Blitz** | Sixty seconds. | Correct answers |
| **Ludo** | The real board against three bots. Answer correctly to earn your roll. | Matches won |

**Ludo** is real Ludo, not a quiz wearing a board: a six to leave the yard,
another turn on a six with three in a row forfeiting, capture on unsafe
squares, the four starts and four stars safe, home hit exactly, all four tokens
home to win. Nobody needs teaching, which is the entire point.

Token positions are stored **relative to each player's own start** — `-1` yard,
`0–51` track, `52–56` home column, `57` home — so a move is `pos + roll` for
every seat and the seat offset is applied in exactly one place: deciding
whether two tokens share an absolute square. Absolute storage would push
"whose turn is it" into every rule.

The die is rolled inside `apply_mode_rules`, never on the phone. Bots simulate
their answers rather than drawing questions — three bots taking a card each per
turn would empty a category in one match — and all three seats resolve in a
single `ludo_move` call, so a turn costs one round trip and returns a log to
animate. `src/lib/ludoBoard.ts` mirrors the move rules so the board can light
up tappable tokens, but it is advisory: `ludo_move` re-derives the legal set
and refuses anything outside it.

Matches run long, so they are **resumable** — the board lives in
`quiz_sessions.state` and Arcade offers an unfinished one back rather than
silently replacing it.

Ladder is the one worth understanding, because it is the only mode where
`submit_answer` awards nothing. Its `defer_xp` rule keeps every point riding on
the run; `bank_ladder()` is the sole path by which any of it reaches a profile.
A bust therefore genuinely pays zero — and if that ever quietly stops being
true, the mode has no point, which is why three separate tests assert it.

Arcade streams questions one at a time through `next_question()` rather than
picking a set up front. Survival has no length to pick, and streaming is also
what lets the server choose each question knowing how the run is going.
`session_questions` still gates every answer, so the anti-replay guarantee is
unchanged.

Mode parameters — lives, durations, the rung payout curve — live in the
`game_modes` table rather than in code, because those are the numbers that get
tuned constantly once real people play. Behaviour is code; the numbers are rows.

## Next

1. **Admin panel** (Next.js on Vercel) — editor, approval queue, CSV import,
   reports inbox. The team is the launch bottleneck, so this unblocks more than
   any app feature does — and Arcade has made that worse, not better. Survival
   is endless but the bank is 120 questions, so a good run empties a category
   in one sitting, after which the `first_time` multiplier drops payouts to 30%
   and the game reads as having stopped rewarding you.
2. **New question formats** — Order the Code (Parsons), Spot the Bug, Match
   Pairs, Fill the Blank, Chart Reader. The renderer in
   `src/components/questions/` dispatches on `question.kind` and
   `questions.payload` is already there to hold them, so each is a new file and
   one line in a switch. They are blocked on the admin panel, not on the app:
   nobody is hand-writing a Parsons problem into a CSV.
2. Push notifications for the streak reminder.
3. Daily challenge generation (a cron that fills `daily_challenges`).
4. Weekly league rollover (promotion/relegation cron).
