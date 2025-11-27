import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Try to get from process.env first (Expo Go), then fall back to Constants.expoConfig.extra (production builds)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log('[Supabase] Initializing with URL:', SUPABASE_URL ? '✅ Present' : '❌ Missing');
console.log('[Supabase] Anon key:', SUPABASE_ANON_KEY ? '✅ Present' : '❌ Missing');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Cloud sync will stay disabled.'
  );
}

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
      },
    })
  : null;
