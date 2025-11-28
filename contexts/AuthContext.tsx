import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  AuthenticatedUser,
  authenticateWithAccessKey,
  clearPersistedSession,
  getPersistedSession,
  checkUserStatus,
  logout as logoutService,
  persistSession,
} from '../services/keyAuthService';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  loginWithAccessKey: (accessKey: string) => Promise<AuthenticatedUser | null>;
  loginWithBiometric: (user: AuthenticatedUser) => void;
  logout: () => Promise<void>;
  updateUserName: (nextName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SUPPORT_PHONE = '+923066987888';
const DEVELOPER_CONTACT = 'Muhammad Abubakar Siddique (+92306687889)';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasShownTrialToastRef = React.useRef(false);

  // Reset trial toast flag when user changes
  useEffect(() => {
    hasShownTrialToastRef.current = false;
  }, [user?.id]);

  // Check user status when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && user) {
        try {
          console.log('[AuthContext] App became active - checking user status');
          const updatedUser = await checkUserStatus();
          
          if (!updatedUser) {
            // User has been deactivated
            setUser(null);
            Alert.alert(
              'Account Deactivated',
              `Your account has been deactivated. Please contact support at ${SUPPORT_PHONE} for assistance.`,
              [{ text: 'OK' }]
            );
          } else {
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
          // User has been deactivated
          setUser(null);
          Alert.alert(
            'Account Deactivated',
            `Your account has been deactivated. Please contact support at ${SUPPORT_PHONE} for assistance.`,
            [{ text: 'OK' }]
          );
        } else {
          setUser(updatedUser);
        }
      } catch (error) {
        // Silently fail if offline - user can continue working
        console.log('[AuthContext] Status check failed (likely offline) - continuing with cached session');
      }
    }, 24 * 60 * 60 * 1000); // Check every 24 hours

    return () => clearInterval(interval);
  }, [user]);

  // Show trial expiration toast
  useEffect(() => {
    if (!user?.isTrial) {
      return;
    }
    if (!user.trialEndsAt) {
      return;
    }
    const trialEnd = new Date(user.trialEndsAt);
    const now = new Date();
    if (trialEnd < now && !hasShownTrialToastRef.current) {
      Toast.show({
        type: 'error',
        text1: 'Trial expired',
        text2: `Please contact ${DEVELOPER_CONTACT}`,
        visibilityTime: 6000,
      });
      hasShownTrialToastRef.current = true;
    }
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
              Alert.alert(
                'Account Deactivated',
                `Your account has been deactivated. Please contact support at ${SUPPORT_PHONE} for assistance.`,
                [{ text: 'OK' }]
              );
              setUser(null);
            } else {
              setUser(updatedUser);
            }
          } catch (error: any) {
            if (error?.message === 'OFFLINE') {
              console.log('[AuthContext] Offline during bootstrap, using cached session');
            } else {
              console.error('[AuthContext] Failed to validate session', error);
            }
          }
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
      setUser((prev) => {
        if (!prev) {
          return prev;
        }
        const updated = { ...prev, name: nextName.trim() || prev.name };
        persistSession(updated).catch((error) =>
          console.warn('Failed to persist updated user name', error)
        );
        return updated;
      });
    },
    []
  );

  const logout = useCallback(async () => {
    await logoutService();
    setUser(null);
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
