import * as SecureStore from 'expo-secure-store';
import { db } from '../lib/database';
import { hashPin } from './authService';

const SESSION_USER_KEY = 'pos.session.user';

const DEFAULT_OFFLINE_USER_NAME = 'Owner';

export type AuthenticatedUser = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  roleId: number;
  permissions: Record<string, boolean>;
  biometricEnabled: boolean;
  isActive: boolean;
  lastLoginAt?: string | null;
};

type DbUser = Awaited<ReturnType<typeof db.getUserById>>;

let seedingPromise: Promise<void> | null = null;

async function ensureLocalAuthSeed(): Promise<void> {
  if (seedingPromise) {
    await seedingPromise;
    return;
  }

  seedingPromise = (async () => {
    await db.ensureDefaultRoles();
  })();

  try {
    await seedingPromise;
  } finally {
    seedingPromise = null;
  }
}

async function buildAuthenticatedUser(user: NonNullable<DbUser>): Promise<AuthenticatedUser> {
  const roles = await db.getRoles();
  const role = roles.find((entry) => entry.id === user.roleId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    roleId: user.roleId,
    permissions: role?.permissions ?? {},
    biometricEnabled: user.biometricEnabled,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

export async function authenticateWithAccessKey(accessKey: string): Promise<AuthenticatedUser | null> {
  await ensureLocalAuthSeed();

  if (!validateAccessKeyFormat(accessKey)) {
    return null;
  }

  const existingUsers = await db.listUsers();
  if (existingUsers.length === 0) {
    const roles = await db.getRoles();
    const managerRole = roles.find((role) => role.name === 'manager') ?? roles[0];
    const roleId = managerRole?.id ?? 1;
    const pinHash = await hashPin(accessKey);
    const newUserId = await db.createUser({
      name: DEFAULT_OFFLINE_USER_NAME,
      pinHash,
      roleId,
      biometricEnabled: false,
    });
    const created = await db.getUserById(newUserId);
    if (created) {
      await db.updateUser(created.id, { lastLoginAt: new Date().toISOString() });
      const authenticatedUser = await buildAuthenticatedUser(created);
      await persistSession(authenticatedUser);
      return authenticatedUser;
    }
  }

  const pinHash = await hashPin(accessKey);
  const user = await db.getUserByPinHash(pinHash);
  if (!user || !user.isActive) {
    return null;
  }

  await db.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
  const authenticatedUser = await buildAuthenticatedUser(user);
  await persistSession(authenticatedUser);
  return authenticatedUser;
}

export async function getPersistedSession(): Promise<AuthenticatedUser | null> {
  await ensureLocalAuthSeed();
  const userJson = await SecureStore.getItemAsync(SESSION_USER_KEY);
  if (!userJson) {
    return null;
  }
  return JSON.parse(userJson) as AuthenticatedUser;
}

export async function persistSession(user: AuthenticatedUser): Promise<void> {
  await SecureStore.setItemAsync(SESSION_USER_KEY, JSON.stringify(user));
}

export async function clearPersistedSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_USER_KEY);
}

export async function recreateSessionForUser(userId: string): Promise<AuthenticatedUser | null> {
  await ensureLocalAuthSeed();
  const parsedId = Number(userId);
  if (!Number.isFinite(parsedId)) {
    return null;
  }

  const user = await db.getUserById(parsedId);
  if (!user || !user.isActive) {
    return null;
  }

  const authenticatedUser = await buildAuthenticatedUser(user);
  await persistSession(authenticatedUser);
  return authenticatedUser;
}

export async function logout(): Promise<void> {
  await clearPersistedSession();
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getPersistedSession();
  return session !== null;
}

export function validateAccessKeyFormat(key: string): boolean {
  return /^\d{6}$/.test(key);
}

export async function checkUserStatus(): Promise<AuthenticatedUser | null> {
  await ensureLocalAuthSeed();

  const userJson = await SecureStore.getItemAsync(SESSION_USER_KEY);
  if (!userJson) {
    return null;
  }

  const sessionUser = JSON.parse(userJson) as AuthenticatedUser;
  const user = await db.getUserById(sessionUser.id);
  if (!user || !user.isActive) {
    await clearPersistedSession();
    return null;
  }

  const updatedUser = await buildAuthenticatedUser(user);
  await persistSession(updatedUser);
  return updatedUser;
}
