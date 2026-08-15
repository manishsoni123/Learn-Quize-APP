/**
 * How a run ends.
 *
 * Worth more care than its size suggests. People judge an experience by its
 * peak and its ending, not its average, so this screen is disproportionately
 * responsible for whether anyone plays a second time. The number gets the
 * whole screen, it counts up rather than appearing, and beating your own best
 * is called out as loudly as the app can manage without lying about it.
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useStartRun } from '../../src/api/arcade';
import { ArcadeButton, ArcadeScreen, BigNumber, Stat } from '../../src/components/arcade';
import type { FinishSessionResult } from '../../src/lib/database.types';
import { arcade, modeColor, radius, space } from '../../src/theme/arcade';

/** What the hero number means, per mode. */
const HEADLINE: Record<string, { label: string; verb: string }> = {
  ladder:   { label: 'BANKED',   verb: 'XP' },
  survival: { label: 'SURVIVED', verb: 'questions' },
  blitz:    { label: 'SCORED',   verb: 'in 60 seconds' },
};

export default function ArcadeResults() {
  const { mode, payload } = useLocalSearchParams<{ mode: string; payload: string }>();
  const router = useRouter();
  const startRun = useStartRun();

  const result = useMemo<FinishSessionResult | null>(() => {
    try {
      return JSON.parse(payload) as FinishSessionResult;
    } catch {
      return null;
    }
  }, [payload]);

  const accent = modeColor(mode ?? '');
  const copy = HEADLINE[mode ?? ''] ?? { label: 'SCORED', verb: 'points' };

  const value = result?.run?.value ?? result?.correct_count ?? 0;
  const isRecord = result?.run?.is_record ?? false;
  const best = result?.run?.best ?? value;
  const accuracy =
    result && result.answered_count > 0
      ? Math.round((result.correct_count / result.answered_count) * 100)
      : 0;

  async function again() {
    if (!mode) return;
    try {
      const sessionId = await startRun.mutateAsync({ modeSlug: mode });
      router.replace({ pathname: '/arcade/[mode]', params: { mode, sessionId } });
    } catch {
      router.replace('/arcade');
    }
  }

  return (
    <ArcadeScreen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {isRecord ? (
            <View style={[styles.recordChip, { borderColor: accent }]}>
              <Ionicons name="trophy" size={13} color={accent} />
              <Text style={[styles.recordText, { color: accent }]}>PERSONAL BEST</Text>
            </View>
          ) : (
            <Text style={styles.heroLabel}>{copy.label}</Text>
          )}

          <BigNumber value={value} size="hero" color={accent} />
          <Text style={styles.heroUnit}>{copy.verb}</Text>

          {!isRecord && best > value ? (
            <Text style={styles.chase}>
              {(best - value).toLocaleString()} off your best this week
            </Text>
          ) : null}
        </View>

        <View style={styles.stats}>
          <Stat label="CORRECT" value={`${result?.correct_count ?? 0}`} />
          <Stat label="ACCURACY" value={`${accuracy}%`} />
          <Stat
            label="XP"
            value={`+${(result?.xp_earned ?? 0).toLocaleString()}`}
            color={arcade.energy}
          />
          <Stat
            label="STREAK"
            value={`${result?.new_streak ?? 0}`}
            color={arcade.volt}
          />
        </View>

        {result?.unlocked?.length ? (
          <View style={styles.badges}>
            <Text style={styles.badgesLabel}>UNLOCKED</Text>
            {result.unlocked.map((slug) => (
              <View key={slug} style={styles.badge}>
                <Ionicons name="ribbon" size={16} color={arcade.energy} />
                <Text style={styles.badgeText}>{slug.replace(/[-_]/g, ' ')}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <ArcadeButton
          label="GO AGAIN"
          onPress={() => void again()}
          disabled={startRun.isPending}
        />
        <ArcadeButton label="BACK TO ARCADE" tone="ghost" onPress={() => router.replace('/arcade')} />
      </View>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, paddingBottom: space.xxl, flexGrow: 1, justifyContent: 'center' },

  hero: { alignItems: 'center', gap: space.xs },
  heroLabel: {
    color: arcade.inkFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  heroUnit: { color: arcade.inkSoft, fontSize: 15, fontWeight: '600' },
  chase: { color: arcade.inkFaint, fontSize: 13, marginTop: space.sm },

  recordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  recordText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },

  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: space.xxxl,
    paddingVertical: space.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: arcade.line,
  },

  badges: { marginTop: space.xl, gap: space.sm },
  badgesLabel: {
    color: arcade.inkFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badgeText: {
    color: arcade.ink,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },

  actions: {
    padding: space.lg,
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: arcade.line,
  },
});
