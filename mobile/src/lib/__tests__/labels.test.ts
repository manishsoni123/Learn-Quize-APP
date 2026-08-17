import { modeLabel } from '../labels';

describe('modeLabel', () => {
  it('names the live modes', () => {
    expect(modeLabel('practice')).toBe('Practice');
    expect(modeLabel('timed_test')).toBe('Timed test');
    expect(modeLabel('weak_spots')).toBe('Review');
  });

  it('still names modes from retired features found in old history rows', () => {
    expect(modeLabel('ladder')).toBe('Arcade');
    expect(modeLabel('survival')).toBe('Arcade');
    expect(modeLabel('ludo')).toBe('Arcade');
    expect(modeLabel('rapid_fire')).toBe('Rapid fire');
    expect(modeLabel('daily_challenge')).toBe('Daily challenge');
  });

  it('falls back to the raw value rather than crashing on unknowns', () => {
    expect(modeLabel('future_mode')).toBe('future_mode');
  });
});
