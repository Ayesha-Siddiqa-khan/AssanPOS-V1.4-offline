import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useShop } from '../contexts/ShopContext';
import { Badge } from '../components/ui/Badge';
import { formatDateForDisplay, formatTimeForDisplay, formatDateForStorage } from '../lib/date';
import { shareTextViaWhatsApp } from '../lib/share';
import { createReceiptPdf, generateReceiptHtml, openPrintPreview, shareReceipt } from '../services/receiptService';
import { spacing, radii, textStyles } from '../theme/tokens';

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

// Cache today's key - recalculate only when date changes
let cachedTodayKey: string | null = null;
let cachedDate: string | null = null;

const getTodayKey = () => {
  const now = new Date();
  const dateStr = now.toDateString();
  if (cachedDate !== dateStr) {
    cachedDate = dateStr;
    cachedTodayKey = formatDateForStorage(now);
  }
  return cachedTodayKey!;
};

export default function HistoryScreen() {
  const { sales: rawSales, deleteSale } = useData();
  const { t } = useLanguage();
  const { profile: shopProfile } = useShop();
  const sales = rawSales ?? [];
  const todayKey = getTodayKey();
  
  const storeName = shopProfile?.shopName?.trim()?.length ? shopProfile.shopName.trim() : t('Your Store');

  const buildReceiptPayload = (sale: any) => ({
    id: sale.id,
    customerName: sale.customer?.name || t('Walk-in Customer'),
    subtotal: sale.subtotal ?? 0,
    tax: sale.tax ?? 0,
    total: sale.total ?? 0,
    paymentMethod: sale.paymentMethod ?? 'Cash',
    createdAt: `${sale.date} ${formatTimeForDisplay(sale.time)}`,
    creditUsed: sale.creditUsed ?? 0,
    amountAfterCredit: sale.amountAfterCredit ?? sale.total ?? 0,
    lineItems: (sale.cart || []).map((item: any) => ({
      name: item.variantName ? `${item.name} - ${item.variantName}` : item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    changeAmount: sale.changeAmount ?? 0,
    amountPaid: sale.paidAmount ?? 0,
    remainingBalance: sale.remainingBalance ?? 0,
  });

  const historicalSales = useMemo(() => {
    return [...sales]
      .filter((sale) => {
        if (!sale.date) return false;
        const saleDate = sale.date instanceof Date ? sale.date : new Date(sale.date);
        if (Number.isNaN(saleDate.getTime())) return false;
        const saleKey = formatDateForStorage(saleDate);
        return saleKey !== todayKey;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });
  }, [sales]);

  const getDateKey = (value: any) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : formatDateForStorage(date);
  };

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const toggleDateExpansion = (dateKey: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const groupedSales = useMemo(
    () =>
      Object.entries(
        historicalSales.reduce<Record<string, typeof historicalSales>>((acc, sale) => {
          const groupLabel = formatDateForDisplay(sale.date);
          if (!acc[groupLabel]) {
            acc[groupLabel] = [];
          }
          acc[groupLabel].push(sale);
          return acc;
        }, {})
      ),
    [historicalSales]
  );

  const handleClearAll = () => {
    Alert.alert(
      t('Clear All History'),
      t('Are you sure you want to delete all historical sales? This action cannot be undone.'),
      [
        {
          text: t('Cancel'),
          style: 'cancel',
        },
        {
          text: t('Delete All'),
          style: 'destructive',
          onPress: async () => {
            try {
              for (const sale of historicalSales) {
                await deleteSale(sale.id);
              }
              Alert.alert(t('Success'), t('All historical sales have been deleted'));
            } catch (error) {
              Alert.alert(t('Error'), t('Failed to delete sales'));
            }
          },
        },
      ]
    );
  };

  const handleShareSaleText = async (sale: any) => {
    const lines: string[] = [];
    lines.push(`${t('Sale')} #${sale.id}`);
    lines.push(`${formatDateForDisplay(sale.date)} ${sale.time ? formatTimeForDisplay(sale.time) : ''}`);
    lines.push(`${t('Total')}: ${formatCurrency(sale.total ?? 0)}`);
    lines.push(`${t('Items')}: ${sale.items ?? 0}`);
    lines.push(`${t('Payment Method')}: ${sale.paymentMethod ?? t('Cash')}`);
    if ((sale.remainingBalance ?? 0) > 0) {
      lines.push(`${t('Due')}: ${formatCurrency(sale.remainingBalance)}`);
    }
    const shared = await shareTextViaWhatsApp(lines.join('\n'));
    if (!shared) {
      // no-op; Expo Go or WhatsApp missing
    }
  };

  const handleShareSalePdf = async (sale: any) => {
    const payload = buildReceiptPayload(sale);
    const html = await generateReceiptHtml(payload, {
      name: storeName,
      thankYouMessage: t('Thank you for your business!'),
    });
    const pdf = await createReceiptPdf(html);
    await shareReceipt(pdf.uri);
  };

  const printToNetworkPrinter = async (sale: any, printer: any) => {
    try {
      Toast.show({
        type: 'info',
        text1: t('Printing...'),
        text2: `${printer.name} (${printer.ip})`,
      });

      const { printerService } = await import('../services/escPosPrinterService');
      
      const receiptData = {
        storeName: storeName,
        saleId: sale.id,
        date: formatDateForDisplay(sale.date),
        time: formatTimeForDisplay(sale.time),
        customerName: sale.customer?.name || t('Walk-in Customer'),
        items: (sale.cart || []).map((item: any) => ({
          name: item.variantName ? `${item.name} - ${item.variantName}` : item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price,
        })),
        subtotal: sale.subtotal || sale.total || 0,
        discount: sale.discount || 0,
        total: sale.total || 0,
        amountPaid: sale.paidAmount || 0,
        changeAmount: sale.changeAmount || 0,
        paymentMethod: sale.paymentMethod || 'Cash',
        remainingBalance: sale.remainingBalance || 0,
      };

      const result = await printerService.printReceipt(printer, receiptData);

      if (result.success) {
        Toast.show({
          type: 'success',
          text1: t('Print sent successfully'),
          text2: t('Check printer for receipt'),
        });
      } else {
        Alert.alert(
          t('Print Failed'),
          `${result.message}\n\n${t('Check printer connection and try again')}`,
          [{ text: t('OK') }]
        );
      }
    } catch (error: any) {
      console.error('Network print error:', error);
      Alert.alert(t('Error'), error.message || t('Failed to print'));
    }
  };

  const handlePrintSale = async (sale: any) => {
    const savedPrintersJson = await AsyncStorage.getItem('savedPrinters');
    const savedPrinters = savedPrintersJson ? JSON.parse(savedPrintersJson) : [];
    const networkPrinters = savedPrinters.filter((p: any) => p.type === 'network');
    
    const buttons: any[] = [
      {
        text: t('Cancel'),
        style: 'cancel',
      },
      {
        text: t('System Print'),
        onPress: async () => {
          try {
            const payload = buildReceiptPayload(sale);
            const html = await generateReceiptHtml(payload, {
              name: storeName,
              thankYouMessage: t('Thank you for your business!'),
            });
            await openPrintPreview(html);
          } catch (error) {
            console.error('Failed to print receipt', error);
            Alert.alert(t('Error'), t('Unable to print receipt'));
          }
        },
      },
      {
        text: t('Share PDF'),
        onPress: async () => {
          try {
            const payload = buildReceiptPayload(sale);
            const html = await generateReceiptHtml(payload, {
              name: storeName,
              thankYouMessage: t('Thank you for your business!'),
            });
            const pdf = await createReceiptPdf(html);
            await shareReceipt(pdf.uri);
          } catch (error) {
            console.error('Failed to create PDF', error);
            Alert.alert(t('Error'), t('Unable to create PDF'));
          }
        },
      },
    ];
    
    if (networkPrinters.length > 0) {
      buttons.splice(1, 0, {
        text: t('Network Printer'),
        onPress: async () => {
          if (networkPrinters.length > 1) {
            Alert.alert(
              t('Select Printer'),
              t('Choose a network printer'),
              [
                ...networkPrinters.map((printer: any) => ({
                  text: `${printer.name} (${printer.ip})`,
                  onPress: () => printToNetworkPrinter(sale, printer),
                })),
                { text: t('Cancel'), style: 'cancel' },
              ]
            );
          } else {
            printToNetworkPrinter(sale, networkPrinters[0]);
          }
        },
      });
    }
    
    Alert.alert(
      t('Print Receipt'),
      t('Choose printing method'),
      buttons
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.screenTitle}>{t('Sales History')}</Text>
          <Text style={styles.screenSubtitle}>{t('Previous days')}</Text>
        </View>
        {historicalSales.length > 0 && (
          <TouchableOpacity
            style={styles.clearAllButton}
            onPress={handleClearAll}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <Text style={styles.clearAllText}>{t('Clear All')}</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {groupedSales.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="time-outline" size={46} color="#9ca3af" />
            <Text style={styles.emptyText}>{t('No history yet')}</Text>
          </View>
        ) : (
          groupedSales.map(([groupLabel, groupSales]) => {
            const dateKey = getDateKey(groupSales[0]?.date);
            const isExpanded = expandedDates.has(dateKey);
            const dateTotal = groupSales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
            
            return (
            <View key={groupLabel} style={styles.groupSection}>
              <TouchableOpacity
                style={styles.groupHeader}
                onPress={() => toggleDateExpansion(dateKey)}
                activeOpacity={0.7}
              >
                <View style={styles.groupHeaderLeft}>
                  <Ionicons 
                    name={isExpanded ? "chevron-down" : "chevron-forward"} 
                    size={20} 
                    color="#6b7280" 
                  />
                  <Text style={styles.groupLabel}>{groupLabel}</Text>
                </View>
                <View style={styles.groupHeaderRight}>
                  <Text style={styles.groupCount}>
                    {String(groupSales.length)} {groupSales.length === 1 ? t('sale') : t('sales')}
                  </Text>
                  <Text style={styles.groupTotal}>
                    {formatCurrency(dateTotal)}
                  </Text>
                </View>
              </TouchableOpacity>
              {isExpanded && groupSales.map((sale) => {
                const remainingBalance = Number(sale.remainingBalance ?? 0) || 0;
                const creditUsed = Number(sale.creditUsed ?? 0) || 0;
                const paidAmount = Number(sale.paidAmount ?? 0) || 0;
                const statusVariant =
                  sale.status === 'Paid'
                    ? 'success'
                    : sale.status === 'Due'
                    ? 'danger'
                    : 'warning';
                const paymentLabel =
                  creditUsed > 0 && paidAmount <= 0 ? t('Customer Credit') : sale.paymentMethod;

                return (
                  <Pressable
                    key={sale.id}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.saleCard, pressed && styles.saleCardPressed]}
                  >
                    <View style={styles.saleHeaderTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customerName}>{sale.customer?.name || t('Walk-in Customer')}</Text>
                        <Text style={styles.saleDate}>
                          {formatDateForDisplay(sale.date)}
                          {sale.time ? ` \u00b7 ${formatTimeForDisplay(sale.time)}` : ''}
                        </Text>
                      </View>
                      <Badge variant={statusVariant}>{sale.status === 'Partially Paid' ? t('Partial') : t(sale.status)}</Badge>
                    </View>
                    <View style={styles.saleDetailsRow}>
                      <View style={styles.saleColumn}>
                        <Text style={styles.saleDetailLabel}>{t('Items')}</Text>
                        <Text style={styles.saleDetailValue}>{String(sale.items || 0)}</Text>
                      </View>
                      <View style={styles.saleColumn}>
                        <Text style={styles.saleDetailLabel}>{t('Total')}</Text>
                        <Text style={styles.saleTotalValue}>{formatCurrency(sale.total)}</Text>
                      </View>
                    </View>
                    <View style={styles.saleDetailsRow}>
                      <View style={styles.saleColumn}>
                        <Text style={styles.saleDetailLabel}>{t('Payment')}</Text>
                        <Text style={styles.saleDetailValue}>{paymentLabel}</Text>
                        {creditUsed > 0 ? (
                          <Text style={styles.saleCreditBadge}>
                            {t('Credit Used')}: {formatCurrency(creditUsed)}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.saleColumn}>
                        <Text style={styles.saleDetailLabel}>{t('Due')}</Text>
                        <Text
                          style={[
                            styles.saleDueValue,
                            remainingBalance > 0 ? styles.saleDuePending : styles.saleDueClear,
                          ]}
                        >
                          {remainingBalance > 0 ? formatCurrency(remainingBalance) : '\u2014'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.saleActions}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.actionNeutral]}
                        onPress={() => handleShareSaleText(sale)}
                        accessibilityLabel={t('Share')}
                      >
                        <Ionicons name="share-social-outline" size={18} color="#2563eb" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.actionNeutral]}
                        onPress={() => handlePrintSale(sale)}
                        accessibilityLabel={t('Print')}
                      >
                        <Ionicons name="print-outline" size={18} color="#2563eb" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.actionNeutral]}
                        onPress={() => handleShareSalePdf(sale)}
                        accessibilityLabel={t('PDF')}
                      >
                        <Ionicons name="document-text-outline" size={18} color="#2563eb" />
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                );
              })}
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
    backgroundColor: '#f9fafb',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: 2,
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#fef2f2',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  screenTitle: {
    ...textStyles.screenTitle,
  },
  screenSubtitle: {
    ...textStyles.sectionSubtitle,
  },
  contentContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  groupSection: {
    gap: spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#f3f4f6',
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  groupHeaderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  groupCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  groupTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  saleCard: {
    padding: spacing.lg - 2,
    borderRadius: radii.lg,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: '#e4e4e4',
    backgroundColor: '#ffffff',
    gap: spacing.md,
  },
  saleCardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.96,
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
  saleDate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  saleDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
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
  saleCreditBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
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
  saleActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    justifyContent: 'flex-end',
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  actionNeutral: {
    backgroundColor: '#eef2ff',
  },
  emptyCard: {
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
});
