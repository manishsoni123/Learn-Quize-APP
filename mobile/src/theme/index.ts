/**
 * Learn-Quize design tokens.
 *
 * The app commits to a single dark palette rather than shipping a half-finished
 * light mode. It suits the audience, it makes the XP and streak colours carry,
 * and one well-executed theme beats two mediocre ones.
 *
 * Everything visual comes from here. If a colour or a spacing value appears as
 * a literal in a component, that is a bug.
 */

export const colors = {
  // Grounds — cool charcoals with a faint green bias so they sit with the accent
  bg: '#0E1315',
  surface: '#151C1E',
  surfaceAlt: '#1C2528',
  surfaceLift: '#232E31',

  line: '#26312F',
  lineStrong: '#37443F',

  // Type
  ink: '#E4EAE8',
  inkSoft: '#9DAAA9',
  inkFaint: '#75817F',
  inkInverse: '#0E1315',

  // Accent — pine/mint. Growth, progress, the up-tick.
  accent: '#4FC49E',
  accentDim: '#16332A',
  accentInk: '#A6E6CE',

  // Semantic. Deliberately separate from the accent so "correct" never reads
  // as "this is the brand colour".
  correct: '#4FC49E',
  correctDim: '#16332A',
  wrong: '#E8705E',
  wrongDim: '#3A1E1A',
  signal: '#E39A54',
  signalDim: '#33251A',

  // Track identity
  trackDeveloper: '#4FC49E',
  trackAi: '#7B8CE8',
  trackTrading: '#E39A54',

  // League tiers
  bronze: '#B87A4C',
  silver: '#AEB8BC',
  gold: '#E0B44A',
  platinum: '#7FD4D0',
  diamond: '#8FA8F0',
} as const;

export const trackColor = (slug: string): string => {
  switch (slug) {
    case 'developer':
      return colors.trackDeveloper;
    case 'ai-ml':
      return colors.trackAi;
    case 'trading':
      return colors.trackTrading;
    default:
      return colors.accent;
  }
};

export const tierColor = (tier: string): string => {
  switch (tier) {
    case 'silver':
      return colors.silver;
    case 'gold':
      return colors.gold;
    case 'platinum':
      return colors.platinum;
    case 'diamond':
      return colors.diamond;
    default:
      return colors.bronze;
  }
};

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

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 34, lineHeight: 38, fontWeight: '800' },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  /** Uppercase labels. Pair with letterSpacing. */
  label: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1.1 },
  mono: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
} as const;

/** Monospace stack that actually resolves on both platforms. */
export const monoFamily = {
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

/** Motion. Kept short — a quiz should feel quick, not animated at. */
export const duration = {
  fast: 140,
  base: 220,
  slow: 380,
} as const;
