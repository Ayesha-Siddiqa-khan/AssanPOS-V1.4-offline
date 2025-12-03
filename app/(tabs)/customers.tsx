import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePos } from '../../contexts/PosContext';

import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { fuzzySearch } from '../../lib/searchUtils';
import { formatDateForDisplay } from '../../lib/date';

const formatCurrency = (value: number | null | undefined) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 'Rs. 0';
  }
  return `Rs. ${amount.toLocaleString()}`;
};

type CustomerItem = ReturnType<typeof useData>['customers'][number];

export default function CustomersScreen() {
  const { customers, deleteCustomer } = useData();
  const { t } = useLanguage();
  const router = useRouter();
  const { setSelectedCustomerId } = usePos();
  const [searchQuery, setSearchQuery] = useState('');

  const summary = useMemo(() => {
    const totalCustomers = customers.length;
    const customersWithDues = customers.filter(
      (customer) => Number(customer.dueAmount) > 0
    );
    const customersWithCredit = customers.filter(
      (customer) => Number(customer.credit) > 0
    );
    const totalDue = customers.reduce(
      (sum, customer) => sum + (Number(customer.dueAmount) || 0),
      0
    );
    const totalCredit = customers.reduce(
      (sum, customer) => sum + (Number(customer.credit) || 0),
      0
    );

    return {
      totalCustomers,
      totalDue,
      totalCredit,
      customersWithDues: customersWithDues.length,
      customersWithCredit: customersWithCredit.length,
    };
  }, [customers]);

  const filteredCustomers: CustomerItem[] = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return customers;
    }

    return fuzzySearch(customers, query, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'phone', weight: 1.5 },
        { name: 'email', weight: 1 },
      ],
      threshold: 0.3,
      adaptiveScoring: true,
    });
  }, [customers, searchQuery]);

  const openCustomer = (customerId?: number, mode?: 'edit') => {
    const params: Record<string, string> = {};
    if (customerId) {
      params.customerId = String(customerId);
    }
    if (mode) {
      params.mode = mode;
    }
    router.push({ pathname: '/modals/customer-account', params });
  };

  const confirmDelete = (customerId: number) => {
    Alert.alert(
      t('Delete customer?'),
      t('This will remove the customer and related balances.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomer(customerId);
            } catch (error) {
              console.error('Failed to delete customer', error);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{t('Customers')}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionPrimary]}
            activeOpacity={0.85}
            onPress={() => router.push('/modals/customer-account')}
          >
            <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
            <Text style={[styles.actionText, styles.actionTextPrimary]}>
              {t('New customer')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.85}
            onPress={() => router.push('/credit-ledger')}
          >
            <Ionicons name="wallet-outline" size={18} color="#2563eb" />
            <Text style={styles.actionText}>{t('Credit ledger')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('Search by name, phone, or email')}
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('Customers')}</Text>
            <Text style={styles.statValue}>{String(summary.totalCustomers)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('With dues')}</Text>
            <Text style={styles.statValue}>{String(summary.customersWithDues)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>{t('Total due')}</Text>
            <Text style={[styles.statValue, styles.statValueWarning]}>
              {formatCurrency(summary.totalDue)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {t('Customer list')} · {String(filteredCustomers.length)}
        </Text>

        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={46} color="#cbd5f5" />
            <Text style={styles.emptyTitle}>{t('No customers yet')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('Add a customer to start tracking credit and purchases.')}
            </Text>
          </View>
        ) : (
          filteredCustomers.map((customer) => (
            <TouchableOpacity
              key={customer.id}
              activeOpacity={0.85}
              style={styles.customerCard}
              onPress={() => openCustomer(customer.id)}
            >
              <View style={styles.customerHeader}>
                <View style={styles.avatarCircle}>
                  {customer.imageUri ? (
                    <Image source={{ uri: customer.imageUri }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={22} color="#2563eb" />
                  )}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.customerName}>{customer.name}</Text>
                  {customer.phone ? (
                    <View style={styles.phoneRow}>
                      <Ionicons name="call-outline" size={14} color="#64748b" />
                      <Text style={styles.customerPhone} numberOfLines={1} ellipsizeMode="tail">
                        {customer.phone}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.headerRight}>
                  {Number(customer.credit) > 0 ? (
                    <View style={styles.creditBadge}>
                      <Ionicons name="shield-checkmark" size={14} color="#0f766e" />
                      <Text style={styles.creditBadgeText}>
                        {t('Credit')} {formatCurrency(customer.credit)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.iconAction}
                      onPress={() => openCustomer(customer.id, 'edit')}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="pencil-outline" size={18} color="#2563eb" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconAction, styles.deleteAction]}
                      onPress={() => confirmDelete(customer.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>{t('Total Purchases')}</Text>
                  <Text style={styles.detailValueLarge}>
                    {formatCurrency(customer.totalPurchases)}
                  </Text>
                  <Text style={styles.detailSub}>
                    {((customer as any).salesCount ?? 0) === 1
                      ? t('(1 sale)')
                      : `(${(customer as any).salesCount ?? 0} ${t('sales')})`}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>{t('Last Purchase')}</Text>
                  <Text style={styles.detailValueLarge}>
                    {customer.lastPurchase
                      ? formatDateForDisplay(customer.lastPurchase)
                      : '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={() => openCustomer(customer.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="eye-outline" size={18} color="#111827" />
                  <Text style={styles.viewButtonText}>{t('View')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saleButton}
                  onPress={() => {
                    setSelectedCustomerId(customer.id);
                    router.push('/modals/product-selection');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cart-outline" size={18} color="#ffffff" />
                  <Text style={styles.saleButtonText}>{t('Sale')}</Text>
                  <View style={styles.saleAddCircle}>
                    <Ionicons name="ellipsis-horizontal" size={14} color="#ffffff" />
                  </View>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
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
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#ffffff',
  },
  actionPrimary: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  actionText: {
    fontWeight: '600',
    color: '#2563eb',
  },
  actionTextPrimary: {
    color: '#ffffff',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  statValueWarning: {
    color: '#b91c1c',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginVertical: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  customerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  customerPhone: {
    fontSize: 14,
    color: '#374151',
    flexShrink: 1,
  },
  customerMeta: {
    fontSize: 13,
    color: '#6b7280',
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: 150,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAction: {
    borderColor: '#fee2e2',
    backgroundColor: '#fef2f2',
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ecfdf3',
  },
  creditBadgeText: {
    fontWeight: '700',
    fontSize: 13,
    color: '#0f766e',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    gap: 12,
  },
  detailItem: {
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  detailValueLarge: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  detailSub: {
    fontSize: 12,
    color: '#6b7280',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  viewButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  saleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#2563eb',
  },
  saleButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  saleAddCircle: {
    marginLeft: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
  },
});





