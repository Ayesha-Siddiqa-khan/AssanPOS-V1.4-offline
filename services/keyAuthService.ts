import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabaseClient';

const SESSION_USER_KEY = 'pos.session.user';
const ACCESS_KEY_KEY = 'pos.session.access_key';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  accessKey: string;
  isActive: boolean;
  isTrial: boolean;
  trialEndsAt?: string | null;
  lastLoginAt?: string | null;
};

/**
 * Authenticate user with 6-digit access key via Supabase
 */
export async function authenticateWithAccessKey(accessKey: string): Promise<AuthenticatedUser | null> {
  console.log('[keyAuthService] Starting authentication with access key:', accessKey);
  
  // Demo/Offline mode - bypass authentication with key "000000"
  if (accessKey === '000000') {
    console.log('[keyAuthService] 🔓 Using DEMO/OFFLINE mode');
    const demoUser: AuthenticatedUser = {
      id: 'demo-user-id',
      name: 'Demo User (Offline)',
      email: null,
      phone: null,
      accessKey: '000000',
      isActive: true,
      isTrial: false,
      trialEndsAt: null,
      lastLoginAt: new Date().toISOString(),
    };
    await persistSession(demoUser);
    return demoUser;
  }
  
  if (!supabase) {
    console.error('[keyAuthService] Supabase is NOT configured! Check your .env file');
    throw new Error('Supabase is not configured. Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file.');
  }

  console.log('[keyAuthService] Supabase client is configured ✓');

  // Validate access key format (6 digits)
  if (!/^\d{6}$/.test(accessKey)) {
    console.log('[keyAuthService] Invalid key format - must be 6 digits');
    return null;
  }

  console.log('[keyAuthService] Key format valid ✓');

  try {
    console.log('[keyAuthService] Querying Supabase for user...');
    // Query Supabase for user with this access key
    const { data: user, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('access_key', accessKey)
      .eq('is_active', true)
      .single();

    if (error || !user) {
      console.log('[keyAuthService] Authentication failed:', error?.message || 'User not found');
      console.log('[keyAuthService] Error details:', JSON.stringify(error, null, 2));
      
      // Network error - suggest offline mode
      if (error?.message?.includes('Network request failed') || error?.message?.includes('Failed to fetch')) {
        console.log('[keyAuthService] 💡 Network error detected. Try key "000000" for offline/demo mode');
      }
      
      return null;
    }

    console.log('[keyAuthService] User found in Supabase:', user.name, user.email);

    // Check if trial user has expired
    if (user.is_trial && user.trial_ends_at) {
      const trialEndDate = new Date(user.trial_ends_at);
      const now = new Date();
      
      if (trialEndDate < now) {
        console.log('Trial has expired');
        // Auto-deactivate the user
        await supabase
          .from('app_users')
          .update({ is_active: false })
          .eq('id', user.id);
        
        return null;
      }
    }

    // Update last login timestamp
    await supabase
      .from('app_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Log the login activity
    await supabase
      .from('user_activity_log')
      .insert({
        user_id: user.id,
        action: 'login',
        metadata: {
          timestamp: new Date().toISOString(),
          platform: 'mobile',
          isTrial: user.is_trial,
          trialEndsAt: user.trial_ends_at,
        },
      });

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      accessKey: user.access_key,
      isActive: user.is_active,
      isTrial: user.is_trial,
      trialEndsAt: user.trial_ends_at,
      lastLoginAt: user.last_login_at,
    };

    console.log('[keyAuthService] ✅ Authentication successful!');
    console.log('[keyAuthService] User:', authenticatedUser.name, '- Trial:', authenticatedUser.isTrial);

    // Persist session locally
    await persistSession(authenticatedUser);

    return authenticatedUser;
  } catch (error) {
    console.error('[keyAuthService] ❌ Error authenticating with access key:', error);
    return null;
  }
}

/**
 * Get persisted session from secure storage
 */
export async function getPersistedSession(): Promise<AuthenticatedUser | null> {
  console.log('[keyAuthService] Checking for persisted session...');
  try {
    const userJson = await SecureStore.getItemAsync(SESSION_USER_KEY);
    if (!userJson) {
      console.log('[keyAuthService] No persisted session found');
      return null;
    }

    console.log('[keyAuthService] Found persisted session, validating...');
    const user = JSON.parse(userJson) as AuthenticatedUser;

    // Verify user is still active in Supabase
    if (supabase) {
      const { data, error } = await supabase
        .from('app_users')
        .select('is_active')
        .eq('id', user.id)
        .single();

      if (error || !data?.is_active) {
        console.log('[keyAuthService] Session invalid - clearing');
        await clearPersistedSession();
        return null;
      }
      
      console.log('[keyAuthService] ✅ Session valid for user:', user.name);
    }

    return user;
  } catch (error) {
    console.error('[keyAuthService] Error getting persisted session:', error);
    return null;
  }
}

/**
 * Persist session to secure storage
 */
async function persistSession(user: AuthenticatedUser): Promise<void> {
  await SecureStore.setItemAsync(SESSION_USER_KEY, JSON.stringify(user));
  await SecureStore.setItemAsync(ACCESS_KEY_KEY, user.accessKey);
}

/**
 * Clear persisted session
 */
export async function clearPersistedSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_USER_KEY);
  await SecureStore.deleteItemAsync(ACCESS_KEY_KEY);
}

