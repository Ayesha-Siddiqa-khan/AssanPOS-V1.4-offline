import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { translate, LanguageCode } from '../lib/translations';
import { db } from '../lib/database';

export type Language = LanguageCode;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (phrase: string, fallbackUrdu?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Language>('english');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const storedLanguage = await db.getSetting('language');
        if (storedLanguage && isMounted) {
          setLanguageState(storedLanguage as Language);
        }
      } catch (error) {
        console.warn('Failed to restore language preference', error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    db.setSetting('language', nextLanguage).catch((error) => {
      console.warn('Failed to persist language preference', error);
    });
  }, []);

  const t = (english: string, fallbackUrdu?: string) => {
    return translate(language, english, fallbackUrdu);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
