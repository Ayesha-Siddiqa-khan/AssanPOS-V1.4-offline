import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  AuthenticatedUser,
  authenticateWithAccessKey,
  getPersistedSession,
  ensureOfflineSession,
  checkUserStatus,
  logout as logoutService,
  persistSession,
} from '../services/keyAuthService';
import { db } from '../lib/database';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  loginWithAccessKey: (accessKey: string) => Promise<AuthenticatedUser | null>;
  loginWithBiometric: (user: AuthenticatedUser) => void;
  logout: () => Promise<void>;
  updateUserName: (nextName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACCOUNT_DISABLED_MESSAGE = 'This account is disabled. Contact the store owner for access.';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Check user status when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && user) {
        try {
          console.log('[AuthContext] App became active - checking user status');
          const updatedUser = await checkUserStatus();
          
          if (!updatedUser) {
            const fallbackUser = await ensureOfflineSession();
            setUser(fallbackUser);
          } else if (JSON.stringify(updatedUser) !== JSON.stringify(user)) {
            // Only update if user data actually changed
            setUser(updatedUser);
          }
        } catch (error) {
          // Silently fail if offline - user can continue working
          console.log('[AuthContext] Status check failed (likely offline) - continuing with cached session');
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [user]);

  // Periodic check while app is active
  // This ensures account deactivation is detected quickly when online
  useEffect(() => {
    if (!user) return;

  const interval = setInterval(async () => {
      try {
        console.log('[AuthContext] Periodic user status check');
        const updatedUser = await checkUserStatus();
        
        if (!updatedUser) {
          const fallbackUser = await ensureOfflineSession();
          setUser(fallbackUser);
        } else if (JSON.stringify(updatedUser) !== JSON.stringify(user)) {
          // Only update if user data actually changed
          setUser(updatedUser);
        }
      } catch (error) {
        // Silently fail if offline - user can continue working
        console.log('[AuthContext] Status check failed (likely offline) - continuing with cached session');
      }
    }, 24 * 60 * 60 * 1000); // Check every 24 hours

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const sessionUser = await getPersistedSession();

        if (sessionUser) {
          setUser(sessionUser);
          try {
            const updatedUser = await checkUserStatus();
            if (!updatedUser) {
              const fallbackUser = await ensureOfflineSession();
              setUser(fallbackUser);
            } else if (JSON.stringify(updatedUser) !== JSON.stringify(sessionUser)) {
              // Only update if user data actually changed from cached session
              setUser(updatedUser);
            }
          } catch (error: any) {
            if (error?.message === 'OFFLINE') {
              console.log('[AuthContext] Offline during bootstrap, using cached session');
            } else {
              console.error('[AuthContext] Failed to validate session', error);
            }
          }
        } else {
          const offlineUser = await ensureOfflineSession();
          setUser(offlineUser);
        }
      } catch (error) {
        console.error('Failed to initialize auth layer', error);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, []);

  const loginWithAccessKey = useCallback(async (accessKey: string) => {
    const authenticated = await authenticateWithAccessKey(accessKey);
    if (authenticated) {
      setUser(authenticated);
      return authenticated;
    }
    return null;
  }, []);

  const loginWithBiometric = useCallback((user: AuthenticatedUser) => {
    console.log('[AuthContext] Setting user from biometric login:', user.name);
    setUser(user);
  }, []);

  const updateUserName = useCallback(
    async (nextName: string) => {
      const trimmed = nextName.trim();
      setUser((prev) => {
        if (!prev) {
          return prev;
        }
        const updated = { ...prev, name: trimmed || prev.name };
        persistSession(updated).catch((error) =>
          console.warn('Failed to persist updated user name', error)
        );
        return updated;
      });
      if (user && trimmed) {
        db.updateUser(user.id, { name: trimmed }).catch((error) =>
          console.warn('Failed to update user name in database', error)
        );
      }
    },
    [user]
  );

  const logout = useCallback(async () => {
    await logoutService();
    const fallbackUser = await ensureOfflineSession();
    setUser(fallbackUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        loginWithAccessKey,
        loginWithBiometric,
        logout,
        updateUserName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
