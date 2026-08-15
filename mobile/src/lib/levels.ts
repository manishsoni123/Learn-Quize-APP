/**
 * Mirrors public.level_for_xp / public.xp_for_level in the database.
 *
 * The server stays the authority — this only exists so the XP bar can animate
 * without a round trip. If the two ever disagree, the database wins.
 */

/** Cumulative XP required to reach a level: 25 * n * (n - 1). */
export function xpForLevel(level: number): number {
  const n = Math.max(level, 1);
  return 25 * n * (n - 1);
}

export function levelForXp(xp: number): number {
  const safe = Math.max(xp, 0);
  return Math.max(1, Math.floor((25 + Math.sqrt(625 + 100 * safe)) / 50));
}

export interface LevelProgress {
  level: number;
  /** 0–1 through the current level. */
  fraction: number;
  intoLevel: number;
  levelSpan: number;
  xpToNext: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = Math.max(ceiling - floor, 1);
  const into = Math.max(xp - floor, 0);

  return {
    level,
    fraction: Math.min(into / span, 1),
    intoLevel: into,
    levelSpan: span,
    xpToNext: Math.max(ceiling - xp, 0),
  };
}
