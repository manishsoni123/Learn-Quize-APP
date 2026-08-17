/**
 * Deterministic option shuffling.
 *
 * Question authors habitually write the correct answer first, and a plain
 * random() re-orders on every render and refetch — mid-quiz, the options
 * would jump. Seeding the permutation with the session and question ids
 * gives each session its own order that never moves within that session.
 */

/** FNV-1a 32-bit — tiny, stable, good enough to seed a display shuffle. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small deterministic PRNG over a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates with a string seed. Returns a new array; the same seed always
 * produces the same permutation of the same-length input.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = [...items];
  const rand = mulberry32(fnv1a(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
