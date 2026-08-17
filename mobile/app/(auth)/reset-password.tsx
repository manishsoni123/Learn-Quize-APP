import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authErrorMessage, updatePassword, useAuth } from '../../src/lib/auth';
import { Icon } from '../../src/components/icons';
import { Button, Spacer, Txt } from '../../src/components/ui';
import { colors, fonts, radius, space } from '../../src/theme';

/**
 * Reached through the recovery deep link: the reset email lands the user here
 * with a fresh session already adopted by AuthProvider. All that is left is
 * choosing the new password.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      clearPasswordRecovery();
      router.replace('/(tabs)');
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Spacer h={space.xl} />
        <Text style={styles.title}>Choose a new password</Text>
        <Spacer h={space.sm} />
        <Txt variant="body" tone="soft">
          You are signed in through the reset link. Pick a new password to keep
          your account.
        </Txt>

        <Spacer h={space.xl} />
        <Text style={styles.fieldLabel}>New password</Text>
        <View style={[styles.input, focused && styles.inputFocused]}>
          <Icon name="lock" size={17} color={colors.inkFaint} strokeWidth={1.5} />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry={!visible}
            autoCapitalize="none"
            textContentType="newPassword"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholderTextColor={colors.inkFaint}
            style={styles.inputText}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible((v) => !v)}
            hitSlop={10}
          >
            <Icon
              name={visible ? 'eyeOff' : 'eye'}
              size={17}
              color={colors.inkFaint}
              strokeWidth={1.5}
            />
          </Pressable>
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
          label="Save password"
          onPress={submit}
          disabled={password.length < 8}
          loading={busy}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, padding: space.xl },

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
