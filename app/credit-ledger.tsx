import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';
import { fuzzySearch } from '../lib/searchUtils';

const formatCurrency = (value: number) => `Rs. ${value.toLocaleString()}`;

export default function CreditLedgerScreen() {
  const router = useRouter();
  const { customers, getCustomerCreditTransactions } = useData();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const customersWithCredit = useMemo(
    () => customers.filter((customer) => (customer.credit ?? 0) > 0),
    [customers]
  );

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return customersWithCredit;
    }

    return fuzzySearch(customersWithCredit, query, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'phone', weight: 1.5 },
        { name: 'email', weight: 1 },
      ],
      threshold: 0.3,
      adaptiveScoring: true,
    });
  }, [customersWithCredit, searchQuery]);

  const totalOutstanding = useMemo(
    () =>
      customersWithCredit.reduce(
        (sum, customer) => sum + (customer.credit ?? 0),
        0
      ),
    [customersWithCredit]
  );

  const renderTransactionCount = (customerId: number) => {
    const transactions = getCustomerCreditTransactions(customerId);
    const count = transactions.length;
    if (count === 0) {
      return t('No transactions yet');
    }
    return count === 1
      ? t('1 transaction')
      : `${count} ${t('transactions')}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('Credit Ledger')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('Search customers...')}
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
        </View>

        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>
              {t('Total Credit Outstanding')}
            </Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totalOutstanding)}
            </Text>
          </View>
          <View style={styles.summaryIcon}>
            <Ionicons name="wallet-outline" size={26} color="#2563eb" />
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('Customers with Credit')}</Text>

        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={42} color="#d1d5db" />
            <Text style={styles.emptyTitle}>{t('No credit customers')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('Customers with credit balances will appear here.')}
            </Text>
          </View>
        ) : (
          filteredCustomers.map((customer) => (
            <View key={customer.id} style={styles.customerCard}>
              <View style={styles.customerInfo}>
                <View>
                  <Text style={styles.customerName}>{customer.name}</Text>
                  {customer.phone ? (
                    <Text style={styles.customerPhone}>{customer.phone}</Text>
                  ) : null}
                  <Text style={styles.customerMeta}>
                    {renderTransactionCount(customer.id)}
                  </Text>
                </View>
              </View>
              <View style={styles.creditColumn}>
                <Text style={styles.creditAmount}>
                  {formatCurrency(customer.credit)}
                </Text>
                <View style={styles.statusPill}>
                  <Ionicons
                    name="shield-checkmark"
                    size={14}
                    color="#047857"
                  />
                  <Text style={styles.statusLabel}>{t('Active')}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    height: 46,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  summaryCard: {
    marginTop: 16,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#e0f2fe',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e3a8a',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptyState: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  customerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 18,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 1,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  customerPhone: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
  },
  customerMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#94a3b8',
  },
  creditColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  creditAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#047857',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#dcfce7',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
  },
});
