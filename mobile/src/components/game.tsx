import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, duration, radius, space, trackColor, type } from '../theme';
import type { Category, Difficulty } from '../lib/database.types';
import { levelProgress } from '../lib/levels';
import { Label, Pill, Txt, mono } from './ui';

/* ------------------------------------------------------------------- xp bar */

export function XpBar({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const progress = levelProgress(xp);
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(progress.fraction, { duration: duration.slow });
  }, [progress.fraction, width]);

  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View>
      <View style={styles.xpHeader}>
        <View style={styles.levelChip}>
          <Text style={styles.levelChipText}>{progress.level}</Text>
        </View>
        <View style={styles.flex}>
          <View style={styles.track}>
            <Animated.View style={[styles.trackFill, fill]} />
          </View>
        </View>
      </View>
      {compact ? null : (
        <Txt variant="caption" tone="faint" style={styles.xpCaption}>
          {progress.xpToNext.toLocaleString()} XP to level {progress.level + 1}
        </Txt>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ streak */

export function StreakBadge({ days, atRisk }: { days: number; atRisk?: boolean }) {
  return (
    <View style={styles.streak}>
      <Text style={styles.streakGlyph}>{days > 0 ? '🔥' : '💤'}</Text>
      <View>
        <Text style={styles.streakCount}>{days}</Text>
        <Label color={atRisk ? colors.signal : colors.inkFaint}>
          {days === 1 ? 'day' : 'days'}
        </Label>
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- category */

export function CategoryCard({
  category,
  trackSlug,
  onPress,
}: {
  category: Category;
  trackSlug: string;
  onPress: () => void;
}) {
  const accent = trackColor(trackSlug);
  const count = category.approved_question_count;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}
    >
      <View style={[styles.categoryRail, { backgroundColor: accent }]} />
      <View style={styles.flex}>
        <Text style={styles.categoryName} numberOfLines={1}>
          {category.name}
        </Text>
        {category.description ? (
          <Text style={styles.categoryDesc} numberOfLines={2}>
            {category.description}
          </Text>
        ) : null}
        <View style={styles.categoryMeta}>
          <Text style={[styles.categoryCount, { color: accent }]}>
            {count.toLocaleString()}
          </Text>
          <Text style={styles.categoryCountLabel}>
            {count === 1 ? 'question' : 'questions'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------- code */

export function CodeBlock({ code, language }: { code: string; language?: string | null }) {
  return (
    <View style={styles.code}>
      {language ? (
        <View style={styles.codeLang}>
          <Label>{language}</Label>
        </View>
      ) : null}
      {/* Code must never wrap — a broken line changes what the snippet means. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.codeText}>{code}</Text>
      </ScrollView>
    </View>
  );
}

/* ---------------------------------------------------------------- options */

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'missed';

export function AnswerOption({
  label,
  body,
  state,
  disabled,
  onPress,
}: {
  label: string;
  body: string;
  state: OptionState;
  disabled: boolean;
  onPress: () => void;
}) {
  const palette = {
    idle: { border: colors.line, bg: colors.surface, text: colors.ink, key: colors.inkFaint },
    selected: {
      border: colors.accent,
      bg: colors.accentDim,
      text: colors.ink,
      key: colors.accent,
    },
    correct: {
      border: colors.correct,
      bg: colors.correctDim,
      text: colors.ink,
      key: colors.correct,
    },
    wrong: { border: colors.wrong, bg: colors.wrongDim, text: colors.ink, key: colors.wrong },
    // The right answer, revealed after the user picked something else.
    missed: {
      border: colors.correct,
      bg: 'transparent',
      text: colors.inkSoft,
      key: colors.correct,
    },
  }[state];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: state !== 'idle' }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { borderColor: palette.border, backgroundColor: palette.bg },
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={[styles.optionKey, { borderColor: palette.border }]}>
        <Text style={[styles.optionKeyText, { color: palette.key }]}>{label}</Text>
      </View>
      <Text style={[styles.optionBody, { color: palette.text }]}>{body}</Text>
    </Pressable>
  );
}

/* ---------------------------------------------------------------- difficulty */

export function DifficultyPill({ difficulty }: { difficulty: Difficulty }) {
  const map = {
    easy: { color: colors.correct, bg: colors.correctDim },
    medium: { color: colors.signal, bg: colors.signalDim },
    hard: { color: colors.wrong, bg: colors.wrongDim },
  }[difficulty];

  return (
    <Pill color={map.color} background={map.bg}>
      {difficulty}
    </Pill>
  );
}

/* -------------------------------------------------------------- progress */

export function QuestionProgress({ index, total }: { index: number; total: number }) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.progressPip,
            i < index && styles.progressPipDone,
            i === index && styles.progressPipCurrent,
          ]}
        />
      ))}
    </View>
  );
}

/* -------------------------------------------------------------- countdown */

export function TimerBar({ remaining, total }: { remaining: number; total: number }) {
  const fraction = Math.max(0, Math.min(remaining / Math.max(total, 1), 1));
  // Turns amber under 25% so the user feels the clock before it bites.
  const tint = fraction > 0.25 ? colors.accent : colors.signal;

  return (
    <View style={styles.timerTrack}>
      <View
        style={[styles.timerFill, { width: `${fraction * 100}%`, backgroundColor: tint }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },

  xpHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  levelChip: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelChipText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: colors.accent, borderRadius: radius.pill },
  xpCaption: { marginTop: space.sm, marginLeft: 42 },

  streak: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  streakGlyph: { fontSize: 22 },
  streakCount: { color: colors.ink, fontSize: 18, fontWeight: '800', lineHeight: 21 },

  categoryCard: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    overflow: 'hidden',
  },
  categoryRail: { width: 3, borderRadius: radius.pill },
  categoryName: { color: colors.ink, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  categoryDesc: { color: colors.inkSoft, fontSize: 13, lineHeight: 18, marginTop: 3 },
  categoryMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: space.md },
  categoryCount: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  categoryCountLabel: { color: colors.inkFaint, fontSize: 12 },

  code: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    marginTop: space.md,
  },
  codeLang: { marginBottom: space.sm },
  codeText: { color: colors.accentInk, fontFamily: mono, fontSize: 13, lineHeight: 20 },

  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: space.lg,
  },
  optionKey: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionKeyText: { fontSize: 12, fontWeight: '800' },
  optionBody: { flex: 1, fontSize: 15, lineHeight: 22, paddingTop: 2 },

  progressRow: { flexDirection: 'row', gap: 4 },
  progressPip: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  progressPipDone: { backgroundColor: colors.accent },
  progressPipCurrent: { backgroundColor: colors.accentInk },

  timerTrack: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  timerFill: { height: '100%', borderRadius: radius.pill },
});
