import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

import { useLanguage } from '../../contexts/LanguageContext';
import { useData } from '../../contexts/DataContext';
import { usePos } from '../../contexts/PosContext';
import { fuzzySearch } from '../../lib/searchUtils';
import { Button } from '../../components/ui/Button';

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

export default function CustomerLookupModal() {
  const router = useRouter();
  const { t } = useLanguage();
  const { customers } = useData();
  const { setSelectedCustomerId } = usePos();

  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const sanitizedPhone = useMemo(() => normalizePhone(phoneNumber), [phoneNumber]);

  const handleSearch = () => {
    const nameQuery = customerName.trim();
    const phoneQuery = sanitizedPhone;

    if (!nameQuery && !phoneQuery) {
      Toast.show({ type: 'info', text1: t('Enter a name or phone number to search') });
      return;
    }

    // Use fuzzy search for better matching
    let matches: any[] = [];
    
    if (nameQuery) {
      matches = fuzzySearch(customers, nameQuery, {
        keys: [
          { name: 'name', weight: 2 },
          { name: 'phone', weight: 1 },
        ],
        threshold: 0.4,
        adaptiveScoring: true,
      });
    }

    // If phone search, find exact phone match
    if (phoneQuery.length > 0) {
      const phoneMatch = customers.find((customer) => 
        normalizePhone(customer.phone) === phoneQuery
      );
      if (phoneMatch) {
        matches = [phoneMatch];
      }
    }

    if (matches.length > 0) {
      const match = matches[0];
      setSelectedCustomerId(match.id);
      Toast.show({
        type: 'success',
        text1: t('Customer selected'),
        text2: `${match.name} (${match.phone})`,
      });
      router.replace('/modals/product-selection');
      return;
    }

    Toast.show({
      type: 'info',
      text1: t('No customer found'),
      text2: t('Check the details or add a new customer from the Customers tab.'),
    });
  };

  const handleContinueWithoutCustomer = () => {
    setSelectedCustomerId(null);
    router.replace('/modals/product-selection');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.title}>{t('Customer Lookup')}</Text>
          <Text style={styles.subtitle}>
            {t('Search an existing customer or continue without selecting one.')}
          </Text>

          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>{t('Customer Name')}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color="#9ca3af" />
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder={t('Enter customer name')}
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
            </View>
          </View>

          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>{t('Phone Number')}</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={18} color="#9ca3af" />
              <TextInput
                style={styles.input}
                value={sanitizedPhone}
                onChangeText={(value) => setPhoneNumber(normalizePhone(value).slice(0, 11))}
                placeholder={t('Enter 11-digit phone number')}
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                returnKeyType="search"
                maxLength={11}
                onSubmitEditing={handleSearch}
              />
            </View>
          </View>

          <Button style={styles.searchButton} onPress={handleSearch}>
            <View style={styles.searchContent}>
              <Ionicons name="search" size={18} color="#ffffff" style={styles.searchIcon} />
              <Text style={styles.searchLabel}>{t('Search Customer')}</Text>
            </View>
          </Button>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinueWithoutCustomer}
            activeOpacity={0.7}
          >
            <Text style={styles.continueText}>{t('Continue without Customer')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  container: {
    margin: 20,
    padding: 24,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  inputBlock: {
    marginTop: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#111827',
  },
  searchButton: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
  },
  searchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  continueButton: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
});
