import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** RFC1918 ranges plus loopback — i.e. "this is a local dev stack". */
const PRIVATE_HOST =
  /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost$)/;

/**
 * Keeps a local Supabase URL pointed at the right machine.
 *
 * In development the URL holds this laptop's LAN address, which changes every
 * time it joins a different network — a hotspot, the office, home. When it
 * does, the app does not fail: it *hangs*, because requests go to an address
 * that no longer answers and sit there until they time out. Sign-in spinning
 * forever is a stale IP far more often than it is a broken backend.
 *
 * Metro already knows the correct address — the bundle was just downloaded
 * over it. So when the configured host is a private address, take the host
 * from Metro and keep the port.
 *
 * Deliberately narrow: dev builds only, private hosts only. A hosted
 * `*.supabase.co` URL is never rewritten, so this cannot follow the app into
 * production.
 */
function resolveDevHost(configured: string): string {
  if (!__DEV__ || !configured) return configured;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    return configured;
  }

  if (!PRIVATE_HOST.test(parsed.hostname)) return configured;

  // "10.160.30.169:8081" → "10.160.30.169". Absent on a production build.
  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!metroHost || metroHost === parsed.hostname) return configured;

  const was = parsed.hostname;
  parsed.hostname = metroHost;
  const next = parsed.toString().replace(/\/$/, '');
  console.log(`[supabase] dev host ${was} → ${metroHost} (followed Metro)`);
  return next;
}

const url = resolveDevHost(configuredUrl);

/**
 * True once both env vars are present. The app checks this before rendering
 * anything that talks to the network, so a fresh clone shows setup
 * instructions instead of a stack trace.
 */
export const isSupabaseConfigured = Boolean(configuredUrl && anonKey);

// Not generically parameterised — see the note at the top of database.types.ts.
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key-placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no browser to read a redirect fragment from.
      detectSessionInUrl: false,
    },
  },
);
