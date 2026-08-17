# Learn-Quize — Production Readiness Plan

## Context

Learn-Quize (Expo SDK 54 + Supabase, freshly redesigned to the Dynatech design
system) was audited end-to-end for production readiness. Two deep audits (mobile
+ backend) found the app is a well-crafted dev build with **12 ship-blockers**:
stock Expo icons, no EAS/env config (a prod build today would inline the LAN dev
URL), sign-up that silently dead-ends against hosted Supabase, no password
reset, no account deletion (Play Store requirement), Android back-button
bypassing the quiz, a splash-screen hang path, the leaderboard migration
untracked in git, a staff-promotion footgun script, a broken hosted seeding
path, and a leaderboard that's both unindexed (full table scan) and gameable
(one perfect 1-question quiz = permanent #1).

User-confirmed scope: **hosted Supabase** + **full Play Store release prep** +
**error boundary only (no Sentry)** + **build the CSV question importer**.

The backend's RLS/grants architecture, migration ordering, and 90-assertion
test suite are solid — this plan hardens and packages, it does not rebuild.

## Key design decisions (validated by Plan agent against the code)

1. **League growth**: no-op `add_league_xp` body (one CREATE OR REPLACE covers
   all 3 call sites); flip smoke/e2e league assertions to expect zero rows.
2. **Arcade/ludo RPCs**: revoke EXECUTE from `authenticated` on all 6 entry
   points (`bank_ladder` is a live XP-credit path with no UI). Smoke game loops
   run as postgres so they survive; e2e arcade/ludo sections (lines ~316-580)
   become "sealed surface" 401/403 checks.
3. **Account deletion**: SQL `delete_account()` SECURITY DEFINER doing
   `delete from auth.users where id = auth.uid()` — cascades verified; also
   used by e2e for self-cleanup (fixes its prod-account litter).
4. **finish_quiz_session**: minimal-diff replace — `for update` lock, capture
   already-finished, side-effects only when first finish AND answered_count>0.
5. **Offline answers**: no queue (correctness is server-authoritative). Pending
   state on submit; on failure keep question unanswered with inline retry;
   block finish() while a submission is outstanding. Kills the "0 of 0" bug.
6. **Brand assets**: `mobile/scripts/generate-assets.mjs` using @resvg/resvg-js
   (prebuilt win32 binary), rendering the serif-italic cyan "Q" (Newsreader
   italic TTF already in node_modules) on `#0A3043` → icon/adaptive/splash/
   favicon PNGs. Fallback: sharp, else documented manual spec.
7. **Versioning**: EAS remote — `appVersionSource: "remote"` +
   `autoIncrement: true` on production profile.
8. **Migrations**: four thematic files (20260818090000..090300), CREATE OR
   REPLACE preserves ACLs; every new function gets explicit revoke from
   public/anon (established pattern at 20260816090300:58-64).

## Phases

### A. Branch + commit (first, blocking everything)
Branch `release/v1`. Commit 1: the entire redesign working tree. Commit 2:
`supabase/migrations/20260817130000_leaderboard.sql` (currently untracked).

### B. Backend hardening — 4 new migrations + test surgery
- `20260818090000_retire_leagues_and_arcade.sql` — no-op add_league_xp; revoke
  start_arcade_run, next_question, bank_ladder, start_ludo_match, ludo_move,
  active_ludo_match from authenticated.
- `20260818090100_security_and_reports.sql` — drop `profiles_read_all` → own-
  row SELECT policy (leaderboard RPC joins internally, doesn't need it);
  `grant update (resolved_at, resolved_by) on reports to authenticated` (fixes
  dead staff-resolve policy); approval-time trigger asserting ≥2 options and
  exactly 1 correct.
- `20260818090200_session_integrity.sql` — finish_quiz_session guards
  (decision 4); start_quiz_session: mode allow-list
  ('practice','timed_test','weak_spots') + auto-close caller's previous
  unfinished focus session; partial indexes on quiz_sessions:
  `(finished_at) where finished_at is not null` and `(user_id, finished_at
  desc) where finished_at is not null`.
- `20260818090300_leaderboard_and_account.sql` — get_leaderboard replace:
  `set search_path = ''` + schema-qualified + `having count(*) >= 3` floor;
  new `delete_account()`.
- Tests: `supabase/tests/01_smoke_test.sql` (league→zero-rows; add revoke
  assertions, delete_account, double-finish idempotency, 0-answer streak
  guard, survival-mode rejection, staff report-resolve);
  `supabase/tests/e2e.mjs` (arcade/ludo → sealed-surface checks; add
  get_leaderboard section: floor, self-row, field exposure; end with
  delete_account cleanup).
- Gate: `bash supabase/tests/run.sh` green, then local `supabase migration up`
  + `node supabase/tests/e2e.mjs`.

### C. Hosted Supabase
- User creates project; `supabase link`; `supabase db push`.
- `scripts/seed-hosted.sh` — psql-based (`-v ON_ERROR_STOP=1 -f seed.sql` via
  pooler connection string); README's `supabase db query` seeding instructions
  are wrong and get replaced.
- Delete `supabase/dev/publish_seed.sql` (staff-promotion footgun); replace
  with `supabase/dev/promote_staff.sql` taking explicit `-v email='...'`,
  failing on no/multi-match.
- `docs/hosted-setup.md` — dashboard checklist: site URL, redirect allow-list
  incl. `learnquize://**`, confirmations ON, min password length 8, shared-SMTP
  rate-limit caveat, backups note. Update README.

### D. Mobile auth flows
- `src/lib/auth.tsx`: signUp returns needs-confirmation when
  `data.session === null` (+ resend); auth error mapping.
- Sign-in screen: "check your email" state; "Forgot password?" →
  `resetPasswordForEmail` with `learnquize://reset` deep link + new
  `app/(auth)/reset-password.tsx`.
- Profile: "Delete account" row (typed confirmation → delete_account RPC →
  sign-out).
- `queryClient.clear()` on sign-out.
- Token storage: Supabase's Expo pattern — AES-encrypted AsyncStorage with key
  in expo-secure-store (already installed; raw SecureStore has 2KB limit).
- Write `profiles.timezone` from `Intl.DateTimeFormat().resolvedOptions()
  .timeZone` after sign-in (column grant already exists) — fixes the live
  IST-5:30am streak bug.

### E. Mobile hardening
- BackHandler on quiz screen → confirmQuit (Android back currently orphans
  sessions).
- `app/_layout.tsx`: hide splash before SetupRequired; surface useFonts error.
- New `src/components/ErrorBoundary.tsx` at root (friendly restart screen).
- Unswallow errors: home quick-start catch{} (inline error), quiz submitAnswer
  (decision 5), signOut.
- `@react-native-community/netinfo` + onlineManager/focusManager bridge +
  offline banner.
- Timer effect fix (startedAt ref; finish in a ref — currently resets clock).
- isError states: history, profile, home profile query; pending spinner on
  hero button.
- StatusBar style per screen (light on profile's teal band).
- a11y: stop using inkFaint for text (fails AA), roles/values on TimerBar +
  SegmentedProgress, tab semantics on Segmented, maxFontSizeMultiplier policy
  in ui.tsx, textTransform instead of String.toUpperCase in Eyebrow.

### F. Release packaging
- `mobile/scripts/generate-assets.mjs` (decision 6) → all 6 asset PNGs.
- `app.json` overhaul: light theme colors (#EAF4F7 / #0A3043 replacing
  #0E1315), `userInterfaceStyle: "light"`,
  `android.softwareKeyboardLayoutMode: "resize"` (fixes keyboard-covers-input),
  `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`.
- New `mobile/eas.json`: development/preview/production profiles; per-profile
  `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` env (prod never inlines the LAN URL);
  remote versionCode + autoIncrement.
- `docs/site/` static pages for GitHub Pages: privacy policy, account-deletion
  instructions, support; linked from profile screen.
- Deps: remove `@expo/vector-icons`; KEEP expo-linking (deep links) and
  reanimated+worklets (babel-preset-expo auto-wires; removal churn > benefit).

### G. Quality gates
- eslint-config-expo + fix findings; jest-expo unit tests for pure logic
  (labels, safeParse, accuracy aggregation, optionState, initials);
  `.github/workflows/ci.yml`: mobile job (typecheck/lint/test/expo-doctor) +
  db job (run.sh, needs Docker runner).

### H. CSV question importer (user-confirmed in scope)
- `scripts/import-questions.mjs`: validates `content/question-template.csv`
  (≥2 options, exactly 1 correct, required fields, licence columns) → inserts
  as `in_review` via staff JWT or db-url; approval stays with staff. Unblocks
  the 120→500/category content gap (content itself is a business task).

## User must do manually
1. Create hosted Supabase project (org/region/db password); provide ref +
   pooler connection string.
2. Dashboard auth config per docs/hosted-setup.md.
3. `eas login` + `eas build:configure` (Expo account, Android keystore).
4. Enable GitHub Pages for docs/site/; confirm public URL for policy links.
5. Play Console: listing, data-safety form, deletion URL, screenshots, AAB.
6. Choose the staff email for promote_staff.sql.
7. Fill the question CSV (content team).

## Verification
- Phase B: `bash supabase/tests/run.sh`; `supabase start` + `node
  supabase/tests/e2e.mjs`.
- Phase C: `supabase db push --dry-run` then push; `bash
  scripts/seed-hosted.sh`; e2e against hosted URL (now self-cleaning).
- Phases D/E: `npm run typecheck`; device pass — sign-up confirm loop, reset
  deep link, delete account, airplane-mode mid-quiz, Android hardware back.
- Phase F: run asset script; `npx expo-doctor`; `eas build -p android
  --profile preview`, install APK.
- Phase G: `npm run lint && npm test`; CI green.
