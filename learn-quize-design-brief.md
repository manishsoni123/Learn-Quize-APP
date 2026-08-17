# Learn-Quize — Mobile App Design & Build Brief

> **How to use this prompt:** paste the whole document into a Claude session.
> Best results: open the `Learn-Quize` repo in Claude Code so it can reuse the
> existing backend and data layer. It also works standalone — everything Claude
> needs to know about the product is in here.

---

## Your role

You are the design lead and senior React Native engineer for Learn-Quize. You
have full authority over the visual identity, and full responsibility for
shipping it as working code. You are not decorating an existing app — you are
giving this product the identity it has never had.

Work in two phases, and **stop for approval between them**:

1. **Design direction.** Present 2–3 distinct visual directions. For each:
   name it, describe the palette (5–6 named hex values), the type pairing, the
   shape language, one signature visual element that appears nowhere else on
   the app store, and a text sketch of the quiz screen in that direction. Say
   which one you recommend and why. Wait for a choice.
2. **Build.** Implement the chosen direction across every screen and state
   listed below, then verify (typecheck + bundle) and hand over.

## Why you are being hired

Two UIs have already been rejected:

- **Attempt 1:** dark charcoal + mint green, emoji glyphs (🎯🧠🔥), "gamer"
  energy. Rejected as looking AI-generated.
- **Attempt 2:** light grey background, white rounded cards with soft shadows,
  indigo `#3E63DD` accent, Ionicons everywhere. Cleaner — and still rejected,
  because it looks like every AI-generated "professional" app: the same card,
  the same shadow, the same indigo, repeated down every screen.

The client's words: *"looks like a Claude generated UI, that is not good for
application."* Your job is a UI that looks **designed by a person for this
product** — one that could sit in an App Store screenshot next to Duolingo,
Notion, or Headspace without embarrassment. Distinctive, calm, trustworthy.

**Banned by prior rejection (do not reuse):** emoji as icons; indigo/violet as
the accent; a page of identical white rounded-corner cards each with border +
shadow; centered everything; grey-on-white with no point of view.

## The product

Learn-Quize is an interview-preparation quiz app for developers, AI/ML
engineers, and traders. The pitch in one line: **short quizzes that make you
interview-ready, a little every day.**

The core loop: pick a topic → answer a 10–15 question quiz → see your score →
your mistakes come back later for review. That loop is the whole app.

### Non-negotiable product rules

1. **Every quiz is 10–15 questions.** Never more. Sessions must feel finishable
   in a coffee break.
2. **Every quiz ends with a score.** The score (percentage + correct count) is
   the headline result, presented with weight and clarity.
3. **History is a first-class feature.** Every finished session is browsable,
   with average and best scores summarized.
4. **This is a quiz app, not a game.** No arcade modes, leagues, badges,
   levels, or XP displays. The one motivational element allowed is a small
   daily-streak indicator — quiet, never dominant.
5. **Professional, easy to understand, easy to access.** A first-time user
   must understand every screen without a tutorial.

## Feature inventory (all must exist)

| # | Feature | Detail |
|---|---------|--------|
| 1 | Email sign-in / sign-up | Name (sign-up only), email, password. Inline validation, clear error messages. |
| 2 | Home | Greeting, small streak chip, "Quick quiz" primary action (10 mixed questions), "Review your mistakes" (only when reviews are due), topics grouped by track. |
| 3 | Topic detail | Topic name, description, question count. Two ways to start: **Practice** (10 questions, untimed, explanation after each answer) and **Timed test** (15 questions, 15 minutes, countdown visible). |
| 4 | Quiz player | Progress indicator, question text, optional code snippet (monospace, horizontal scroll, never wrapped), 2–6 answer options labelled A–F. On answer: instant correct/incorrect state on the options, the right answer revealed, explanation shown, haptic feedback, then "Next question". Quit requires confirmation. A flag control reports a bad question. |
| 5 | Results | Score as the hero (percentage + N of M correct), correct/incorrect breakdown, day streak, a one-line message tied to the score band, note that misses return for review. One clear action back home. |
| 6 | History tab | Summary (total quizzes, average score, best score) + every past session: topic, mode, score, relative date. Score visually encoded (≥80% good / 50–79% mid / <50% needs work). Empty state with a call to action. |
| 7 | Profile tab | Name + avatar (initial is fine), practice stats (quizzes, questions answered, current streak, best streak), sign out. |
| 8 | System states | Every screen designs its loading, error (with retry), empty, and offline states. No spinner-only screens; no dead ends. |

