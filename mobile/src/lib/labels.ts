/** Human names for quiz_mode values, including modes from retired features
 *  that may still exist in old history rows. */
export function modeLabel(mode: string): string {
  return (
    {
      practice: 'Practice',
      timed_test: 'Timed test',
      weak_spots: 'Review',
      rapid_fire: 'Rapid fire',
      daily_challenge: 'Daily challenge',
      ladder: 'Arcade',
      survival: 'Arcade',
      ludo: 'Arcade',
    }[mode] ?? mode
  );
}
