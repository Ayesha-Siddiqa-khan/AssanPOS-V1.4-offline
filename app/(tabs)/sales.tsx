import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePos } from '../../contexts/PosContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { formatDateForDisplay, formatTimeForDisplay } from '../../lib/date';
import { spacing, radii, textStyles } from '../../theme/tokens';

type StatusFilterKey = 'all' | 'paid' | 'due' | 'partial';
const formatCurrency = (value: number | null | undefined) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 'Rs. 0';
  }
  try {
    return `Rs. ${amount.toLocaleString()}`;
  } catch {
    return `Rs. ${amount}`;
  }
};

export default function SalesScreen() {
  const { sales: rawSales } = useData();
  const { t } = useLanguage();
  const router = useRouter();
  const { resetSale } = usePos();
  const sales = rawSales ?? [];

  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const listOpacity = useRef(new Animated.Value(1)).current;
  const listTranslate = useRef(new Animated.Value(0)).current;

  const statusCounts = useMemo<Record<StatusFilterKey, number>>(
    () =>
      sales.reduce(
        (acc, sale) => {
          acc.all += 1;
          if (sale.status === 'Paid') {
            acc.paid += 1;
          } else if (sale.status === 'Due') {
            acc.due += 1;
          } else if (sale.status === 'Partially Paid') {
            acc.partial += 1;
          }
          return acc;
        },
        { all: 0, paid: 0, due: 0, partial: 0 }
      ),
    [sales]
  );

  const filteredSales = useMemo(() => {
    if (statusFilter === 'all') {
      return sales;
    }
    if (statusFilter === 'paid') {
      return sales.filter((sale) => sale.status === 'Paid');
    }
    if (statusFilter === 'due') {
      return sales.filter((sale) => sale.status === 'Due');
    }
    return sales.filter((sale) => sale.status === 'Partially Paid');
  }, [sales, statusFilter]);

  const totalSales = filteredSales.reduce(
    (sum, sale) => sum + (Number(sale.total) || 0),
    0
  );

  const groupedSales = useMemo(
    () =>
      Object.entries(
        filteredSales.reduce<Record<string, typeof filteredSales>>((acc, sale) => {
          const groupLabel = formatDateForDisplay(sale.date);
          if (!acc[groupLabel]) {
            acc[groupLabel] = [];
          }
          acc[groupLabel].push(sale);
          return acc;
        }, {})
      ),
    [filteredSales]
  );

  useEffect(() => {
    listOpacity.setValue(0.85);
    listTranslate.setValue(10);
    Animated.parallel([
      Animated.timing(listOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(listTranslate, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [statusFilter, filteredSales.length, listOpacity, listTranslate]);

  const filterOptions = useMemo<Array<{ key: StatusFilterKey; label: string }>>(
    () => [
      { key: 'all', label: t('All') },
      { key: 'paid', label: t('Paid') },
      { key: 'due', label: t('Due') },
      { key: 'partial', label: t('Partial') },
    ],
    [t]
  );

  const getPaymentIcon = (method?: string): keyof typeof Ionicons.glyphMap => {
    if (!method) return 'card-outline';
    const lowered = method.toLowerCase();
    if (lowered.includes('cash')) return 'cash-outline';
    if (lowered.includes('card') || lowered.includes('credit')) return 'card-outline';
    return 'wallet-outline';
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>{t('Sales')}</Text>
          <Text style={styles.screenSubtitle}>{t('Sales History')}</Text>
        </View>
        <Button
          style={styles.newSaleButton}
          onPress={() => {
            try {
              console.log('[Sales] Starting new sale, resetting cart');
              resetSale();
              console.log('[Sales] Cart reset, navigating to product selection');
              setTimeout(() => {
                router.push('/modals/product-selection');
              }, 100);
            } catch (error) {
              console.error('[Sales] Error starting new sale:', error);
              Toast.show({ type: 'error', text1: t('Failed to start new sale') });
            }
          }}
        >
          <Ionicons name="add" size={18} color="#ffffff" style={{ marginRight: 8 }} />
          {t('New Sale')}
        </Button>
      </View>
      <View style={styles.filterContainer}>
        <View style={styles.filterHeader}>
          <Ionicons name="filter-outline" size={16} color="#111827" />
          <Text style={styles.filterLabel}>{t('Filter')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {filterOptions.map((option) => {
            const isActive = statusFilter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setStatusFilter(option.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive ? styles.filterChipTextActive : styles.filterChipTextInactive,
                  ]}
                >
                  {option.label}
                </Text>
                <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                  <Text
                    style={[
                      styles.filterCountText,
                      isActive && styles.filterCountTextActive,
                    ]}
                  >
                    {statusCounts[option.key]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      {/* Stats */}
      <View style={styles.statsRow}>
        <Card style={[styles.statCard, styles.statCardSales]}>
          <View style={styles.statTopRow}>
            <View style={styles.statIcon}>
              <Ionicons name="receipt-outline" size={20} color="#1d4ed8" />
            </View>
            <Text style={styles.statValue}>{filteredSales.length}</Text>
          </View>
          <Text style={styles.statLabel}>{t('Total Sales')}</Text>
        </Card>
        <Card style={[styles.statCard, styles.statCardRevenue]}>
          <View style={styles.statTopRow}>
            <View style={styles.statIcon}>
              <Ionicons name="cash-outline" size={20} color="#15803d" />
            </View>
            <Text style={styles.statValue}>{formatCurrency(totalSales)}</Text>
          </View>
          <Text style={styles.statLabel}>{t('Revenue')}</Text>
        </Card>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.animatedList,
            { opacity: listOpacity, transform: [{ translateY: listTranslate }] },
          ]}
        >
          {filteredSales.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={48} color="#9ca3af" />
              <Text style={styles.emptyText}>{t('No sales yet')}</Text>
            </Card>
          ) : (
            groupedSales.map(([groupLabel, groupSales]) => (
              <View key={groupLabel} style={styles.groupSection}>
                <Text style={styles.groupLabel}>{groupLabel}</Text>
                {groupSales.map((sale) => {
                  const remainingBalance = Number(sale.remainingBalance ?? 0) || 0;
                  const hasDue = remainingBalance > 0;
                  const statusVariant =
                    sale.status === 'Paid'
                      ? 'success'
                      : sale.status === 'Due'
                      ? 'danger'
                      : 'warning';
                  const paymentIcon = getPaymentIcon(sale.paymentMethod);
                  const statusStyle =
                    sale.status === 'Paid'
                      ? styles.statusBadgePaid
                      : sale.status === 'Due'
                      ? styles.statusBadgeDue
                      : styles.statusBadgePartial;

                  return (
                    <Pressable
                      key={sale.id}
                      accessibilityRole="button"
                      onPress={() => console.log('[Sales] Open sale detail', sale.id)}
                      style={({ pressed }) => [
                        styles.saleCardWrapper,
                        pressed && styles.saleCardPressed,
                      ]}
                    >
                      <Card style={styles.saleCard}>
                        <View style={styles.saleHeader}>
                          <View style={styles.saleHeaderTop}>
                            <Text style={styles.customerName}>
                              {sale.customer?.name || t('Walk-in Customer')}
                            </Text>
                            <View style={styles.statusRow}>
                              <Badge
                                variant={statusVariant}
                                style={[styles.statusBadge, statusStyle]}
                              >
                                {sale.status === 'Partially Paid' ? t('Partial') : sale.status}
                              </Badge>
                              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                            </View>
                          </View>
                          <Text style={styles.saleDate}>
                            {formatDateForDisplay(sale.date)}
                            {sale.time ? ` \u00b7 ${formatTimeForDisplay(sale.time)}` : ''}
                          </Text>
                        </View>

                        <View style={styles.saleDivider} />

                        <View style={styles.saleDetailsRow}>
                          <View style={styles.saleColumn}>
                            <Text style={styles.saleDetailLabel}>{t('Items')}</Text>
                            <Text style={styles.saleDetailValue}>{sale.items}</Text>
                          </View>
                          <View style={styles.saleColumn}>
                            <Text style={styles.saleDetailLabel}>{t('Total')}</Text>
                            <Text style={styles.saleTotalValue}>{formatCurrency(sale.total)}</Text>
                          </View>
                        </View>
                        <View style={styles.saleDetailsRow}>
                          <View style={styles.saleColumn}>
                            <Text style={styles.saleDetailLabel}>{t('Payment')}</Text>
                            <View style={styles.saleDetailValueRow}>
                              <Ionicons name={paymentIcon} size={14} color="#475569" />
                              <Text style={styles.saleDetailValue}>{sale.paymentMethod}</Text>
                            </View>
                          </View>
                          <View style={styles.saleColumn}>
                            <Text style={styles.saleDetailLabel}>{t('Due')}</Text>
                            <Text
                              style={[
                                styles.saleDueValue,
                                hasDue ? styles.saleDuePending : styles.saleDueClear,
                              ]}
                            >
                              {hasDue ? formatCurrency(remainingBalance) : '\u2014'}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
        </Animated.View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  screenTitle: {
    ...textStyles.screenTitle,
  },
  screenSubtitle: {
    marginTop: spacing.xs / 2,
    ...textStyles.sectionSubtitle,
  },
  newSaleButton: {
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.md,
  },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  filterChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#ffffff',
  },
  filterChipActive: {
    backgroundColor: '#2563eb',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextInactive: {
    color: '#2563eb',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  filterCountBadge: {
    minWidth: 20,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#e0ecff',
    alignItems: 'center',
  },
  filterCountBadgeActive: {
    backgroundColor: '#ffffff',
  },
  filterCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  filterCountTextActive: {
    color: '#2563eb',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  statCardSales: {
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  statCardRevenue: {
    backgroundColor: '#ecfdf3',
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#ffffff88',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    flexShrink: 1,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#f4f6f8',
  },
  contentContainer: {
    paddingTop: 8,
    paddingBottom: spacing.xl,
  },
  animatedList: {
    flex: 1,
  },
  groupSection: {
    marginBottom: spacing.lg + 2,
    paddingTop: spacing.sm,
  },
  groupLabel: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: '#e7eaee',
    color: '#374151',
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 12,
  },
  saleCardWrapper: {
    marginBottom: spacing.md,
  },
  saleCardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.96,
  },
  saleCard: {
    padding: spacing.lg - 2,
    borderRadius: radii.lg,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e4e4e4',
  },
  saleHeader: {
    gap: spacing.sm,
  },
  saleHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.xs,
  },
  statusBadgePaid: {
    backgroundColor: '#22c55e',
  },
  statusBadgeDue: {
    backgroundColor: '#f87171',
  },
  statusBadgePartial: {
    backgroundColor: '#f59e0b',
  },
  saleDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  saleDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: spacing.md,
  },
  saleDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  saleColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  saleDetailLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  saleDetailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  saleDetailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  saleTotalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },
  saleDueValue: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  saleDuePending: {
    color: '#b91c1c',
  },
  saleDueClear: {
    color: '#6b7280',
  },
  emptyCard: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: spacing.md,
  },
});
