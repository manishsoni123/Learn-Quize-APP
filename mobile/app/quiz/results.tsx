import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Fraction } from '../../src/components/game';
import { Icon } from '../../src/components/icons';
import { Button, Eyebrow, Spacer, Txt } from '../../src/components/ui';
import type { FinishSessionResult } from '../../src/lib/database.types';
import { modeLabel } from '../../src/lib/labels';
import { colors, fonts, radius, space, tealGradient } from '../../src/theme';

export default function ResultsScreen() {
  const { payload, category, mode } = useLocalSearchParams<{
    payload: string;
    category?: string;
    mode?: string;
  }>();
  const router = useRouter();

  const result = safeParse(payload);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const context = [category || 'Mixed', mode ? modeLabel(mode) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[...tealGradient]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {!result ? (
          <View style={styles.centre}>
            <Txt variant="serifCard" tone="onDark">
              Quiz finished
            </Txt>
            <Spacer h={space.lg} />
            <Button
              label="Back to home"
              variant="light"
              onPress={() => router.replace('/(tabs)')}
            />
          </View>
        ) : (
          <ResultBody result={result} context={context} />
        )}
      </SafeAreaView>
    </View>
  );
}

function ResultBody({
  result,
  context,
}: {
  result: FinishSessionResult;
  context: string;
}) {
  const router = useRouter();
  const answered = result.answered_count;
  const missed = answered - result.correct_count;
  const accuracy = answered > 0 ? Math.round((result.correct_count / answered) * 100) : 0;

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Spacer h={space.xl} />
      <View style={styles.centreItems}>
        <Eyebrow color={colors.cyan}>{context}</Eyebrow>
        <Spacer h={space.xl} />
        <Fraction
          top={String(result.correct_count)}
          bottom={String(answered)}
          size="hero"
          onDark
        />
        <Spacer h={space.lg} />
        <Text style={styles.percent}>{accuracy}%</Text>
        <Spacer h={space.sm} />
        <Text style={styles.message}>{message(accuracy, missed)}</Text>
      </View>

      {/* ------------------------------------------------------------ stats */}
      <Spacer h={space.xl + 2} />
      <View style={styles.tileRow}>
        <View style={styles.tile}>
          <View style={styles.tileValueRow}>
            <Icon name="check" size={15} color={colors.correct} strokeWidth={2.2} />
            <Text style={styles.tileValue}>{result.correct_count}</Text>
          </View>
          <Text style={styles.tileLabel}>correct</Text>
        </View>
        <View style={styles.tile}>
          <View style={styles.tileValueRow}>
            <Icon name="close" size={13} color={colors.wrong} strokeWidth={2.2} />
            <Text style={styles.tileValue}>{missed}</Text>
          </View>
          <Text style={styles.tileLabel}>missed</Text>
        </View>
        <View style={[styles.tile, styles.tileWarm]}>
          <View style={styles.tileValueRow}>
            <Icon name="streak" size={14} color={colors.warmLine} strokeWidth={2} />
            <Text style={styles.tileValue}>{result.new_streak}</Text>
          </View>
          <Text style={[styles.tileLabel, { color: colors.warmLine }]}>day streak</Text>
        </View>
      </View>

      {missed > 0 ? (
        <>
          <Spacer h={space.md} />
          <View style={styles.note}>
            <Icon name="refresh" size={16} color={colors.cyan} />
            <Text style={styles.noteText}>
              Your {missed} {missed === 1 ? 'miss is' : 'misses are'} scheduled to come
              back for review.
            </Text>
          </View>
        </>
      ) : null}

      <Spacer h={space.xl} />
      <Button label="Back to home" variant="light" onPress={() => router.replace('/(tabs)')} />
    </ScrollView>
  );
}

function message(accuracy: number, missed: number): string {
  if (accuracy === 100) return 'Perfect. Every single one.';
  if (accuracy >= 80)
    return `Solid. The ${missed === 1 ? 'one' : missed} you missed will come back for review.`;
  if (accuracy >= 50) return 'Good effort — review will close the gaps.';
  return 'Tough set. Every miss is queued for review.';
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
  root: { flex: 1, backgroundColor: colors.brandInk },
  flex: { flex: 1 },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl, flexGrow: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  centreItems: { alignItems: 'center' },

  percent: {
    fontFamily: fonts.serif,
    fontSize: 26,
    color: colors.onDark,
    fontVariant: ['tabular-nums'],
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.onDarkSoft,
    textAlign: 'center',
    maxWidth: 260,
  },

  tileRow: { flexDirection: 'row', gap: space.md - 2 },
  tile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    padding: 14,
    alignItems: 'center',
  },
  tileWarm: {
    backgroundColor: 'rgba(184,148,106,0.15)',
    borderColor: 'rgba(217,195,162,0.35)',
  },
  tileValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileValue: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 20,
    color: colors.onDark,
    fontVariant: ['tabular-nums'],
  },
  tileLabel: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.onDarkSoft, marginTop: 3 },

  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md + 2,
    paddingVertical: space.md,
    paddingHorizontal: 14,
  },
  noteText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.cyanSoft,
  },
});
