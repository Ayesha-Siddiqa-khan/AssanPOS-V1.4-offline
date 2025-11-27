import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { db } from '../lib/database';

export type ShopProfile = {
  shopName: string;
  ownerName: string;
  phoneNumber: string;
};

type ShopContextValue = {
  profile: ShopProfile;
  isReady: boolean;
  saveProfile: (profile: ShopProfile) => Promise<void>;
};

const DEFAULT_PROFILE: ShopProfile = {
  shopName: '',
  ownerName: '',
  phoneNumber: '',
};

const ShopContext = createContext<ShopContextValue | undefined>(undefined);

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<ShopProfile>(DEFAULT_PROFILE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const stored = (await db.getSetting('shop.profile')) as Partial<ShopProfile> | null;
        if (stored && isMounted) {
          setProfile({
            shopName: stored.shopName ?? '',
            ownerName: stored.ownerName ?? '',
            phoneNumber: stored.phoneNumber ?? '',
          });
        }
      } catch (error) {
        console.warn('Failed to load shop profile', error);
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const saveProfile = useCallback(async (nextProfile: ShopProfile) => {
    try {
      await db.setSetting('shop.profile', nextProfile);
      setProfile(nextProfile);
    } catch (error) {
      console.warn('Failed to save shop profile', error);
      throw error;
    }
  }, []);

  return (
    <ShopContext.Provider value={{ profile, isReady, saveProfile }}>
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = () => {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
};
