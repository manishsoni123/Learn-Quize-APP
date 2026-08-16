/**
 * Arcade components.
 *
 * Everything here exists to make a number feel like it matters. In Focus the
 * question is the interface; here the score, the clock and the lives are, so
 * they get the size and the motion and the question text sits underneath them.
 *
 * Motion is used only where something is genuinely at stake — a heart going
 * out, a rung climbed, a score landing. Animating anything else would make
 * those moments cheaper.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { arcade, arcadeType, modeColor, radius, space } from '../theme/arcade';
import { duration } from '../theme';
import type { GameMode } from '../lib/database.types';

/* ------------------------------------------------------------------ screen */

export function ArcadeScreen({
  children,
  edges = ['top', 'bottom'],
}: {
  children: React.ReactNode;
  edges?: ReadonlyArray<'top' | 'bottom' | 'left' | 'right'>;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------- lives */

/**
 * Lives, drawn as hearts.
 *
 * The lost one pulses rather than simply disappearing. A heart that vanishes
 * between renders is easy to miss, and missing it means not understanding why
 * the run ended.
 */
export function Hearts({ lives, max }: { lives: number; max: number }) {
  const shake = useSharedValue(0);
  const reduced = useReducedMotion();
  const previous = useRef(lives);

  useEffect(() => {
    if (lives < previous.current && !reduced) {
      shake.value = withSequence(
        withTiming(1, { duration: duration.fast }),
        withTiming(0, { duration: duration.base }),
      );
    }
    previous.current = lives;
  }, [lives, reduced, shake]);

  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + shake.value * 0.25 }],
    opacity: 1 - shake.value * 0.35,
  }));

  return (
    <Animated.View style={[styles.hearts, pulse]}>
      {Array.from({ length: max }, (_, i) => (
        <Ionicons
          key={i}
          name={i < lives ? 'heart' : 'heart-outline'}
          size={20}
          color={i < lives ? arcade.hot : arcade.line}
        />
      ))}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ ladder */

/**
 * The rungs, with everything above the current one still unclaimed.
 *
 * Rendered top-down so the climb reads upward, and the rung immediately above
 * is always visible — the whole decision is "is one more worth it", and you
 * cannot make it without seeing what one more pays.
 */
export function LadderRail({
  rungs,
  current,
}: {
  rungs: number[];
  current: number;
}) {
  return (
    <View style={styles.ladder}>
      {rungs
        .map((value, i) => ({ value, rung: i + 1 }))
        .reverse()
        .map(({ value, rung }) => {
          const climbed = rung <= current;
          const next = rung === current + 1;

          return (
            <View
              key={rung}
              style={[
                styles.rung,
                climbed && styles.rungClimbed,
                next && styles.rungNext,
              ]}
            >
              <Text
                style={[
                  styles.rungIndex,
                  { color: climbed ? arcade.energy : arcade.inkFaint },
                ]}
              >
                {rung}
              </Text>
              <Text
                style={[
                  styles.rungValue,
                  { color: climbed ? arcade.ink : arcade.inkFaint },
                ]}
              >
                {value.toLocaleString()}
              </Text>
              {rung === current ? (
                <Text style={styles.rungHere}>AT RISK</Text>
              ) : null}
            </View>
          );
        })}
    </View>
  );
}

/* ------------------------------------------------------------- big numeral */

/**
 * A number, counted up rather than snapped to.
 *
 * Watching it climb is most of the reward — a score that simply appears is
 * information, a score that counts is a small event. Tabular figures come
 * from arcadeType so the width does not jitter as digits change.
 */
export function BigNumber({
  value,
  size = 'score',
  color = arcade.energy,
  animate = true,
}: {
  value: number;
  size?: 'hero' | 'score' | 'meter';
  color?: string;
  animate?: boolean;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(animate && !reduced ? 0 : value);

  useEffect(() => {
    if (!animate || reduced) {
      setShown(value);
      return;
    }

    const from = 0;
    const startedAt = Date.now();
    const span = 700;

    const id = setInterval(() => {
      const t = Math.min((Date.now() - startedAt) / span, 1);
      // Ease out: fast to begin, settling at the end, so the final number
      // lands rather than stopping dead.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t >= 1) clearInterval(id);
    }, 32);

    return () => clearInterval(id);
  }, [value, animate, reduced]);

  return <Text style={[arcadeType[size], { color }]}>{shown.toLocaleString()}</Text>;
}

/* ------------------------------------------------------------------ clock */

export function RunClock({ remaining, total }: { remaining: number; total: number }) {
  const fraction = Math.max(0, Math.min(remaining / Math.max(total, 1), 1));
  // Goes hot under a quarter left, so the pressure is felt before it bites.
  const tint = fraction > 0.25 ? arcade.volt : arcade.hot;

  return (
    <View style={styles.clockRow}>
      <Text style={[arcadeType.meter, { color: tint }]}>
        {Math.ceil(remaining)}
      </Text>
      <View style={styles.clockTrack}>
        <View
          style={[styles.clockFill, { width: `${fraction * 100}%`, backgroundColor: tint }]}
        />
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- button */

export function ArcadeButton({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  sub,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  sub?: string;
}) {
  const skin = {
    primary: { bg: arcade.energy, border: arcade.energy, text: arcade.inkInverse },
    danger: { bg: 'transparent', border: arcade.hot, text: arcade.hot },
    ghost: { bg: 'transparent', border: arcade.line, text: arcade.inkSoft },
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: skin.bg, borderColor: skin.border },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonLabel, { color: skin.text }]}>{label}</Text>
      {sub ? (
        <Text style={[styles.buttonSub, { color: skin.text }]}>{sub}</Text>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------- cards */

export function ModeCard({
  mode,
  locked,
  best,
  resume = false,
  onPress,
}: {
  mode: GameMode;
  locked: boolean;
  best?: number;
  /** An unfinished match is waiting. Changes what the card promises. */
  resume?: boolean;
  onPress: () => void;
}) {
  const accent = mode.accent_hex || modeColor(mode.slug);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeCard,
        { borderColor: locked ? arcade.line : accent },
        pressed && !locked && styles.pressed,
        locked && styles.disabled,
      ]}
    >
      <View style={styles.modeHead}>
        <View style={[styles.modeGlyph, { backgroundColor: accent + '22' }]}>
          <Ionicons
            name={(locked ? 'lock-closed' : (mode.icon as any)) ?? 'game-controller'}
            size={20}
            color={accent}
          />
        </View>
        {resume ? (
          <View style={[styles.resumeChip, { borderColor: accent }]}>
            <Text style={[styles.resumeText, { color: accent }]}>IN PROGRESS</Text>
          </View>
        ) : best !== undefined && best > 0 ? (
          <View style={styles.modeBest}>
            <Text style={styles.modeBestLabel}>BEST</Text>
            <Text style={[styles.modeBestValue, { color: accent }]}>
              {best.toLocaleString()}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.modeName}>{mode.name}</Text>
      <Text style={styles.modeTagline}>
        {locked
          ? `Unlocks at level ${mode.min_level}`
          : resume
            ? 'Pick up where you left off'
            : mode.tagline}
      </Text>
    </Pressable>
  );
}

export function Stat({
  label,
  value,
  color = arcade.ink,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: arcade.bg },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },

  hearts: { flexDirection: 'row', gap: space.xs },

  ladder: { gap: 3 },
  rung: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rungClimbed: { backgroundColor: arcade.energyDim },
  rungNext: { borderColor: arcade.lineStrong, borderStyle: 'dashed' },
  rungIndex: {
    width: 20,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rungValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rungHere: {
    color: arcade.energy,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  clockRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  clockTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: arcade.surfaceAlt,
    overflow: 'hidden',
  },
  clockFill: { height: '100%', borderRadius: radius.pill },

  button: {
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 15, fontWeight: '800', letterSpacing: 0.8 },
  buttonSub: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.75,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  modeCard: {
    backgroundColor: arcade.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: space.lg,
    gap: space.xs,
    minHeight: 132,
  },
  modeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  modeGlyph: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: space.sm,
  },
  resumeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },

  modeBest: { alignItems: 'flex-end' },
  modeBestLabel: {
    color: arcade.inkFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  modeBestValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  modeName: { color: arcade.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  modeTagline: { color: arcade.inkSoft, fontSize: 13, lineHeight: 18 },

  stat: { alignItems: 'center', gap: 2 },
  statLabel: {
    color: arcade.inkFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  statValue: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
