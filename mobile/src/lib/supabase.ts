import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

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
 * Session storage: AES-256-CTR ciphertext in AsyncStorage, the per-entry key
 * in the device keychain via expo-secure-store. Raw SecureStore cannot hold
 * the session itself — its practical value limit (2 KB) is smaller than a
 * Supabase session JSON — so this is the documented Supabase pattern for
 * Expo: the keychain holds 32 bytes, AsyncStorage holds ciphertext, and a
 * refresh token never sits on disk in the clear.
 */
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encrypted);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const keyHex = await SecureStore.getItemAsync(key);
    if (!keyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(keyHex),
      new aesjs.Counter(1),
    );
    const decrypted = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decrypted);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      return await this.decrypt(key, encrypted);
    } catch {
      // Unreadable ciphertext (e.g. keychain wiped on reinstall): treat as
      // signed out rather than crashing the auth restore.
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

// SecureStore does not exist on web (used only for Expo web previews).
const sessionStorage = Platform.OS === 'web' ? AsyncStorage : new LargeSecureStore();

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
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no browser to read a redirect fragment from; recovery links
      // are parsed by hand in lib/auth.tsx.
      detectSessionInUrl: false,
    },
  },
);
