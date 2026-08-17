import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authErrorMessage, requestPasswordReset } from '../../src/lib/auth';
import { Icon } from '../../src/components/icons';
import { Button, Spacer, Txt } from '../../src/components/ui';
import { colors, fonts, radius, space } from '../../src/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={8}
        >
          <Icon name="chevronLeft" size={18} color={colors.inkMid} strokeWidth={2} />
        </Pressable>

        <Spacer h={space.xl} />
        <Text style={styles.title}>Reset your password</Text>
        <Spacer h={space.sm} />
        <Txt variant="body" tone="soft">
          {sent
            ? `We sent a reset link to ${email.trim()}. Open it on this device and you can choose a new password.`
            : 'Enter the email you signed up with and we will send you a reset link.'}
        </Txt>

        {!sent ? (
          <>
            <Spacer h={space.xl} />
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={[styles.input, focused && styles.inputFocused]}>
              <Icon name="mail" size={17} color={colors.inkFaint} strokeWidth={1.5} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholderTextColor={colors.inkFaint}
                style={styles.inputText}
              />
            </View>

            {error ? (
              <>
                <Spacer h={space.md} />
                <View style={styles.errorRow}>
                  <Icon name="alert" size={13} color={colors.wrongInk} strokeWidth={2} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              </>
            ) : null}

            <Spacer h={space.xl} />
            <Button
              label="Send reset link"
              onPress={submit}
              disabled={!email.includes('@')}
              loading={busy}
            />
          </>
        ) : (
          <>
            <Spacer h={space.xl} />
            <Button
              label="Back to sign in"
              variant="secondary"
              onPress={() => router.back()}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: space.xl, paddingTop: space.md },

  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 34, color: colors.ink },

  fieldLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.inkMid,
    marginBottom: 6,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 2,
    height: 50,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  inputFocused: { borderWidth: 1.5, borderColor: colors.brand },
  inputText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.wrongInk,
  },
});
