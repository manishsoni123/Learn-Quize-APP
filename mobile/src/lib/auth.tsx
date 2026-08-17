import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { supabase } from './supabase';

/** Where password-reset emails deep-link back into the app. Must be in the
 *  Supabase project's redirect allow-list (see docs/hosted-setup.md). */
export const RESET_REDIRECT = 'learnquize://reset-password';

interface AuthState {
  session: Session | null;
  userId: string | null;
  /** True until the persisted session has been read from storage. */
  loading: boolean;
  /** True while the app holds a session that arrived via a recovery link —
   *  the user must be routed to the set-new-password screen. */
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthState>({
  session: null,
  userId: null,
  loading: true,
  passwordRecovery: false,
  clearPasswordRecovery: () => {},
});

/** Pulls `#access_token=...&type=recovery` out of an auth deep link. */
function parseAuthFragment(url: string): Record<string, string> | null {
  const hash = url.split('#')[1];
  if (!hash) return null;
  const params: Record<string, string> = {};
  for (const pair of hash.split('&')) {
    const [k, v] = pair.split('=');
    if (k) params[k] = decodeURIComponent(v ?? '');
  }
  return params;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const timezoneSynced = useRef(false);

  useEffect(() => {
    let active = true;

    // Restore whatever is in storage before deciding where to route, so a
    // returning user never sees the sign-in screen flash past.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    // Password-reset links open the app with the tokens in the URL fragment.
    // detectSessionInUrl is off (no browser), so adopt the session by hand
    // and flag recovery so the gate routes to the new-password screen.
    async function handleUrl(url: string | null) {
      if (!url) return;
      const params = parseAuthFragment(url);
      if (!params?.access_token || !params.refresh_token) return;
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (!error && params.type === 'recovery') setPasswordRecovery(true);
    }

    void Linking.getInitialURL().then(handleUrl);
    const urlSub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      urlSub.remove();
    };
  }, []);

  // Streak day-boundaries are computed in the user's timezone server-side,
  // but nothing else ever writes it — without this, everyone is on UTC and
  // IST users lose streaks at 5:30am. Fire-and-forget, once per app run.
  useEffect(() => {
    if (!session?.user.id || timezoneSynced.current) return;
    timezoneSynced.current = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    void supabase
      .from('profiles')
      .update({ timezone })
      .eq('id', session.user.id)
      .then(() => {});
  }, [session?.user.id]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      loading,
      passwordRecovery,
      clearPasswordRecovery: () => setPasswordRecovery(false),
    }),
    [session, loading, passwordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/* ------------------------------------------------------------------ actions */

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Returns 'session' when the account is live immediately, or 'confirm' when
 * the project requires email confirmation — in that case GoTrue returns no
 * session and NO error, and the UI must say "check your inbox" rather than
 * silently doing nothing.
 */
export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<'session' | 'confirm'> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: displayName } },
  });
  if (error) throw error;
  return data.session ? 'session' : 'confirm';
}

export async function resendConfirmation(email: string) {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: RESET_REDIRECT,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  // A failed network sign-out still must not trap the user in the app:
  // clear the local session regardless.
  if (error) await supabase.auth.signOut({ scope: 'local' });
}

/** Permanent server-side erasure (delete_account RPC), then local sign-out. */
export async function deleteAccount() {
  const { error } = await supabase.rpc('delete_account');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

/* ----------------------------------------------------------- error surface */

export { authErrorMessage } from './authErrors';