/**
 * Recreate session for biometric authentication
 * @param userId - Supabase user ID (UUID string)
 */
export async function recreateSessionForUser(userId: string): Promise<AuthenticatedUser | null> {
  console.log('[keyAuthService] Recreating session for user ID:', userId);
  
  if (!supabase) {
    console.error('[keyAuthService] Supabase not initialized');
    return null;
  }

  try {
    const { data: user, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[keyAuthService] Error fetching user:', error);
      return null;
    }

    if (!user || !user.is_active) {
      console.log('[keyAuthService] User not found or inactive');
      return null;
    }

    // Log the biometric login activity
    await supabase
      .from('user_activity_log')
      .insert({
        user_id: user.id,
        action: 'biometric_login',
        metadata: {
          timestamp: new Date().toISOString(),
          platform: 'mobile',
        },
      });

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      accessKey: user.access_key,
      isActive: user.is_active,
      isTrial: user.is_trial,
      trialEndsAt: user.trial_ends_at,
      lastLoginAt: user.last_login_at,
    };

    // Persist session locally
    await persistSession(authenticatedUser);

    console.log('[keyAuthService] ✅ Session recreated successfully');
    return authenticatedUser;
  } catch (error) {
    console.error('[keyAuthService] Error recreating session:', error);
    return null;
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  const userJson = await SecureStore.getItemAsync(SESSION_USER_KEY);
  if (userJson && supabase) {
    const user = JSON.parse(userJson) as AuthenticatedUser;
    
    // Log the logout activity
    await supabase
      .from('user_activity_log')
      .insert({
        user_id: user.id,
        action: 'logout',
        metadata: {
          timestamp: new Date().toISOString(),
          platform: 'mobile',
        },
      });
  }

  await clearPersistedSession();
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getPersistedSession();
  return session !== null;
}

/**
 * Validate access key format
 */
export function validateAccessKeyFormat(key: string): boolean {
  return /^\d{6}$/.test(key);
}

/**
 * Check if current user is still active in Supabase
 * Returns null if user is deactivated or not found
 * Throws error if offline (to allow offline usage)
 */
export async function checkUserStatus(): Promise<AuthenticatedUser | null> {
  try {
    const userJson = await SecureStore.getItemAsync(SESSION_USER_KEY);
    if (!userJson || !supabase) {
      return null;
    }

    const user = JSON.parse(userJson) as AuthenticatedUser;

    // Check user status in Supabase
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', user.id)
      .single();

    // Network error - likely offline, throw to allow cached usage
    if (error) {
      if (error.message?.includes('Failed to fetch') || 
          error.message?.includes('Network request failed') ||
          error.code === 'PGRST301') {
        console.log('[keyAuthService] Offline - using cached session');
        throw new Error('OFFLINE');
      }
      
      // Other error - user not found or deleted
      console.log('[keyAuthService] User not found in database:', error.message);
      await clearPersistedSession();
      return null;
    }

    if (!data) {
      console.log('[keyAuthService] User not found in database');
      await clearPersistedSession();
      return null;
    }

    // Check if user is deactivated
    if (!data.is_active) {
      console.log('[keyAuthService] User has been deactivated');
      await clearPersistedSession();
      return null;
    }

    // Check if trial has expired
    if (data.is_trial && data.trial_ends_at) {
      const trialEndDate = new Date(data.trial_ends_at);
      const now = new Date();
      
      if (trialEndDate < now) {
        console.log('[keyAuthService] Trial has expired');
        await clearPersistedSession();
        return null;
      }
    }

    // Update local session with latest data
    const updatedUser: AuthenticatedUser = {
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      accessKey: data.access_key,
      isActive: data.is_active,
      isTrial: data.is_trial,
      trialEndsAt: data.trial_ends_at,
      lastLoginAt: data.last_login_at,
    };

    await persistSession(updatedUser);
    return updatedUser;
  } catch (error: any) {
    // If offline, throw error to allow cached session usage
    if (error.message === 'OFFLINE') {
      throw error;
    }
    console.error('[keyAuthService] Error checking user status:', error);
    return null;
  }
}
