import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage, Language } from '../../contexts/LanguageContext';
import { recreateSessionForUser } from '../../services/keyAuthService';
import { getBiometricUserId, isBiometricAvailable, promptBiometric, shouldAutoPromptBiometric } from '../../services/authService';
import { spacing, radii, textStyles } from '../../theme/tokens';

const AVAILABLE_LANGUAGES: Array<{ code: Language; label: string }> = [
  { code: 'english', label: 'English' },
  { code: 'urdu', label: 'اردو' },
];

export const KeyLoginScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { loginWithAccessKey, loginWithBiometric } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  const [accessKey, setAccessKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [rememberPin, setRememberPin] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasLoggedInBefore, setHasLoggedInBefore] = useState(false);

  const pinShake = useRef(new Animated.Value(0)).current;

  const triggerShake = useCallback(() => {
    pinShake.setValue(0);
    Animated.sequence([
      Animated.timing(pinShake, { toValue: -8, duration: 45, useNativeDriver: true }),
      Animated.timing(pinShake, { toValue: 8, duration: 45, useNativeDriver: true }),
      Animated.timing(pinShake, { toValue: -6, duration: 40, useNativeDriver: true }),
      Animated.timing(pinShake, { toValue: 6, duration: 40, useNativeDriver: true }),
      Animated.timing(pinShake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [pinShake]);

  const renderToggle = (label: string, value: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.togglePill, value && styles.togglePillActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.toggleCheck, value && styles.toggleCheckActive]}>
        {value && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
      <Text style={[styles.toggleLabel, value && styles.toggleLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const handleBiometricAuth = useCallback(async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      console.log('[KeyLoginScreen] Starting biometric authentication...');
      const success = await promptBiometric();
      console.log('[KeyLoginScreen] Biometric result:', success);

      if (success) {
        const userId = await getBiometricUserId();
        console.log('[KeyLoginScreen] Retrieved biometric user ID:', userId);
        console.log('[KeyLoginScreen] User ID type:', typeof userId);

        if (userId) {
          console.log('[KeyLoginScreen] User ID exists, recreating session...');
          const user = await recreateSessionForUser(userId);
          if (user) {
            console.log('[KeyLoginScreen] Biometric login successful');
            console.log('[KeyLoginScreen] Updating auth context with user:', user.name);
            loginWithBiometric(user);
            return;
          }
        }
        setError(t('Biometric authentication failed'));
      } else {
        setError(t('Biometric authentication cancelled or failed'));
      }
    } catch (err) {
      console.error('[KeyLoginScreen] Biometric auth error:', err);
      setError(t('Biometric not available. Please use your PIN.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [t, loginWithBiometric]);

  useEffect(() => {
    const checkBiometric = async () => {
      try {
        const hasLoggedIn = await SecureStore.getItemAsync('pos.biometric.hasLoggedIn');
        const available = await isBiometricAvailable();
        const shouldPrompt = await shouldAutoPromptBiometric();
        const userId = await getBiometricUserId();

        const loggedInBefore = hasLoggedIn === 'true' || !!userId;
        const canUseBiometric = available && loggedInBefore;

        setBiometricAvailable(canUseBiometric);
        setHasLoggedInBefore(loggedInBefore);

        if (canUseBiometric && shouldPrompt) {
          handleBiometricAuth();
        }
      } catch (err) {
        console.log('[KeyLoginScreen] Biometric check failed:', err);
        setBiometricAvailable(false);
      }
    };
    checkBiometric();
  }, [handleBiometricAuth]);

  useEffect(() => {
    // Ensure native keyboard stays hidden for the custom PIN keypad experience
    Keyboard.dismiss();
  }, []);

  const handleLogin = useCallback(async () => {
    if (!accessKey.trim()) {
      setError(t('Enter your secure PIN to continue'));
      triggerShake();
      return;
    }

    if (accessKey.length !== 6) {
      setError(t('PIN must be 6 digits'));
      triggerShake();
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const authenticated = await loginWithAccessKey(accessKey.trim());
      if (!authenticated) {
        setError(t('Invalid PIN. Try again.'));
        triggerShake();
        return;
      }

      if (!hasLoggedInBefore && authenticated) {
        const available = await isBiometricAvailable();
        if (available) {
          await SecureStore.setItemAsync('pos.biometric.hasLoggedIn', 'true');
          setBiometricAvailable(true);
          setHasLoggedInBefore(true);
        }
      }

      setAccessKey('');
    } catch (authError) {
      console.error('Failed to login', authError);
      setError(t('Something went wrong. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [accessKey, loginWithAccessKey, t, hasLoggedInBefore, triggerShake]);

  const handleKeyPress = useCallback(
    (key: string) => {
      Keyboard.dismiss();
      setError(null);
      if (key === 'backspace') {
        setAccessKey((prev) => prev.slice(0, -1));
        return;
      }
      if (key === 'clear') {
        setAccessKey('');
        return;
      }
      if (accessKey.length < 6) {
        setAccessKey((prev) => prev + key);
      }
    },
    [accessKey],
  );

  const renderKeyDisplay = () => {
    const dots = [];
    for (let i = 0; i < 6; i++) {
      const filled = i < accessKey.length;
      const active = i === accessKey.length && accessKey.length < 6;
      dots.push(
        <View
          key={i}
          style={[
            styles.pinDot,
            active && styles.pinDotActive,
            error && styles.pinDotError,
          ]}
        >
          {showKey && filled ? (
            <Text style={styles.pinDigit}>{accessKey[i]}</Text>
          ) : (
            <View style={[styles.dot, filled && styles.dotFilled]} />
          )}
        </View>,
      );
    }
    return (
      <Animated.View
        style={[
          styles.pinDotsContainer,
          error && styles.pinErrorRow,
          { transform: [{ translateX: pinShake }] },
        ]}
      >
        {dots}
      </Animated.View>
    );
  };

  const keypadKeys: string[][] = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['clear', '0', 'backspace'],
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 32 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroContent}>
            <View style={styles.heroIcon}>
              <Ionicons name="shield-checkmark" size={36} color="#2563eb" />
            </View>
            <View>
              <Text style={styles.heroTitle}>AsaanPOS</Text>
              <Text style={styles.heroSubtitle}>Secure access to your register</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Unlock register</Text>
          <Text style={styles.cardSubtitle}>Enter your secure PIN to continue</Text>
          </View>

          {renderKeyDisplay()}

          <View style={styles.toggleRow}>
            {renderToggle('Show PIN', showKey, () => setShowKey(!showKey))}
            {renderToggle('Remember PIN', rememberPin, () => setRememberPin(!rememberPin))}
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color="#dc2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.unlockButton,
              (isSubmitting || accessKey.length !== 6) && styles.unlockButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={isSubmitting || accessKey.length !== 6}
            activeOpacity={0.85}
          >
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.unlockButtonText}>Unlock</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.biometricUnlockButton,
              !hasLoggedInBefore && styles.biometricUnlockButtonDisabled,
            ]}
            onPress={hasLoggedInBefore ? handleBiometricAuth : undefined}
            disabled={isSubmitting || !hasLoggedInBefore}
            activeOpacity={hasLoggedInBefore ? 0.7 : 1}
          >
            <Ionicons
              name="finger-print"
              size={22}
              color={hasLoggedInBefore ? '#2563eb' : '#cbd5e1'}
            />
            <Text
              style={[
                styles.biometricUnlockText,
                !hasLoggedInBefore && styles.biometricUnlockTextDisabled,
              ]}
            >
              {hasLoggedInBefore ? 'Use Face ID / Touch ID' : 'Set up a PIN to enable fingerprint login'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.languageContainer}>
          <Text style={styles.languageLabel}>
            <Ionicons name="language-outline" size={16} color="#64748b" /> Preferred language
          </Text>
          <View style={styles.languageButtons}>
            {AVAILABLE_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.languageButton, language === lang.code && styles.languageButtonActive]}
                onPress={() => setLanguage(lang.code)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.languageButtonText,
                    language === lang.code && styles.languageButtonTextActive,
                  ]}
                >
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.keypadDivider} />

        <View style={styles.numPad}>
          {keypadKeys.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.numPadRow}>
              {row.map((key, idx) => {
                const keyId = `${rowIndex}-${idx}-${key}`;
                if (key === 'backspace') {
                  return (
                    <TouchableOpacity
                      key={keyId}
                      style={styles.numPadButton}
                      onPress={() => handleKeyPress(key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="backspace-outline" size={26} color="#0f172a" />
                    </TouchableOpacity>
                  );
                }
                if (key === 'clear') {
                  return (
                    <TouchableOpacity
                      key={keyId}
                      style={styles.numPadButton}
                      onPress={() => handleKeyPress(key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={22} color="#2563eb" />
                      <Text style={styles.numPadSubtext}>Clear</Text>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={keyId}
                    style={styles.numPadButton}
                    onPress={() => handleKeyPress(key)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.numPadText}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  hero: {
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.xl,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#e5e7ff',
  },
  heroContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: '#e0e9ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  heroTitle: {
    ...textStyles.screenTitle,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    ...textStyles.helper,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: spacing.lg,
  },
  cardHeader: {
    paddingBottom: spacing.lg,
  },
  cardTitle: {
    ...textStyles.sectionTitle,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: spacing.xs,
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pinErrorRow: {
    marginBottom: spacing.sm,
  },
  pinDot: {
    width: 44,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1.2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  pinDotActive: {
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    transform: [{ scale: 1.02 }],
  },
  pinDotError: {
    borderColor: '#f87171',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#cbd5e1',
  },
  dotFilled: {
    backgroundColor: '#0f172a',
  },
  pinDigit: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  togglePill: {
    minWidth: '44%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#d7dce5',
    backgroundColor: '#fff',
    gap: spacing.sm,
  },
  togglePillActive: {
    borderColor: '#2563eb',
    backgroundColor: '#f3f7ff',
  },
  toggleCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  toggleCheckActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  toggleLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  toggleLabelActive: {
    color: '#1d4ed8',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    marginLeft: spacing.xs,
    flex: 1,
  },
  unlockButton: {
    borderRadius: radii.md,
    overflow: 'hidden',
    marginTop: spacing.sm,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  unlockButtonDisabled: {
    opacity: 0.7,
  },
  unlockButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  biometricUnlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: '#f8fafc',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  biometricUnlockButtonDisabled: {
    backgroundColor: '#f8fafc',
  },
  biometricUnlockText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  biometricUnlockTextDisabled: {
    color: '#94a3b8',
  },
  languageContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.lg,
    marginTop: spacing.lg,
  },
  languageLabel: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  languageButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  languageButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  languageButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  languageButtonText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  languageButtonTextActive: {
    color: '#fff',
  },
  keypadDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: spacing.lg,
  },
  numPad: {
    width: '100%',
    maxWidth: 340,
    rowGap: spacing.lg,
    alignItems: 'center',
  },
  numPadRow: {
    flexDirection: 'row',
    columnGap: spacing.md,
    justifyContent: 'center',
  },
  numPadButton: {
    width: 86,
    height: 72,
    borderRadius: radii.lg,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#eef2f7',
    gap: spacing.xs,
  },
  numPadText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  numPadSubtext: {
    fontSize: 11,
    color: '#2563eb',
    fontWeight: '600',
  },
});