## Existing foundation (reuse, do not rebuild)

If working in the repo: Expo SDK 54 (pinned — do not upgrade), expo-router v6
file-based routing, TypeScript, Supabase backend. The data layer in
`mobile/src/api/` already works and the redesign must keep its contracts:

- `useCatalog()` → tracks with categories
- `useCategory(slug)` → one category + its track
- `useStartSession({ mode, categoryId, questionCount })` → session id
  (modes used: `practice`, `timed_test`, `weak_spots`; count is clamped
  10–15 via `MIN_QUESTIONS` / `MAX_QUESTIONS` in `src/api/player.ts`)
- `useSession(id)` → all questions with options up front
- `useSubmitAnswer()` / `useFinishSession()` → server-authoritative scoring
- `useProfile(userId)`, `useHistory(userId, limit)`, `useDueCount(userId)`
- `useReportQuestion()` → flag a bad question

Key shapes the UI renders:

```ts
Category   { slug, name, description, approved_question_count }
Question   { body, code_snippet?, code_language?, difficulty: 'easy'|'medium'|'hard',
             explanation, options: { id, body, is_correct }[] }
HistoryEntry { categoryName, mode, correct, total, finishedAt }
FinishSessionResult { correct_count, answered_count, new_streak }
Profile    { display_name, username, current_streak, longest_streak }
```

Installed and available: `react-native-reanimated` 4, `react-native-svg`,
`expo-haptics`, `@expo/vector-icons`, `react-native-gesture-handler`,
`react-native-safe-area-context`. New dependencies only via
`npx expo install`, and only with a stated reason. Custom fonts via
`expo-font` + an `@expo-google-fonts/*` package are explicitly allowed and
encouraged — type is the cheapest way for this app to stop looking generated.

## Design mandate

**Identity.** Ground every choice in what this product is: preparation,
progress, quiet confidence before an interview. Not a classroom, not an
arcade. Choose a palette with a point of view — a considered ground (not
default white, not default grey), one accent that isn't indigo/violet, and
semantic green/red reserved exclusively for correct/incorrect so answer
feedback is never confusable with branding. Neutrals should carry a slight
hue bias toward the accent, not sit at pure grey.

**Typography does the heavy lifting.** Pick a real pairing: a characterful
face for numbers and headlines (scores, question counters, streak — this app
is full of numbers; make them beautiful, `tabular-nums` where they align) and
a highly legible face for questions and answers. Question text is the most
read text in the app — size and space it generously. Code snippets get a
proper mono face on a dark ground regardless of theme.

**Composition over cards.** Vary the rhythm: not every group needs a border,
a shadow, and a radius. Use scale, weight, whitespace, and alignment to
structure screens; reserve containers for things that are actually tappable
units. Left-align by default; center only moments of ceremony (the results
score).

**One signature element.** Design one visual device unique to this app and
use it consistently — for example, a distinctive way of drawing progress
through a quiz, a signature score mark on results and history rows, or a
characteristic option-row treatment. This is what makes screenshots
recognizably Learn-Quize.

**Motion is feedback, not decoration.** Answer reveal, score count-up on
results, progress advancing — short (150–350ms), purposeful, with
`expo-haptics` on answer and completion. Respect reduced-motion settings.
Nothing ambient, nothing looping.

**Accessibility is table stakes.** WCAG AA contrast everywhere, ≥44pt touch
targets, `accessibilityRole`/`accessibilityLabel` on every control, correct
state never encoded by color alone (pair icon or label), dynamic-type
friendly layouts.

**Tokens or it didn't happen.** Every color, size, radius, duration lives in
`src/theme/index.ts`. A literal hex in a component is a bug. Commit to one
polished theme (light or dark) rather than shipping two mediocre ones — but
pick it deliberately and design the status bar, keyboard, and system chrome
to match.

## Definition of done

- [ ] Every feature in the inventory exists and works against the real API
- [ ] Every screen has designed loading / error / empty states
- [ ] No emoji as UI; one icon family used consistently
- [ ] All visual values come from the token file
- [ ] The signature element appears on home, quiz, results, and history
- [ ] `npm run typecheck` passes; `npx expo export --platform android` bundles
- [ ] Screens hold up at small (iPhone SE) and large (Pixel 9 Pro XL) sizes
- [ ] A stranger could name what makes this app's look distinctive in one sentence

Deliver phase 1 (the 2–3 directions) first. Do not write implementation code
until a direction is chosen.
