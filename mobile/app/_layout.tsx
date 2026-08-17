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
import NetInfo from '@react-native-community/netinfo';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../src/lib/auth';
import { isSupabaseConfigured } from '../src/lib/supabase';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { Button, Loading, Screen, Spacer, Txt } from '../src/components/ui';
import { colors, fonts, space } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

// React Query assumes it runs in a browser. On a phone, "online" comes from
// NetInfo and "focused" from AppState — without these bridges it would never
// notice a dropped connection or a return from the background, and queries
// would neither pause nor refresh.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000,
    },
  },
});

/** Slim banner over everything while the device has no connection. */
function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(
    () => NetInfo.addEventListener((state) => setOffline(state.isConnected === false)),
    [],
  );

  if (!offline) return null;

  return (
    <View
      style={[bannerStyles.banner, { paddingTop: insets.top + 4 }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={bannerStyles.text}>
        {"No connection — answers pause until you're back online"}
      </Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: colors.brandInk,
    paddingBottom: 6,
    alignItems: 'center',
  },
  text: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.onDarkSoft },
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
  // Focus bridge: returning from the background counts as "window focus".
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );
    return () => sub.remove();
  }, []);

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
              <OfflineBanner />
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
