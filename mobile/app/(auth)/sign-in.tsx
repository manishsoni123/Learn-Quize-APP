import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signIn, signUp } from '../../src/lib/auth';
import { Icon, type IconName } from '../../src/components/icons';
import { Button, Segmented } from '../../src/components/ui';
import { colors, fonts, radius, space, tealGradient } from '../../src/theme';

const MODES = ['Sign in', 'Create account'] as const;

export default function SignInScreen() {
  const [mode, setMode] = useState<string>(MODES[0]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === MODES[1];
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
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[...tealGradient]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.header}
      />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* -------------------------------------------------------- brand */}
            <View style={styles.brandArea}>
              <View style={styles.brandRow}>
                <View style={styles.logoMark}>
                  <Text style={styles.logoQ}>Q</Text>
                </View>
                <Text style={styles.wordmark}>Learn-Quize</Text>
              </View>
              <Text style={styles.headline}>A little every day,{'\n'}interview-ready.</Text>
              <Text style={styles.tagline}>
                Short quizzes for developers, AI engineers, and traders.
              </Text>
            </View>

            {/* -------------------------------------------------------- sheet */}
            <View style={styles.sheet}>
              <Segmented
                options={MODES}
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  setError(null);
                }}
              />

              {isSignUp ? (
                <Field
                  label="Name"
                  icon="person"
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  autoCapitalize="words"
                  textContentType="name"
                />
              ) : null}

              <Field
                label="Email"
                icon="mail"
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
              />

              <PasswordField
                value={password}
                onChangeText={setPassword}
                isNew={isSignUp}
              />

              {error ? (
                <View style={styles.errorRow}>
                  <Icon name="alert" size={13} color={colors.wrongInk} strokeWidth={2} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Button
                label={isSignUp ? 'Create account' : 'Sign in'}
                onPress={submit}
                disabled={!canSubmit}
                loading={busy}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Field({
  label,
  icon,
  ...props
}: { label: string; icon: IconName } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.input, focused && styles.inputFocused]}>
        <Icon name={icon} size={17} color={colors.inkFaint} strokeWidth={1.5} />
        <TextInput
          {...props}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.inkFaint}
          style={styles.inputText}
        />
      </View>
    </View>
  );
}

function PasswordField({
  value,
  onChangeText,
  isNew,
}: {
  value: string;
  onChangeText: (text: string) => void;
  isNew: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View>
      <Text style={styles.fieldLabel}>Password</Text>
      <View style={[styles.input, focused && styles.inputFocused]}>
        <Icon name="lock" size={17} color={colors.inkFaint} strokeWidth={1.5} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="At least 6 characters"
          secureTextEntry={!visible}
          autoCapitalize="none"
          textContentType={isNew ? 'newPassword' : 'password'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brandInk },
  flex: { flex: 1 },
  header: { ...StyleSheet.absoluteFillObject, bottom: '38%' },
  scroll: { flexGrow: 1, justifyContent: 'flex-end' },

  brandArea: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.md - 2 },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoQ: { fontFamily: fonts.serifItalic, fontSize: 22, color: colors.cyan },
  wordmark: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: colors.onDark,
    letterSpacing: 0.3,
  },
  headline: {
    fontFamily: fonts.serif,
    fontSize: 34,
    lineHeight: 40,
    color: colors.onDark,
    marginTop: space.xl + 2,
  },
  tagline: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.onDarkSoft,
    marginTop: space.sm + 2,
  },

  sheet: {
    backgroundColor: colors.sheet,
    borderTopLeftRadius: radius.xxl - 4,
    borderTopRightRadius: radius.xxl - 4,
    paddingHorizontal: space.xl,
    paddingTop: space.xl + 2,
    paddingBottom: space.xl,
    gap: 14,
  },

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
