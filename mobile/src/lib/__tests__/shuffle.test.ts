import { seededShuffle } from '../shuffle';

describe('seededShuffle', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('returns the same permutation for the same seed', () => {
    expect(seededShuffle(items, 'session-1:q-1')).toEqual(
      seededShuffle(items, 'session-1:q-1'),
    );
  });

  it('keeps every element exactly once', () => {
    const out = seededShuffle(items, 'any-seed');
    expect([...out].sort()).toEqual([...items].sort());
  });

  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c', 'd'];
    seededShuffle(input, 'seed');
    expect(input).toEqual(['a', 'b', 'c', 'd']);
  });

  it('produces different orders across seeds', () => {
    // 24 permutations of 4 items; 50 distinct seeds landing on one
    // permutation would mean the seed is being ignored.
    const orders = new Set(
      Array.from({ length: 50 }, (_, i) =>
        seededShuffle(items, `session-${i}:q`).join(''),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('moves the first element away from position 0 across sessions', () => {
    // The actual bug: correct answer authored first, stuck at slot 1.
    const stuck = Array.from({ length: 50 }, (_, i) =>
      seededShuffle(items, `session-${i}:q`),
    ).every((out) => out[0] === 'a');
    expect(stuck).toBe(false);
  });

  it('handles empty and single-element arrays', () => {
    expect(seededShuffle([], 'seed')).toEqual([]);
    expect(seededShuffle(['only'], 'seed')).toEqual(['only']);
  });
});
