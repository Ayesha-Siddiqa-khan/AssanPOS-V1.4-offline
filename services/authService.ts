import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { db } from '../lib/database';

const SESSION_TOKEN_KEY = 'pos.session.token';
const SESSION_USER_KEY = 'pos.session.user';
const BIOMETRIC_PREFERENCE_KEY = 'pos.session.biometric.enabled';
const BIOMETRIC_USER_KEY = 'pos.session.biometric.userId';

// This module provides PIN hashing and biometric helpers for local auth.

type ActiveSession = {
  token: string;
  userId: number;
  expiresAt: string;
};

export type AuthenticatedUser = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  roleId: number;
  permissions: Record<string, boolean>;
  biometricEnabled: boolean;
};

// DEPRECATED: Authentication is handled by keyAuthService for offline mode.
export async function initializeAuthLayer() {
  // Local authentication is initialized through keyAuthService.
  console.log('[authService] initializeAuthLayer is no-op for offline mode');
}

export async function hashPin(pin: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

type DbUser = Awaited<ReturnType<typeof db.getUserById>>;

// DEPRECATED: Use keyAuthService.authenticateWithAccessKey() instead
export async function authenticateWithPin(pin: string): Promise<AuthenticatedUser | null> {
  console.warn('[authService] authenticateWithPin is deprecated - use keyAuthService.authenticateWithAccessKey()');
  return null;
}

export async function getPersistedSession(): Promise<AuthenticatedUser | null> {
  const [token, userJson] = await Promise.all([
    SecureStore.getItemAsync(SESSION_TOKEN_KEY),
    SecureStore.getItemAsync(SESSION_USER_KEY),
  ]);

  if (!token || !userJson) {
    return null;
  }

  const session = await db.getActiveSession(token);
  if (!session) {
    await clearPersistedSession();
    return null;
  }

  const stored = JSON.parse(userJson) as AuthenticatedUser;
  return stored;
}

export async function clearPersistedSession() {
  const token = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  if (token) {
    await db.deleteSession(token);
  }

  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_TOKEN_KEY),
    SecureStore.deleteItemAsync(SESSION_USER_KEY),
  ]);
}

export async function enableBiometrics(userId: string | number) {
  const normalizedId = String(userId);
  await Promise.all([
    SecureStore.setItemAsync(BIOMETRIC_PREFERENCE_KEY, '1', secureStoreOptions()),
    SecureStore.setItemAsync(BIOMETRIC_USER_KEY, normalizedId, secureStoreOptions()),
  ]);
}

export async function disableBiometrics(_userId: string | number) {
  await Promise.all([
    SecureStore.deleteItemAsync(BIOMETRIC_PREFERENCE_KEY),
    SecureStore.deleteItemAsync(BIOMETRIC_USER_KEY),
  ]);
}

export async function getBiometricUserId(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(BIOMETRIC_USER_KEY);
  if (!value) {
    return null;
  }
  // Return the value as string (local user id)
  return value;
}

export async function isBiometricAvailable() {
  const hardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hardware && enrolled;
}

export async function promptBiometric(): Promise<boolean> {
  const available = await isBiometricAvailable();
  if (!available) {
    return false;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Authenticate to unlock POS',
    cancelLabel: 'Use PIN',
  });

  return result.success;
}

export async function shouldAutoPromptBiometric(): Promise<boolean> {
  const [flag, biometricUserId] = await Promise.all([
    SecureStore.getItemAsync(BIOMETRIC_PREFERENCE_KEY),
    SecureStore.getItemAsync(BIOMETRIC_USER_KEY),
  ]);
  return flag === '1' && Boolean(biometricUserId);
}

export async function recreateSessionForUser(userId: string): Promise<any | null> {
  // Delegate to keyAuthService to recreate a local session
  const { recreateSessionForUser: recreateLocalSession } = require('./keyAuthService');
  return await recreateLocalSession(userId);
}

async function createSession(userId: number): Promise<ActiveSession> {
  const token = Crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 12).toISOString(); // 12 hours

  await db.recordSession({
    userId,
    token,
    createdAt: now.toISOString(),
    expiresAt,
  });

  return { token, userId, expiresAt };
}

async function persistSession(session: ActiveSession) {
  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, session.token, secureStoreOptions());
  const user = await db.getUserById(session.userId);
  if (user) {
    const payload = await buildAuthenticatedPayload(user);
    await SecureStore.setItemAsync(SESSION_USER_KEY, JSON.stringify(payload), secureStoreOptions());
  }
}

async function buildAuthenticatedPayload(
  user: NonNullable<DbUser>
): Promise<AuthenticatedUser> {
  const role = (await db.getRoles()).find((r) => r.id === user.roleId);
  const permissions = role?.permissions ?? {};
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    roleId: user.roleId,
    permissions,
    biometricEnabled: user.biometricEnabled,
  };
}

function secureStoreOptions(): SecureStore.SecureStoreOptions {
  return Platform.select({
    ios: {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
    android: {
      showConfirmationPrompt: false,
    },
    default: {},
  }) as SecureStore.SecureStoreOptions;
}
