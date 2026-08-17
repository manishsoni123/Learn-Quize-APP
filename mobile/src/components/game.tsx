import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, space, trackTint } from '../theme';
import type { Category } from '../lib/database.types';
import { Icon } from './icons';

/* ------------------------------------------------------------------ streak */

/** The warm tan streak chip. The only warm-coloured element in the app. */
export function StreakChip({ days }: { days: number }) {
  return (
    <View style={styles.streak} accessibilityLabel={`${days} day streak`}>
      <Icon name="streak" size={13} color={colors.warm} strokeWidth={2} />
      <Text style={styles.streakCount}>{days}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- fraction */

/**
 * The signature score mark: numerator over a rule over denominator, set in
 * Newsreader. Appears in the quiz header (7/10), on category rows (86/%),
 * and gigantic on the results screen (12/15).
 */
export function Fraction({
  top,
  bottom,
  size = 'md',
  onDark = false,
}: {
  top: string;
  bottom: string;
  size?: 'sm' | 'md' | 'hero';
  onDark?: boolean;
}) {
  const spec = {
    sm: { top: 15, bottom: 11, rule: 20, ruleH: 1, gap: 2 },
    md: { top: 26, bottom: 15, rule: 32, ruleH: 1.5, gap: 3 },
    hero: { top: 88, bottom: 34, rule: 110, ruleH: 2, gap: 10 },
  }[size];

  const topColor = onDark ? colors.onDark : colors.brandInk;
  const bottomColor = onDark ? colors.onDarkSoft : size === 'sm' ? colors.inkFaint : colors.inkSoft;
  const ruleColor = onDark ? colors.cyan : size === 'sm' ? colors.inkDisabled : colors.brandInk;

  return (
    <View style={styles.fraction} accessibilityLabel={`${top} of ${bottom}`}>
      <Text
        style={{
          fontFamily: fonts.serif,
          fontSize: spec.top,
          lineHeight: Math.round(spec.top * 1.05),
          color: topColor,
          fontVariant: ['tabular-nums'],
        }}
      >
        {top}
      </Text>
      <View
        style={{
          width: spec.rule,
          height: spec.ruleH,
          backgroundColor: ruleColor,
          marginVertical: spec.gap,
        }}
      />
      <Text
        style={{
          fontFamily: fonts.serif,
          fontSize: spec.bottom,
          lineHeight: Math.round(spec.bottom * 1.15),
          color: bottomColor,
          fontVariant: ['tabular-nums'],
        }}
      >
        {bottom}
      </Text>
    </View>
  );
}

/* ---------------------------------------------------- per-question progress */

export type SegmentResult = 'correct' | 'wrong' | 'current' | 'todo';

/**
 * One segment per question, coloured by how it went. The quiz's memory of
 * itself — green for right, red for wrong, deep teal for now.
 */
export function SegmentedProgress({ segments }: { segments: SegmentResult[] }) {
  const tint: Record<SegmentResult, string> = {
    correct: colors.correct,
    wrong: colors.wrong,
    current: colors.brandDark,
    todo: colors.lineNeutral,
  };

  const answered = segments.filter((s) => s === 'correct' || s === 'wrong').length;
  const right = segments.filter((s) => s === 'correct').length;

  return (
    <View
      style={styles.segments}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${answered} of ${segments.length} answered, ${right} correct`}
      accessibilityValue={{ min: 0, max: segments.length, now: answered }}
    >
      {segments.map((segment, i) => (
        <View key={i} style={[styles.segment, { backgroundColor: tint[segment] }]} />
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- monogram */

export function Monogram({ name, trackSlug }: { name: string; trackSlug: string }) {
  const tint = trackTint(trackSlug);
  const letters = name
    .split(/[\s/-]+/)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.monogram, { backgroundColor: tint.bg }]}>
      <Text style={[styles.monogramText, { color: tint.fg }]}>{letters}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- category */

export function CategoryRow({
  category,
  trackSlug,
  accuracy,
  onPress,
}: {
  category: Category;
  trackSlug: string;
  /** Rounded percentage from past sessions; null shows a chevron instead. */
  accuracy: number | null;
  onPress: () => void;
}) {
  const count = category.approved_question_count;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, ${count} questions${
        accuracy !== null ? `, ${accuracy} percent average` : ''
      }`}
      onPress={onPress}
      style={({ pressed }) => [styles.categoryRow, pressed && styles.pressed]}
    >
      <Monogram name={category.name} trackSlug={trackSlug} />
      <View style={styles.flex}>
        <Text style={styles.categoryName} numberOfLines={1}>
          {category.name}
        </Text>
        <Text style={styles.categorySub} numberOfLines={1}>
          {count.toLocaleString()} {count === 1 ? 'question' : 'questions'}
        </Text>
      </View>
      {accuracy !== null ? (
        <Fraction top={String(accuracy)} bottom="%" size="sm" />
      ) : (
        <Icon name="chevronRight" size={16} color={colors.inkFaint} strokeWidth={2} />
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------- code */

export function CodeBlock({ code }: { code: string }) {
  return (
    <View style={styles.code}>
      {/* Code must never wrap — a broken line changes what the snippet means. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.codeText}>{code}</Text>
      </ScrollView>
    </View>
  );
}

/* ---------------------------------------------------------------- options */

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'missed' | 'dimmed';

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
  const showCheck = state === 'correct' || state === 'missed';
  const showCross = state === 'wrong';

  const container = [
    styles.option,
    state === 'selected' && styles.optionSelected,
    (state === 'correct' || state === 'missed') && styles.optionCorrect,
    state === 'wrong' && styles.optionWrong,
    state === 'dimmed' && styles.optionDimmed,
  ];

  const bodyColor =
    state === 'correct' || state === 'missed'
      ? colors.correctInk
      : state === 'wrong'
        ? colors.wrongInk
        : colors.inkMid;

  const tag = state === 'correct' ? 'CORRECT' : state === 'missed' ? 'ANSWER' : state === 'wrong' ? 'YOUR PICK' : null;

  const outcome =
    state === 'correct'
      ? ', correct'
      : state === 'wrong'
        ? ', your pick, incorrect'
        : state === 'missed'
          ? ', this was the correct answer'
          : '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Option ${label}: ${body}${outcome}`}
      accessibilityState={{ disabled, selected: state === 'selected' }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [...container, pressed && !disabled && styles.pressed]}
    >
      {showCheck || showCross ? (
        <View
          style={[
            styles.optionKey,
            { backgroundColor: showCheck ? colors.correct : colors.wrong },
          ]}
        >
          <Icon
            name={showCheck ? 'check' : 'close'}
            size={14}
            color={colors.onDark}
            strokeWidth={2.2}
          />
        </View>
      ) : (
        <View style={[styles.optionKey, styles.optionKeyIdle]}>
          <Text style={styles.optionKeyText}>{label}</Text>
        </View>
      )}
      <Text style={[styles.optionBody, { color: bodyColor }]}>{body}</Text>
      {tag ? (
        <Text
          style={[
            styles.optionTag,
            { color: showCross ? colors.wrongInk : colors.correctInk },
          ]}
        >
          {tag}
        </Text>
      ) : null}
    </Pressable>
  );
}

/* --------------------------------------------------------------- why card */

/** The explanation card. "Why" is set in Newsreader italic, like a margin note. */
export function WhyCard({ children }: { children: string }) {
  return (
    <View style={styles.why}>
      <Text style={styles.whyTitle}>Why</Text>
      <Text style={styles.whyBody}>{children}</Text>
    </View>
  );
}

/* -------------------------------------------------------------- countdown */

export function TimerBar({ remaining, total }: { remaining: number; total: number }) {
  const fraction = Math.max(0, Math.min(remaining / Math.max(total, 1), 1));
  // Turns amber under 25% so the user feels the clock before it bites.
  const tint = fraction > 0.25 ? colors.brand : colors.warn;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <View
      style={styles.timerTrack}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${minutes} minutes ${seconds} seconds remaining`}
      accessibilityValue={{ min: 0, max: total, now: remaining }}
    >
      <View
        style={[styles.timerFill, { width: `${fraction * 100}%`, backgroundColor: tint }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },

  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warmWash,
    borderWidth: 1,
    borderColor: colors.warmLine,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  streakCount: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.warmInk,
    fontVariant: ['tabular-nums'],
  },

  fraction: { alignItems: 'center' },

  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: 2 },

  monogram: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: { fontFamily: fonts.monoMedium, fontSize: 12 },

  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 13,
    paddingHorizontal: space.lg,
  },
  categoryName: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink },
  categorySub: { fontFamily: fonts.sans, fontSize: 12, color: colors.inkSoft, marginTop: 1 },

  code: {
    backgroundColor: colors.brandInk,
    borderRadius: radius.md + 2,
    paddingVertical: 13,
    paddingHorizontal: 15,
    marginTop: space.md,
  },
  codeText: {
    fontFamily: fonts.mono,
    fontSize: 12.5,
    lineHeight: 20,
    color: colors.cyanSoft,
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md + 2,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
  },
  optionSelected: { borderWidth: 1.5, borderColor: colors.brand },
  optionCorrect: {
    backgroundColor: colors.correctWash,
    borderWidth: 1.5,
    borderColor: colors.correct,
  },
  optionWrong: {
    backgroundColor: colors.wrongWash,
    borderWidth: 1.5,
    borderColor: colors.wrong,
  },
  optionDimmed: { opacity: 0.65 },
  optionKey: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionKeyIdle: { backgroundColor: colors.bg },
  optionKeyText: { fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.brandDeep },
  optionBody: { flex: 1, fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  optionTag: { fontFamily: fonts.sansSemiBold, fontSize: 10, letterSpacing: 1 },

  why: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md + 2,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  whyTitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    color: colors.brandDeep,
    marginBottom: 4,
  },
  whyBody: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 21, color: colors.inkMid },

  timerTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineNeutral,
    overflow: 'hidden',
  },
  timerFill: { height: '100%', borderRadius: 2 },
});
