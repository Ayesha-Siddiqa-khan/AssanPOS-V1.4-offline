import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDateForDisplay, formatDateTimeForDisplay } from '../lib/date';
import { Select } from '../components/ui/Select';

const formatCurrency = (value: number | null | undefined) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 'Rs. 0';
  }
  return `Rs. ${amount.toLocaleString()}`;
};

type ExpenditureItem = ReturnType<typeof useData>['expenditures'][number];
type DateFilter = 'all' | 'last7' | 'month' | 'today';

export default function ExpendituresScreen() {
  const router = useRouter();
  const { expenditures, deleteExpenditure } = useData();
  const { t } = useLanguage();
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const sortedExpenditures = useMemo(() => {
    return [...expenditures].sort((a, b) => {
      const dateA = `${a.date} ${a.time || ''}`.trim();
      const dateB = `${b.date} ${b.time || ''}`.trim();
      return dateB.localeCompare(dateA);
    });
  }, [expenditures]);

  const stats = useMemo(() => {
    const total = expenditures.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const uniqueCategories = new Set(expenditures.map((item) => item.category));
    const todayStr = formatDateForDisplay(new Date());
    const todayTotal = expenditures
      .filter((item) => formatDateForDisplay(item.date) === todayStr)
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return {
      totalAmount: total,
      count: expenditures.length,
      categories: uniqueCategories.size,
      todayTotal,
    };
  }, [expenditures]);

  const filteredExpenditures: ExpenditureItem[] = useMemo(() => {
    const now = new Date();
    const withinDate = (item: ExpenditureItem) => {
      const itemDate = new Date(item.date);
      if (Number.isNaN(itemDate.getTime())) return true;
      switch (dateFilter) {
        case 'today': {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          return (
            itemDate >= today &&
            itemDate < new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
          );
        }
        case 'last7': {
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(now.getDate() - 7);
          return itemDate >= sevenDaysAgo && itemDate <= now;
        }
        case 'month': {
          return (
            itemDate.getFullYear() === now.getFullYear() &&
            itemDate.getMonth() === now.getMonth()
          );
        }
        default:
          return true;
      }
    };

    return sortedExpenditures.filter((item) => {
      const matchesDate = withinDate(item);
      const matchesCategory =
        categoryFilter === 'all' || item.category.toLowerCase() === categoryFilter.toLowerCase();
      return matchesDate && matchesCategory;
    });
  }, [sortedExpenditures, dateFilter, categoryFilter]);

  const filteredTotals = useMemo(() => {
    const total = filteredExpenditures.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0
    );
    return {
      total,
      count: filteredExpenditures.length,
    };
  }, [filteredExpenditures]);

  const periodLabel = useMemo(() => {
    switch (dateFilter) {
      case 'today':
        return t('Today');
      case 'last7':
        return t('Last 7 days');
      case 'month':
        return t('This month');
      default:
        return t('All time');
    }
  }, [dateFilter, t]);

  const categoryOptions = useMemo(() => {
    const unique = Array.from(new Set(expenditures.map((e) => e.category))).filter(Boolean);
    return [{ label: t('All Categories'), value: 'all' }].concat(
      unique.map((cat) => ({ label: cat, value: cat }))
    );
  }, [expenditures, t]);

  const confirmDelete = (id: number) => {
    Alert.alert(
      t('Delete entry?'),
      t('This will remove the expenditure record permanently.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpenditure(id);
            } catch (error) {
              console.error('Failed to delete expenditure', error);
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
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('Expenditure')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{t("Today's Expenditure")}</Text>
          <Text style={styles.heroValue}>{formatCurrency(stats.todayTotal)}</Text>
        </View>

        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.9}
          onPress={() => router.push('/modals/expenditure')}
        >
          <Ionicons name="add" size={20} color="#ffffff" />
          <Text style={styles.primaryButtonText}>{t('Add New Expenditure')}</Text>
        </TouchableOpacity>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeading}>{t('Filter by date')}</Text>
          <View style={styles.chipRow}>
            {[
              { key: 'all', label: t('All Time') },
              { key: 'last7', label: t('Last 7 Days') },
              { key: 'month', label: t('This Month') },
              { key: 'today', label: t('Today') },
            ].map((chip) => (
              <TouchableOpacity
                key={chip.key}
                style={[
                  styles.chip,
                  dateFilter === chip.key && styles.chipActive,
                ]}
                onPress={() => setDateFilter(chip.key as DateFilter)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    dateFilter === chip.key && styles.chipLabelActive,
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <View style={styles.filterHeadingRow}>
            <Ionicons name="filter-outline" size={16} color="#b91c1c" />
            <Text style={styles.sectionHeading}>{t('Filter by Category')}</Text>
          </View>
          <Select
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value)}
            options={categoryOptions}
            placeholder={t('All Categories')}
          />
          <Text style={styles.helperText}>
            {categoryFilter === 'all'
              ? t('Showing expenses from all categories.')
              : t('Filtered to category: {cat}').replace('{cat}', categoryFilter)}
          </Text>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionHeading}>{t('Summary')}</Text>
          <View style={styles.summaryCard}>
            <View>
              <Text style={styles.summaryLabel}>{t('Total (Filtered)')}</Text>
              <Text style={styles.summaryValue}>{formatCurrency(filteredTotals.total)}</Text>
              <Text style={styles.summaryMeta}>{periodLabel}</Text>
            </View>
            <View style={styles.summaryBadge}>
              <Text style={styles.summaryBadgeText}>
                {filteredTotals.count} {t('entries')}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionHeading}>{t('Your Expenditures')}</Text>

        {filteredExpenditures.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cash-outline" size={44} color="#9ca3af" />
            <Text style={styles.emptyTitle}>{t('No expenditures yet')}</Text>
            <Text style={styles.emptySubtitle}>
              {dateFilter === 'all'
                ? t('Add a new record to start tracking your spending.')
                : t('No expenditures found for this filter.')}
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.9}
              onPress={() => router.push('/modals/expenditure')}
            >
              <Ionicons name="add" size={20} color="#ffffff" />
              <Text style={styles.primaryButtonText}>{t('Add Expenditure')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredExpenditures.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.category}</Text>
                  <Text style={styles.cardMeta}>{formatDateTimeForDisplay(item.date, item.time)}</Text>
                  {item.description ? (
                    <Text style={styles.cardMeta}>{item.description}</Text>
                  ) : null}
                </View>
                <Text style={[styles.amount, styles.warningText]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => router.push({ pathname: '/modals/expenditure', params: { id: String(item.id) } })}
                >
                  <Ionicons name="create-outline" size={16} color="#2563eb" />
                  <Text style={styles.linkText}>{t('Edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => confirmDelete(item.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                  <Text style={[styles.linkText, styles.warningText]}>{t('Delete')}</Text>
                </TouchableOpacity>
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
    backgroundColor: '#ffffff',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#b91c1c',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecdd3',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  heroLabel: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  heroValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: '800',
    color: '#b91c1c',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#b91c1c',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionBlock: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  filterHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#b91c1c',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#b91c1c',
    borderColor: '#b91c1c',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b91c1c',
  },
  chipLabelActive: {
    color: '#ffffff',
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b7280',
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecdd3',
    padding: 14,
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b91c1c',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#b91c1c',
    marginTop: 6,
  },
  summaryMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  summaryBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  warningText: {
    color: '#b91c1c',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: '#6b7280',
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 16,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    color: '#2563eb',
    fontWeight: '600',
  },
});
