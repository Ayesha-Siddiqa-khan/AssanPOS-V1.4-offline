import React, { useMemo } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';

import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDateForDisplay } from '../lib/date';

const formatCurrency = (value: number) => `Rs. ${value.toLocaleString()}`;

export default function PendingPaymentsScreen() {
  const router = useRouter();
  const { sales, updateSale } = useData();
  const { t } = useLanguage();

  const pendingSales = useMemo(
    () =>
      sales.filter(
        (sale) =>
          sale.status === 'Due' ||
          sale.status === 'Partially Paid' ||
          (sale.remainingBalance ?? 0) > 0
      ),
    [sales]
  );

  const totalDue = useMemo(
    () =>
      pendingSales.reduce(
        (sum, sale) => sum + (sale.remainingBalance ?? 0),
        0
      ),
    [pendingSales]
  );

  const uniqueCustomers = useMemo(() => {
    const ids = new Set<number>();
    pendingSales.forEach((sale) => {
      if (sale.customer?.id) {
        ids.add(sale.customer.id);
      }
    });
    return ids.size;
  }, [pendingSales]);

  const handleMarkPaid = async (saleId: number) => {
    try {
      await updateSale(saleId, { status: 'Paid', remainingBalance: 0 });
      Toast.show({ type: 'success', text1: t('Marked as paid') });
    } catch (error) {
      console.error('Failed to mark sale as paid', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    }
  };

  const handleCall = (phone?: string) => {
    if (!phone) {
      Toast.show({ type: 'info', text1: t('Phone number unavailable') });
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() =>
      Toast.show({ type: 'error', text1: t('Unable to place call') })
    );
  };

  const handleWhatsApp = (phone?: string) => {
    if (!phone) {
      Toast.show({ type: 'info', text1: t('Phone number unavailable') });
      return;
    }
    const sanitized = phone.replace(/\D/g, '');
    const url = `https://wa.me/${sanitized}`;
    Linking.openURL(url).catch(() =>
      Toast.show({ type: 'error', text1: t('Unable to open WhatsApp') })
    );
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
        <Text style={styles.headerTitle}>{t('Pending Payments')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.dueCard]}>
            <Text style={styles.statLabel}>{t('Total Due')}</Text>
            <Text style={styles.statValue}>{formatCurrency(totalDue)}</Text>
          </View>
          <View style={[styles.statCard, styles.customerCard]}>
            <Text style={styles.statLabel}>{t('Customers')}</Text>
            <Text style={styles.statValue}>{uniqueCustomers}</Text>
          </View>
        </View>

        {pendingSales.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyTitle}>{t('All payments are clear')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('Outstanding invoices will appear here.')}
            </Text>
          </View>
        ) : (
          pendingSales.map((sale) => {
            const dueAmount = sale.remainingBalance ?? 0;
            const saleIdLabel = sale.id ? `#${sale.id}` : t('N/A');
            return (
              <View key={sale.id} style={styles.saleCard}>
                <View style={styles.saleHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerName}>
                      {sale.customer?.name || t('Walk-in Customer')}
                    </Text>
                    {sale.customer?.phone ? (
                      <View style={styles.phoneRow}>
                        <Ionicons name="call-outline" size={14} color="#64748b" />
                        <Text style={styles.phoneText}>{sale.customer.phone}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.amountColumn}>
                    <Text style={styles.amountLabel}>{t('Due Amount')}</Text>
                    <Text style={styles.amountValue}>
                      {formatCurrency(dueAmount)}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>{t('Sale Date')}</Text>
                    <Text style={styles.metaValue}>
                      {formatDateForDisplay(sale.date)}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>{t('Due Date')}</Text>
                    <Text
                      style={[
                        styles.metaValue,
                        sale.dueDate ? styles.dueDateValue : null,
                      ]}
                    >
                      {sale.dueDate
                        ? formatDateForDisplay(sale.dueDate)
                        : t('Not set')}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>{t('Sale ID')}</Text>
                    <Text style={styles.metaValue}>{saleIdLabel}</Text>
                  </View>
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={() => handleCall(sale.customer?.phone)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="call-outline" size={16} color="#111827" />
                    <Text style={styles.secondaryLabel}>{t('Call')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={() => handleWhatsApp(sale.customer?.phone)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#22c55e" />
                    <Text style={styles.secondaryLabel}>{t('WhatsApp')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryAction}
                    onPress={() => handleMarkPaid(sale.id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                    <Text style={styles.primaryLabel}>{t('Mark Paid')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
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
    backgroundColor: '#eff3ff',
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dueCard: {
    backgroundColor: '#fef2f2',
    borderColor: '#fee2e2',
  },
  customerCard: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7c3aed',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statValue: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
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
  saleCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  phoneText: {
    fontSize: 13,
    color: '#64748b',
  },
  amountColumn: {
    alignItems: 'flex-end',
  },
  amountLabel: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  amountValue: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '700',
    color: '#dc2626',
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 12,
    color: '#94a3b8',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  metaValue: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  dueDateValue: {
    color: '#ea580c',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryAction: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  primaryAction: {
    flex: 1.2,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
