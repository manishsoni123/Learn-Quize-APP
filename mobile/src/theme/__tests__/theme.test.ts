import { colors, trackTint } from '../index';

describe('trackTint', () => {
  it('gives each track its own monogram tint', () => {
    expect(trackTint('developer')).toEqual({ bg: colors.bg, fg: colors.brandDeep });
    expect(trackTint('ai-ml')).toEqual({ bg: colors.cyanWash, fg: colors.cyanDeep });
    expect(trackTint('trading')).toEqual({ bg: colors.warmWash, fg: colors.warmInk });
  });

  it('falls back to the brand tint for unknown tracks', () => {
    expect(trackTint('a-new-track')).toEqual({ bg: colors.bg, fg: colors.brandDeep });
  });
});

describe('palette invariants', () => {
  it('every colour is a hex value', () => {
    for (const value of Object.values(colors)) {
      expect(value).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
