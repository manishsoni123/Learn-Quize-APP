import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../src/lib/auth';
import { isSupabaseConfigured } from '../src/lib/supabase';
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
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    void SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  if (loading) return <Loading />;

  return <>{children}</>;
}

/** Shown when the project has not been pointed at a Supabase instance yet. */
function SetupRequired() {
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
        <Txt variant="mono" tone="accent">
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
  if (!isSupabaseConfigured) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SetupRequired />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="light" />
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
                <Stack.Screen
                  name="quiz/[sessionId]"
                  options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
                />
                <Stack.Screen name="quiz/results" options={{ gestureEnabled: false }} />
                <Stack.Screen name="arcade/index" />
                {/* No swipe-back mid-run: a run has stakes, and losing one to
                    an accidental edge gesture is the worst way to lose it. */}
                <Stack.Screen
                  name="arcade/[mode]"
                  options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
                />
                <Stack.Screen name="arcade/results" options={{ gestureEnabled: false }} />
                <Stack.Screen name="arcade/ludo" options={{ animation: 'slide_from_bottom' }} />
              </Stack>
            </AuthGate>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
