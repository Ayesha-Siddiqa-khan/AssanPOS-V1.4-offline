import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage, Language } from '../../contexts/LanguageContext';

const AVAILABLE_LANGUAGES: Array<{ code: Language; label: string }> = [
  { code: 'english', label: 'English' },
  { code: 'urdu', label: '\u0627\u0631\u062f\u0648' },
];

export const LoginScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { loginWithAccessKey } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  const [accessKey, setAccessKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  const activeLanguage = useMemo(() => language, [language]);

  const handleLogin = useCallback(async () => {
    if (!accessKey.trim()) {
      setError(t('Enter access key to continue'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const authenticated = await loginWithAccessKey(accessKey.trim());
      if (!authenticated) {
        setError(t('Invalid access key. Try again.'));
        return;
      }
      setAccessKey('');
    } catch (authError) {
      console.error('Failed to login', authError);
      setError(t('Something went wrong. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [accessKey, loginWithAccessKey, t]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 32 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.brandHeader}>
        <Ionicons name="hardware-chip" size={36} color="#2563eb" />
        <Text style={styles.brandTitle}>AsaanPOS</Text>
        <Text style={styles.brandSubtitle}>{t('Secure access for your sales team')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('Unlock Register')}</Text>
        <Text style={styles.sectionSubtitle}>{t('Enter your secure access key to continue')}</Text>

        <TextInput
          value={accessKey}
          onChangeText={(value) => {
            setError(null);
            setAccessKey(value.replace(/\D/g, '').slice(0, 6));
          }}
          placeholder="••••••"
          keyboardType="number-pad"
          secureTextEntry={!showPin}
          textContentType="oneTimeCode"
          style={styles.pinInput}
          editable={!isSubmitting}
          accessibilityLabel={t('PIN input')}
        />

        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setShowPin((prev) => !prev)}
          disabled={isSubmitting}
        >
          <View style={[styles.checkbox, showPin ? styles.checkboxActive : styles.checkboxInactive]}>
            {showPin ? <Ionicons name="checkmark" color="#ffffff" size={16} /> : null}
          </View>
          <Text style={styles.toggleLabel}>
            {showPin ? t('Hide access key') : t('Show access key')}
          </Text>
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button style={styles.loginButton} disabled={isSubmitting} onPress={handleLogin}>
          {isSubmitting ? <ActivityIndicator color="#ffffff" /> : t('Unlock')}
        </Button>
      </View>

      <View style={styles.languageSwitcher}>
        <Text style={styles.languageLabel}>{t('Preferred language')}</Text>
        <View style={styles.languagePills}>
          {AVAILABLE_LANGUAGES.map((entry) => (
            <TouchableOpacity
              key={entry.code}
              onPress={() => setLanguage(entry.code)}
              style={[
                styles.languagePill,
                activeLanguage === entry.code && styles.languagePillActive,
              ]}
            >
              <Text
                style={[
                  styles.languagePillText,
                  activeLanguage === entry.code && styles.languagePillTextActive,
                ]}
              >
                {entry.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    gap: 32,
  },
  brandHeader: {
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  brandSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    letterSpacing: 12,
    textAlign: 'center',
    color: '#111827',
  },
  loginButton: {
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleLabel: {
    fontSize: 13,
    color: '#374151',
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxInactive: {
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  checkboxActive: {
    backgroundColor: '#2563eb',
  },
  biometricLabel: {
    fontSize: 13,
    color: '#374151',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  biometricButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  languageSwitcher: {
    gap: 12,
  },
  languageLabel: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  languagePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  languagePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
  },
  languagePillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  languagePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  languagePillTextActive: {
    color: '#ffffff',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
  },
});

export default LoginScreen;
