/**
 * Learn-Quize design tokens — the Dynatech design system, as implemented in
 * the approved Claude Design canvas ("Learn-Quize App.dc.html", turn 2).
 *
 * The signature is a deep teal-leaning blue — "consulting firm at 6pm" — with
 * an editorial serif (Newsreader) for greetings and numbers, Inter Tight for
 * UI text, and JetBrains Mono for code and monograms. Warm tan is reserved
 * for the streak; green/red are reserved for answer feedback.
 *
 * Everything visual comes from here. If a colour or a spacing value appears
 * as a literal in a component, that is a bug.
 */

export const colors = {
  // Grounds
  bg: '#EAF4F7', // brand-50 — the pale teal canvas behind every screen
  surface: '#FFFFFF',
  sheet: '#FBFCFD', // paper — the login sheet
  subtle: '#F4F7F9',
  muted: '#E8EEF2', // segmented-control track, hairline dividers
  line: '#CFE5EC', // brand-100 — card borders
  lineNeutral: '#D3DCE4', // ink-200 — input borders, empty progress

  // Ink
  ink: '#081826',
  inkMid: '#355770',
  inkSoft: '#547089',
  inkFaint: '#7D93A8',
  inkDisabled: '#A9B9C8',
  inkInverse: '#FFFFFF',

  // Brand — teal-blue
  brand: '#1F6F88', // primary buttons
  brandDeep: '#155670', // eyebrows, links, monogram ink
  brandDark: '#0E4259',
  brandInk: '#0A3043', // darkest: tab bar, code blocks, gradient ends

  // Accent — bright cyan, for "live" moments on dark grounds
  cyan: '#5FCFDE',
  cyanSoft: '#C2ECF3', // code text on dark
  cyanDeep: '#0C7589',
  cyanWash: '#E6F7FB',

  // Warm — the streak's colour, used nowhere else
  warmWash: '#F4ECE1',
  warmLine: '#D9C3A2',
  warm: '#B8946A',
  warmInk: '#7A5E40',

  // Semantic — answer feedback only, never branding
  correct: '#2E9B5B',
  correctWash: '#E8F5EE',
  correctInk: '#1E6B3E',
  wrong: '#C94A3F',
  wrongWash: '#FBECEB',
  wrongInk: '#8A2F25',
  warn: '#D28A2A',
  warnWash: '#FDF3E3',

  // Text on dark teal grounds
  onDark: '#FFFFFF',
  onDarkSoft: '#9FCAD8', // brand-200
} as const;

/** The deep-teal gradient used by the login header, hero card and results. */
export const tealGradient = ['#0A3043', '#0E4259', '#155670'] as const;

/** Monogram tints per track — background wash + ink. */
export const trackTint = (slug: string): { bg: string; fg: string } => {
  switch (slug) {
    case 'ai-ml':
      return { bg: colors.cyanWash, fg: colors.cyanDeep };
    case 'trading':
      return { bg: colors.warmWash, fg: colors.warmInk };
    default:
      return { bg: colors.bg, fg: colors.brandDeep };
  }
};

/**
 * Font families. Weight lives in the family name — do not also set
 * fontWeight, Android resolves the family file only.
 */
export const fonts = {
  serif: 'Newsreader_500Medium',
  serifItalic: 'Newsreader_400Regular_Italic',
  sans: 'InterTight_400Regular',
  sansMedium: 'InterTight_500Medium',
  sansSemiBold: 'InterTight_600SemiBold',
  sansBold: 'InterTight_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

/** 4pt base. Stay on the scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Gently rounded, never pill unless explicit. */
export const radius = {
  xs: 4,
  sm: 8,
  md: 10, // inputs, small cards
  lg: 14, // surface cards
  xl: 20, // hero containers
  xxl: 28,
  pill: 999,
} as const;

export const type = {
  /** Login headline. Newsreader. */
  hero: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 40 },
  /** Screen titles and greetings. Newsreader. */
  title: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 33 },
  /** Hero-card copy. Newsreader. */
  serifCard: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 28 },
  /** Quiz question text. */
  question: { fontFamily: fonts.sansMedium, fontSize: 20, lineHeight: 28 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.sansSemiBold, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 17 },
  /** Uppercase kicker labels. */
  eyebrow: { fontFamily: fonts.sansSemiBold, fontSize: 11, lineHeight: 13, letterSpacing: 1.3 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 },
} as const;

/** Soft, low, blue-shifted shadows. */
export const shadow = {
  card: {
    shadowColor: '#081826',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  float: {
    shadowColor: '#081826',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const;

/** Motion. Kept short — a quiz should feel quick, not animated at. */
export const duration = {
  fast: 120,
  base: 200,
  slow: 400,
} as const;
