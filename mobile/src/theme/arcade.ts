/**
 * Arcade design tokens.
 *
 * The Focus lane is a reading surface: cool teal-black, mint accent, quiet. It
 * is built for someone studying at 11pm and it should never shout.
 *
 * Arcade is its opposite — a late-night cabinet. Warm plum-black ground, hot
 * amber as the primary voice, pink for anything at risk, electric cyan for
 * multipliers. The palettes share no hue on purpose: crossing between lanes
 * should feel like walking into a different room, because the contract with
 * the player really is different. One is untimed and forgiving; the other
 * takes things away from you.
 *
 * Structurally identical to ../theme/index.ts — same key names, same scales —
 * so a component can be moved between lanes by swapping the import.
 *
 * @see mobile/src/theme/index.ts
 */

import type { TextStyle } from 'react-native';

import { radius, shadow, space, type } from './index';

export const arcade = {
  // Grounds — warm plum-black. Reads as "cabinet in a dark room" beside
  // Focus's cool #0E1315.
  bg: '#120B14',
  surface: '#1D1220',
  surfaceAlt: '#251729',
  surfaceLift: '#2A1A2E',

  line: '#33203A',
  lineStrong: '#4A2F53',

  // Type
  ink: '#F5ECEF',
  inkSoft: '#B9A3BD',
  inkFaint: '#8A7490',
  inkInverse: '#120B14',

  // Energy — the primary voice. Scores, XP, anything being won.
  energy: '#FFB33C',
  energyDim: '#3D2A0E',
  energyInk: '#FFD79A',

  // Hot — lives, danger, the timer running out, anything at risk. This is the
  // colour of loss, and it is used nowhere else.
  hot: '#FF4D6D',
  hotDim: '#3D1220',

  // Volt — streak multipliers and speed bonuses. Reserved for things that
  // multiply, so a player learns to read cyan as "this is compounding".
  volt: '#5CE1E6',
  voltDim: '#0E3336',

  win: '#7DE08D',
  winDim: '#123A1C',
} as const;

/** Per-mode accent. Falls back to energy so an unknown slug still renders. */
export const modeColor = (slug: string): string => {
  switch (slug) {
    case 'survival':
      return arcade.hot;
    case 'blitz':
      return arcade.volt;
    case 'ladder':
    default:
      return arcade.energy;
  }
};

/**
 * Numerals are the hero content here. In Focus the question is the interface;
 * in Arcade the score, the clock and the multiplier are, so they get the
 * display treatment and the question text gets out of the way.
 *
 * `fontVariant: ['tabular-nums']` is the load-bearing part — without it a
 * counting score jitters as glyph widths change, which reads as a bug.
 */
// Typed as TextStyle rather than `as const`: these are applied directly to a
// <Text style={...}>, and `as const` would freeze fontVariant into a readonly
// tuple that React Native's mutable FontVariant[] will not accept.
export const arcadeType: Record<'hero' | 'score' | 'meter', TextStyle> = {
  hero: {
    fontSize: 64,
    lineHeight: 66,
    fontWeight: '800',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  score: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  meter: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
};

// Scales are shared. Two spacing systems would be two systems to keep honest,
// and nothing about Arcade needs different rhythm — only different colour and
// weight.
export { radius, shadow, space, type };
