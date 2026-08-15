import React from 'react';
import {
  ActivityIndicator,
  Platform,
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

import { colors, monoFamily, radius, space, type } from '../theme';

export const mono = Platform.select(monoFamily);

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

type TextTone = 'default' | 'soft' | 'faint' | 'accent' | 'wrong';

const toneColor: Record<TextTone, string> = {
  default: colors.ink,
  soft: colors.inkSoft,
  faint: colors.inkFaint,
  accent: colors.accent,
  wrong: colors.wrong,
};

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
      style={[
        type[variant] as TextStyle,
        { color: toneColor[tone] },
        variant === 'mono' && { fontFamily: mono },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <Text style={[type.label as TextStyle, { color: color ?? colors.inkFaint }]}>
      {String(children).toUpperCase()}
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
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inert = disabled || loading;

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
        variant === 'ghost' && styles.buttonGhost,
        pressed && !inert && styles.buttonPressed,
        inert && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.inkInverse : colors.ink} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' && { color: colors.inkInverse },
            variant !== 'primary' && { color: colors.ink },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Pill({
  children,
  color = colors.inkFaint,
  background = colors.surfaceAlt,
}: {
  children: React.ReactNode;
  color?: string;
  background?: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={[type.caption as TextStyle, { color }]}>{children}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------- states */

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.centre}>
      <ActivityIndicator color={colors.accent} />
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
      <Txt variant="heading">{title}</Txt>
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
      <Txt variant="heading">{title}</Txt>
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
  },

  divider: { height: 1, backgroundColor: colors.line },

  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  centreText: { textAlign: 'center', maxWidth: 320 },

  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderWidth: 1,
  },
  buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.lineStrong },
  buttonGhost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { fontSize: 16, fontWeight: '700' },

  pill: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
