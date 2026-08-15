import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useAchievements } from '../../src/api/me';
import { Button, Card, Label, Spacer, Txt } from '../../src/components/ui';
import { useAuth } from '../../src/lib/auth';
import type { FinishSessionResult } from '../../src/lib/database.types';
import { colors, radius, space } from '../../src/theme';

export default function ResultsScreen() {
  const { payload } = useLocalSearchParams<{ payload: string }>();
  const router = useRouter();
  const { userId } = useAuth();
  const achievements = useAchievements(userId);

  const result = safeParse(payload);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  if (!result) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.centre}>
          <Txt variant="heading">Session finished</Txt>
          <Spacer h={space.lg} />
          <Button label="Back to learning" onPress={() => router.replace('/(tabs)')} />
        </View>
      </SafeAreaView>
    );
  }

  const answered = result.answered_count;
  const accuracy = answered > 0 ? Math.round((result.correct_count / answered) * 100) : 0;

  const unlockedBadges = (achievements.data ?? []).filter((a) =>
    result.unlocked.includes(a.slug),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Spacer h={space.xl} />
        <Txt variant="display" style={styles.centreText}>
          {headline(accuracy)}
        </Txt>
        <Spacer h={space.sm} />
        <Txt variant="body" tone="soft" style={styles.centreText}>
          {result.correct_count} of {answered} correct
        </Txt>

        <Spacer h={space.xxl} />
        <Card>
          <View style={styles.statRow}>
            <Stat value={`+${result.xp_earned}`} label="XP earned" tone="accent" />
            <Stat value={`${accuracy}%`} label="accuracy" />
            <Stat value={String(result.new_streak)} label="day streak" />
          </View>
        </Card>

        {/* Level-ups and badges are the moment worth celebrating. */}
        {unlockedBadges.length > 0 ? (
          <>
            <Spacer h={space.xl} />
            <Label color={colors.signal}>New badges</Label>
            <Spacer h={space.md} />
            <View style={styles.badgeList}>
              {unlockedBadges.map((b) => (
                <View key={b.id} style={styles.badge}>
                  <Txt variant="title">{b.icon ?? '🏅'}</Txt>
                  <View style={styles.flex}>
                    <Txt variant="bodyStrong">{b.name}</Txt>
                    <Spacer h={space.xs} />
                    <Txt variant="caption" tone="faint">
                      {b.description}
                    </Txt>
                  </View>
                  {b.xp_reward > 0 ? (
                    <Txt variant="caption" tone="accent">
                      +{b.xp_reward}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Spacer h={space.xxl} />
        <Txt variant="small" tone="faint" style={styles.centreText}>
          {reviewNote(accuracy)}
        </Txt>

        <Spacer h={space.xl} />
        <Button label="Back to learning" onPress={() => router.replace('/(tabs)')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  value,
  label,
  tone = 'default',
}: {
  value: string;
  label: string;
  tone?: 'default' | 'accent';
}) {
  return (
    <View style={styles.stat}>
      <Txt variant="title" tone={tone}>
        {value}
      </Txt>
      <Spacer h={space.xs} />
      <Label>{label}</Label>
    </View>
  );
}

function headline(accuracy: number): string {
  if (accuracy === 100) return 'Perfect run.';
  if (accuracy >= 80) return 'Strong session.';
  if (accuracy >= 50) return 'Solid work.';
  return 'Worth another pass.';
}

function reviewNote(accuracy: number): string {
  return accuracy >= 80
    ? 'The ones you missed will come back in a few days, when reviewing them actually helps.'
    : 'These are queued for review — you will see them again tomorrow, then on a widening schedule.';
}

function safeParse(payload: string | undefined): FinishSessionResult | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as FinishSessionResult;
    return { ...parsed, unlocked: parsed.unlocked ?? [] };
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xxxl },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  centreText: { textAlign: 'center' },

  statRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center' },

  badgeList: { gap: space.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.signal,
    padding: space.lg,
  },
});
