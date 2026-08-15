import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { signIn, signUp } from '../../src/lib/auth';
import { Button, Label, Screen, Spacer, Txt } from '../../src/components/ui';
import { colors, radius, space } from '../../src/theme';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'sign-up';
  const canSubmit =
    email.includes('@') && password.length >= 6 && (!isSignUp || name.trim().length > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (isSignUp) {
        await signUp(email.trim(), password, name.trim());
      } else {
        await signIn(email.trim(), password);
      }
      // The auth listener in AuthProvider handles navigation.
    } catch (e) {
      // Surface what actually went wrong and what to do about it.
      const message = e instanceof Error ? e.message : 'Something went wrong';
      setError(
        message.includes('Invalid login')
          ? 'That email and password do not match an account.'
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <View>
            <Label color={colors.accent}>Learn-Quize</Label>
            <Spacer h={space.md} />
            <Txt variant="display">
              {isSignUp ? 'Start your streak.' : 'Welcome back.'}
            </Txt>
            <Spacer h={space.sm} />
            <Txt variant="body" tone="soft">
              {isSignUp
                ? 'Practise, compete, and actually retain what you learn.'
                : 'Pick up where you left off.'}
            </Txt>
          </View>

          <View>
            {isSignUp ? (
              <>
                <Field
                  label="Name"
                  value={name}
                  onChangeText={setName}
                  placeholder="Samir"
                  autoCapitalize="words"
                  textContentType="name"
                />
                <Spacer h={space.md} />
              </>
            ) : null}

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
            />
            <Spacer h={space.md} />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              textContentType={isSignUp ? 'newPassword' : 'password'}
            />

            {error ? (
              <>
                <Spacer h={space.md} />
                <Txt variant="small" tone="wrong">
                  {error}
                </Txt>
              </>
            ) : null}

            <Spacer h={space.xl} />
            <Button
              label={isSignUp ? 'Create account' : 'Sign in'}
              onPress={submit}
              disabled={!canSubmit}
              loading={busy}
            />
            <Spacer h={space.lg} />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode(isSignUp ? 'sign-in' : 'sign-up');
                setError(null);
              }}
              style={styles.switch}
            >
              <Txt variant="small" tone="soft">
                {isSignUp ? 'Already have an account? ' : 'New here? '}
                <Txt variant="small" tone="accent">
                  {isSignUp ? 'Sign in' : 'Create one'}
                </Txt>
              </Txt>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Label>{label}</Label>
      <Spacer h={space.sm} />
      <TextInput
        {...props}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, focused && styles.inputFocused]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.xxxl,
    paddingBottom: space.xl,
    gap: space.xxl,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    minHeight: 52,
    color: colors.ink,
    fontSize: 16,
  },
  inputFocused: { borderColor: colors.accent },
  switch: { alignItems: 'center', paddingVertical: space.sm },
});
