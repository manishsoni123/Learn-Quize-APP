import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from '@expo-google-fonts/inter-tight';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
} from '@expo-google-fonts/newsreader';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../src/lib/auth';
import { isSupabaseConfigured } from '../src/lib/supabase';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { Button, Loading, Screen, Spacer, Txt } from '../src/components/ui';
import { colors, space } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
    },
  },
});

/**
 * Sends signed-out users to the auth stack and signed-in users out of it.
 * Rendered inside AuthProvider so it can read the restored session.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, passwordRecovery } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const previousUser = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    void SplashScreen.hideAsync();

    // A departing user's cached profile, history and scores must never flash
    // for whoever signs in next on the same device.
    const uid = session?.user.id ?? null;
    if (previousUser.current && uid !== previousUser.current) {
      queryClient.clear();
    }
    previousUser.current = uid;

    const inAuthGroup = segments[0] === '(auth)';

    if (passwordRecovery && session) {
      // Arrived through a reset link: the only sensible destination is the
      // new-password screen, wherever the app happened to be.
      if (segments[1] !== 'reset-password') {
        router.replace('/(auth)/reset-password');
      }
    } else if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, passwordRecovery, segments, router]);

  if (loading) return <Loading />;

  return <>{children}</>;
}

/** Shown when the project has not been pointed at a Supabase instance yet. */
function SetupRequired() {
  // This screen renders outside AuthGate, which is where the splash normally
  // hides — without this, a misconfigured build hangs on the splash forever.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <Screen>
      <Screen contentStyle={{ justifyContent: 'center', padding: space.xl }}>
        <Txt variant="title">Almost there</Txt>
        <Spacer h={space.md} />
        <Txt variant="body" tone="soft">
          Create a file called <Txt variant="mono">.env</Txt> in the{' '}
          <Txt variant="mono">mobile/</Txt> folder with your Supabase project details:
        </Txt>
        <Spacer h={space.lg} />
        <Txt variant="mono" tone="brand">
          EXPO_PUBLIC_SUPABASE_URL=...{'\n'}
          EXPO_PUBLIC_SUPABASE_ANON_KEY=...
        </Txt>
        <Spacer h={space.lg} />
        <Txt variant="small" tone="faint">
          Both values are in your Supabase dashboard under Project Settings → API. Restart
          the dev server after saving — Expo reads env files at startup.
        </Txt>
        <Spacer h={space.xl} />
        <Button
          label="Copy .env.example"
          variant="secondary"
          onPress={() => {
            /* Nothing to do at runtime — the file is in the repo. */
          }}
        />
      </Screen>
    </Screen>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_500Medium,
    Newsreader_400Regular_Italic,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  // The splash stays up until fonts resolve — a flash of fallback type would
  // undo the identity. But a font-load *failure* must not hang the app
  // forever: system fonts are the lesser evil.
  if (!fontsLoaded && !fontError) return null;

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SetupRequired />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <StatusBar style="dark" />
              <AuthGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)/sign-in" />
                {/* No swipe-back mid-quiz: leaving is an explicit choice with a
                    confirm, not something an edge gesture should do. */}
                <Stack.Screen
                  name="quiz/[sessionId]"
                  options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
                />
                <Stack.Screen name="quiz/results" options={{ gestureEnabled: false }} />
              </Stack>
              </AuthGate>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
