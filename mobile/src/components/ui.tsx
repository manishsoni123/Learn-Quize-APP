import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { colors, fonts, radius, shadow, space, type } from '../theme';

/* ------------------------------------------------------------------ layout */

export function Screen({
  children,
  scroll = false,
  edges = ['top'],
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollBody, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {body}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export const Spacer = ({ h = space.lg }: { h?: number }) => <View style={{ height: h }} />;

export const Divider = () => <View style={styles.divider} />;

/* -------------------------------------------------------------- typography */

type TextTone =
  | 'default'
  | 'mid'
  | 'soft'
  | 'faint'
  | 'brand'
  | 'correct'
  | 'wrong'
  | 'onDark'
  | 'onDarkSoft';

const toneColor: Record<TextTone, string> = {
  default: colors.ink,
  mid: colors.inkMid,
  soft: colors.inkSoft,
  // Deliberately the same ink as `soft`: the lighter inkFaint fails WCAG AA
  // at caption sizes. inkFaint stays for icons and placeholders only.
  faint: colors.inkSoft,
  brand: colors.brandDeep,
  correct: colors.correctInk,
  wrong: colors.wrongInk,
  onDark: colors.onDark,
  onDarkSoft: colors.onDarkSoft,
};

/** Fixed-height rows survive large system font settings up to this factor. */
const MAX_FONT_SCALE = 1.4;

export function Txt({
  children,
  variant = 'body',
  tone = 'default',
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  variant?: keyof typeof type;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[type[variant] as TextStyle, { color: toneColor[tone] }, style]}
    >
      {children}
    </Text>
  );
}

/** Uppercase kicker label — "QUICK QUIZ", "DEVELOPER TRACK". Uppercased via
 *  style so screen readers get the real string, not spelled-out letters. */
export function Eyebrow({
  children,
  color = colors.brandDeep,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[type.eyebrow as TextStyle, { color, textTransform: 'uppercase' }]}
    >
      {children}
    </Text>
  );
}

/* ----------------------------------------------------------------- controls */

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  /** `light` is the white button used on dark teal grounds. */
  variant?: 'primary' | 'secondary' | 'light' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inert = disabled || loading;
  const labelColor =
    variant === 'primary' ? colors.onDark : variant === 'light' ? colors.brandInk : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'light' && styles.buttonLight,
        variant === 'ghost' && styles.buttonGhost,
        pressed && !inert && styles.buttonPressed,
        inert && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.buttonLabel, { color: labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/**
 * The two-option pill switcher from the design — Sign in / Create account,
 * This week / All time.
 */
export function Segmented({
  options,
  value,
  onChange,
  dark = false,
}: {
  options: readonly string[];
  value: string;
  onChange: (option: string) => void;
  /** `dark` fills the active pill with deep teal (leaderboard style). */
  dark?: boolean;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) onChange(option);
            }}
            style={[
              styles.segment,
              active && (dark ? styles.segmentActiveDark : styles.segmentActive),
            ]}
          >
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[
                styles.segmentLabel,
                active && { fontFamily: fonts.sansSemiBold },
                active && { color: dark ? colors.onDark : colors.brandDark },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Pill({
  children,
  color = colors.inkSoft,
  background = colors.muted,
}: {
  children: React.ReactNode;
  color?: string;
  background?: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={[type.caption as TextStyle, { color, fontFamily: fonts.sansSemiBold }]}>
        {children}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------- states */

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.centre}>
      <ActivityIndicator color={colors.brand} />
      {label ? (
        <>
          <Spacer h={space.md} />
          <Txt variant="small" tone="faint">
            {label}
          </Txt>
        </>
      ) : null}
    </View>
  );
}

/**
 * Error and empty states say what happened and what to do about it. No
 * apologies, no "Oops!".
 */
export function ErrorView({
  title = 'Could not load that',
  detail,
  onRetry,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centre}>
      <Txt variant="serifCard">{title}</Txt>
      {detail ? (
        <>
          <Spacer h={space.sm} />
          <Txt variant="small" tone="soft" style={styles.centreText}>
            {detail}
          </Txt>
        </>
      ) : null}
      {onRetry ? (
        <>
          <Spacer h={space.lg} />
          <Button label="Try again" variant="secondary" onPress={onRetry} />
        </>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.centre}>
      <Txt variant="serifCard">{title}</Txt>
      {detail ? (
        <>
          <Spacer h={space.sm} />
          <Txt variant="small" tone="soft" style={styles.centreText}>
            {detail}
          </Txt>
        </>
      ) : null}
      {action ? (
        <>
          <Spacer h={space.lg} />
          <Button label={action.label} onPress={action.onPress} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollBody: { padding: space.lg, paddingBottom: space.xxxl },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    ...shadow.card,
  },

  divider: { height: 1, backgroundColor: colors.muted },

  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  centreText: { textAlign: 'center', maxWidth: 320 },

  button: {
    minHeight: 52,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  buttonPrimary: { backgroundColor: colors.brand },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
  },
  buttonLight: { backgroundColor: colors.sheet },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { fontFamily: fonts.sansSemiBold, fontSize: 15 },

  segmented: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    padding: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: '#081826',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentActiveDark: { backgroundColor: colors.brandDark },
  segmentLabel: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.inkSoft },

  pill: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
});
