import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';

import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useShop } from '../contexts/ShopContext';
import { db } from '../lib/database';
import { shareTextViaWhatsApp } from '../lib/share';
import { enqueueReceiptPrint } from '../services/printQueueService';
import { mapPurchaseToReceiptData } from '../services/receiptMapper';
import {
  createReceiptPdf,
  generateReceiptHtml,
  openPrintPreview,
  shareReceipt,
  type ReceiptPayload,
  type StoreProfile,
} from '../services/receiptService';
import { formatTimeForDisplay, formatDateForDisplay } from '../lib/date';
import type { NetworkPrinterConfig } from '../types/printer';

const formatCurrency = (value: number | null | undefined) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `Rs. ${safeAmount.toLocaleString()}`;
};

export default function VendorPurchaseHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendorId?: string }>();
  const vendorId = params.vendorId ? Number(params.vendorId) : null;
  const { purchases, getVendorPurchases, vendors } = useData();
  const { t } = useLanguage();
  const { profile: shopProfile } = useShop();

  const safeVendors = Array.isArray(vendors) ? vendors : [];
  const safePurchases = Array.isArray(purchases) ? purchases : [];

  const vendor = vendorId ? safeVendors.find((item) => item.id === vendorId) : null;
  const history = useMemo(() => {
    const source = vendorId ? getVendorPurchases(vendorId) : safePurchases;
    return Array.isArray(source) ? source : [];
  }, [vendorId, safePurchases, getVendorPurchases]);
  const historyList = Array.isArray(history) ? history : [];

  const totalSpent = useMemo(() => {
    if (!Array.isArray(history)) return 0;
    return history.reduce((sum, purchase) => sum + (Number(purchase.total) || 0), 0);
  }, [history]);

  const totalPaid = useMemo(() => {
    if (!Array.isArray(history)) return 0;
    return history.reduce((sum, purchase) => sum + (Number(purchase.paidAmount) || 0), 0);
  }, [history]);

  const outstanding = useMemo(() => {
    if (!Array.isArray(history)) return 0;
    return history.reduce(
      (sum, purchase) => sum + (Number(purchase.remainingBalance) || 0),
      0
    );
  }, [history]);

  const overpaidCredit = useMemo(() => {
    if (!Array.isArray(history)) return 0;
    return history.reduce((sum, purchase) => {
      const paid = Number(purchase.paidAmount) || 0;
      const total = Number(purchase.total) || 0;
      const credit = Math.max(paid - total, 0);
      return sum + credit;
    }, 0);
  }, [history]);

  const summaryShareLines = useMemo(
    () => [
      vendor ? `${t('Vendor')}: ${vendor.name}` : t('All Vendors'),
      `${t('Total Purchases')}: ${historyList.length}`,
      `${t('Total spent')}: ${formatCurrency(totalSpent)}`,
      `${t('Total paid')}: ${formatCurrency(totalPaid)}`,
      `${t('Credit / Overpaid')}: ${formatCurrency(overpaidCredit)}`,
      `${t('Outstanding')}: ${formatCurrency(outstanding)}`,
    ],
    [vendor, historyList.length, totalSpent, totalPaid, overpaidCredit, outstanding, t]
  );

  const handleShareSummaryWhatsApp = async () => {
    try {
      const shared = await shareTextViaWhatsApp(summaryShareLines.join('\n'));
      if (!shared) {
        // fallback toast if needed
      }
    } catch (error) {
      console.error('Failed to share vendor summary', error);
    }
  };

  const handleShareSummaryPdf = async () => {
    try {
      const html = buildSummaryHtml();
      const pdf = await createReceiptPdf(html);
      await shareReceipt(pdf.uri);
    } catch (error) {
      console.error('Failed to share vendor summary PDF', error);
    }
  };

  const handlePrintSummary = async () => {
    try {
      const html = buildSummaryHtml();
      await openPrintPreview(html);
    } catch (error) {
      console.error('Failed to print vendor summary', error);
    }
  };

  const buildSummaryHtml = () => {
    const safeHistory = historyList.slice();

      const historyRows = safeHistory
        .map((purchase) => {
          const date = purchase.date ?? '';
          const time = formatTimeForDisplay(purchase.time);
          const method = purchase.paymentMethod ?? '';
          const itemsSummary = Array.isArray(purchase.items)
            ? purchase.items
                .slice(0, 4)
                .map((item: any) => {
                  const qty = item.quantity ?? 0;
                  const label = item.variantName ? `${item.name} - ${item.variantName}` : item.name;
                  return `${label} x${qty}`;
                })
                .join(', ') + (purchase.items.length > 4 ? ` +${purchase.items.length - 4}` : '')
            : '';
          return `
            <tr>
              <td>${date} ${time}</td>
              <td style="text-align:right;">${formatCurrency(purchase.total)}</td>
              <td style="text-align:right;">${formatCurrency(purchase.paidAmount)}</td>
              <td style="text-align:right;">${formatCurrency(purchase.remainingBalance)}</td>
              <td>${method}</td>
              <td>${itemsSummary}</td>
            </tr>
          `;
        })
        .join('');

      // Sort by date/time for ledger display
      const sortedLedger = safeHistory.slice().sort((a, b) => {
        const aKey = `${a.date ?? ''} ${a.time ?? ''}`;
        const bKey = `${b.date ?? ''} ${b.time ?? ''}`;
        return aKey.localeCompare(bKey);
      });

      let runningBalance = 0;
      const ledgerRows = sortedLedger
        .map((purchase) => {
          const description =
            purchase.invoiceNumber ||
            purchase.items?.[0]?.name ||
            `${t('Purchase')} #${purchase.id}`;
          const debit = Number(purchase.total) || 0;
          const credit = Number(purchase.paidAmount) || 0;
          runningBalance += debit - credit;
          const date = purchase.date ?? '';
          const ref = purchase.id ?? '';
          const type = purchase.paymentMethod ?? t('Purchase');
          return `
            <tr>
              <td>${date}</td>
              <td>${type}</td>
              <td>${ref}</td>
              <td>${description}</td>
              <td style="text-align:right;">${formatCurrency(debit)}</td>
              <td style="text-align:right;">${formatCurrency(credit)}</td>
              <td style="text-align:right;">${formatCurrency(runningBalance)}</td>
            </tr>
          `;
        })
        .join('');

      const ledgerTotals = sortedLedger.reduce(
        (acc, purchase) => {
          acc.debit += Number(purchase.total) || 0;
          acc.credit += Number(purchase.paidAmount) || 0;
          return acc;
        },
        { debit: 0, credit: 0 }
      );

      return `
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; color: #111; }
              h2 { margin: 0 0 12px 0; }
              .row { display: flex; justify-content: space-between; margin: 6px 0; }
              .label { color: #555; }
              .value { font-weight: 700; }
              table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
              th, td { border: 1px solid #e5e7eb; padding: 6px; text-align: left; }
              th { background: #f8fafc; }
            </style>
          </head>
          <body>
            <h2>${vendor ? vendor.name : t('Vendor Summary')}</h2>
            ${summaryShareLines
              .map((line) => {
                const [label, ...rest] = line.split(': ');
                return `<div class="row"><div class="label">${label}</div><div class="value">${rest.join(': ')}</div></div>`;
              })
              .join('')}
            ${
              historyRows
                ? `<table>
                    <thead>
                      <tr>
                        <th>${t('Date')}</th>
                        <th style="text-align:right;">${t('Total')}</th>
                        <th style="text-align:right;">${t('Paid')}</th>
                        <th style="text-align:right;">${t('Balance')}</th>
                        <th>${t('Method')}</th>
                        <th>${t('Items')}</th>
                      </tr>
                    </thead>
                    <tbody>${historyRows}</tbody>
                  </table>`
                : ''
            }
            ${
              ledgerRows
                ? `<table>
                    <thead>
                      <tr>
                        <th>${t('Date')}</th>
                        <th>${t('Type')}</th>
                        <th>${t('Invoice No.')}</th>
                        <th>${t('Description')}</th>
                        <th style="text-align:right;">${t('Debit')}</th>
                        <th style="text-align:right;">${t('Credit')}</th>
                        <th style="text-align:right;">${t('Balance')}</th>
                      </tr>
                    </thead>
                    <tbody>${ledgerRows}</tbody>
                    <tfoot>
                      <tr>
                        <td colspan="4" style="text-align:right; font-weight:700;">${t('Totals')}</td>
                        <td style="text-align:right; font-weight:700;">${formatCurrency(ledgerTotals.debit)}</td>
                        <td style="text-align:right; font-weight:700;">${formatCurrency(ledgerTotals.credit)}</td>
                        <td style="text-align:right; font-weight:700;">${formatCurrency(ledgerTotals.debit - ledgerTotals.credit)}</td>
                      </tr>
                    </tfoot>
                  </table>`
                : ''
            }
          </body>
        </html>
      `;
  };

  const buildReceiptPayload = (purchase: any): { receipt: ReceiptPayload; store: StoreProfile } => {
    const paidAmount = Number(purchase.paidAmount ?? 0);
    const totalAmount = Number(purchase.total ?? 0);
    const changeAmount = Math.max(paidAmount - totalAmount, 0);
      const createdTime = formatTimeForDisplay(purchase.time);

    const storeName =
      shopProfile?.shopName?.trim() && shopProfile.shopName.trim().length > 0
        ? shopProfile.shopName.trim()
        : t('Your Store');

    const receipt: ReceiptPayload = {
      id: purchase.id,
      customerName: purchase.vendor?.name ?? t('Vendor'),
      subtotal: Number(purchase.subtotal ?? 0),
      tax: Number(purchase.tax ?? 0),
      total: totalAmount,
      paymentMethod: purchase.paymentMethod ?? t('N/A'),
      createdAt: `${purchase.date} ${createdTime}`,
      lineItems: Array.isArray(purchase.items)
        ? purchase.items.map((item: any) => ({
            name: item.variantName ? `${item.name} - ${item.variantName}` : item.name,
            quantity: item.quantity ?? 0,
            price: item.costPrice ?? item.price ?? 0,
          }))
        : [],
      changeAmount,
      amountPaid: paidAmount,
      remainingBalance: Number(purchase.remainingBalance ?? 0),
    };

    const store: StoreProfile = {
      name: storeName,
      thankYouMessage: t('Thank you for your business!'),
    };
    return { receipt, store };
  };

  const handleSharePurchaseWhatsApp = async (purchase: any) => {
    try {
      const lines: string[] = [];
      lines.push(`${t('Purchase')} #${purchase.id}`);
      lines.push(`${purchase.date} - ${formatTimeForDisplay(purchase.time)}`);
      lines.push(`${t('Total')}: ${formatCurrency(purchase.total)}`);
      lines.push(`${t('Paid')}: ${formatCurrency(purchase.paidAmount)}`);
      lines.push(`${t('Balance')}: ${formatCurrency(purchase.remainingBalance)}`);
      lines.push(`${t('Payment Method')}: ${purchase.paymentMethod ?? t('N/A')}`);
      if (Array.isArray(purchase.items) && purchase.items.length) {
        lines.push('');
        lines.push(`${t('Items')}:`);
        purchase.items.slice(0, 5).forEach((item: any, idx: number) => {
          lines.push(
            `${idx + 1}. ${item.name}${item.variantName ? ` - ${item.variantName}` : ''} x${
              item.quantity ?? 0
            } @ Rs. ${(item.costPrice ?? item.price ?? 0).toLocaleString()}`
          );
        });
        if (purchase.items.length > 5) {
          lines.push(`+ ${purchase.items.length - 5} ${t('more items')}`);
        }
      }
      const shared = await shareTextViaWhatsApp(lines.join('\n'));
      if (!shared) {
        // fall back toast
      }
    } catch (error) {
      console.error('Failed to share purchase', error);
    }
  };

  const handleSharePurchasePdf = async (purchase: any) => {
    try {
      const { receipt, store } = buildReceiptPayload(purchase);
      const html = await generateReceiptHtml(receipt, store);
      const pdf = await createReceiptPdf(html);
      await shareReceipt(pdf.uri);
    } catch (error) {
      console.error('Failed to share purchase PDF', error);
    }
  };

  const printPurchaseToNetworkPrinter = async (purchase: any, printer: NetworkPrinterConfig) => {
    try {
      const receiptData = mapPurchaseToReceiptData(purchase, {
        storeName,
        address: shopProfile?.address,
        phone: shopProfile?.phoneNumber,
        footer: t('Thank you for your business!'),
      });

      await enqueueReceiptPrint(printer, receiptData);
      Toast.show({
        type: 'success',
        text1: t('Receipt queued'),
        text2: `${printer.name} (${printer.ip})`,
      });
    } catch (error: any) {
      console.error('Network print error:', error);
      Alert.alert(t('Error'), error.message || t('Failed to print'));
    }
  };

  const handlePrintPurchase = async (purchase: any) => {
    const networkPrinters = (await db.listPrinterProfiles()).filter(
      (printer) => printer.type === 'ESC_POS'
    );
    
    const buttons: any[] = [
      {
        text: t('Cancel'),
        style: 'cancel',
      },
      {
        text: t('System Print'),
        onPress: async () => {
          try {
            const { receipt, store } = buildReceiptPayload(purchase);
            const html = await generateReceiptHtml(receipt, store);
            await openPrintPreview(html);
          } catch (error) {
            console.error('Failed to print purchase', error);
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
                ...networkPrinters.map((printer) => ({
                  text: `${printer.name} (${printer.ip})`,
                  onPress: () => printPurchaseToNetworkPrinter(purchase, printer),
                })),
                { text: t('Cancel'), style: 'cancel' },
              ]
            );
          } else {
            printPurchaseToNetworkPrinter(purchase, networkPrinters[0]);
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
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {vendor ? vendor.name : t('Vendor Purchase History')}
          </Text>
          <Text style={styles.headerSubtitle}>
            {vendor ? t('Purchase history for this vendor') : t('All vendor purchases')}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryLabel}>{t('Overview')}</Text>
            <View style={styles.summaryActions}>
              <TouchableOpacity
                style={styles.summaryAction}
                onPress={handleShareSummaryWhatsApp}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#16a34a" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.summaryAction}
                onPress={handleShareSummaryPdf}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={18} color="#1f2937" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.summaryAction}
                onPress={handlePrintSummary}
                activeOpacity={0.8}
              >
                <Ionicons name="print-outline" size={18} color="#1f2937" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Total Purchases')}</Text>
            <Text style={styles.summaryValue}>{history.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Total spent')}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalSpent)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Total paid')}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalPaid)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Credit / Overpaid')}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(overpaidCredit)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Outstanding')}</Text>
            <Text style={[styles.summaryValue, outstanding > 0 && styles.summaryWarning]}>
              {formatCurrency(outstanding)}
            </Text>
          </View>
        </View>

        {historyList.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={46} color="#cbd5f5" />
            <Text style={styles.emptyTitle}>{t('No purchases yet')}</Text>
            <Text style={styles.emptySubtitle}>
              {vendor
                ? t('This vendor has no recorded purchases yet.')
                : t('Create a purchase to view its history here.')}
            </Text>
          </View>
        ) : (
          historyList.map((purchase) => (
            <View key={purchase.id} style={styles.purchaseCard}>
              <View style={styles.purchaseHeader}>
                {/* Vendor Image (if available) */}
                {purchase.vendor?.imageUri ? (
                  <View style={{ marginRight: 10 }}>
                    <Image
                      source={{ uri: purchase.vendor.imageUri }}
                      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#e5e7eb' }}
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#e5e7eb', marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person-circle-outline" size={36} color="#9ca3af" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.purchaseDate}>
                    {purchase.date} - {formatTimeForDisplay(purchase.time)}
                  </Text>
                  {purchase.invoiceNumber ? (
                    <Text style={styles.purchaseMeta}>
                      {t('Invoice')} #{purchase.invoiceNumber}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.purchaseAmounts}>
                  <Text style={styles.purchaseTotal}>{formatCurrency(purchase.total)}</Text>
                  <Text style={styles.purchaseMeta}>{purchase.paymentMethod}</Text>
                </View>
              </View>

              {purchase.vendor && !vendor && (
                <View style={styles.vendorInfoRow}>
                  <Ionicons name="person-outline" size={14} color="#64748b" />
                  <Text style={styles.vendorInfoText}>{purchase.vendor.name}</Text>
                </View>
              )}

              <View style={styles.purchaseDetailsRow}>
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>{t('Paid')}</Text>
                  <Text style={styles.detailValue}>{formatCurrency(purchase.paidAmount)}</Text>
                </View>
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>{t('Balance')}</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      purchase.remainingBalance > 0 && styles.summaryWarning,
                    ]}
                  >
                    {formatCurrency(purchase.remainingBalance)}
                  </Text>
                </View>
              </View>

              {Array.isArray(purchase.items) && purchase.items.length ? (
                <View style={styles.itemsList}>
                  {purchase.items.slice(0, 3).map((item, index) => (
                    <Text key={`${purchase.id}-item-${index}`} style={styles.itemText}>
                      - {item.name}
                      {item.variantName ? ` - ${item.variantName}` : ''} - {item.quantity}
                    </Text>
                  ))}
                  {purchase.items.length > 3 ? (
                    <Text style={styles.moreItems}>
                      +{purchase.items.length - 3} {t('more items')}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {purchase.note ? <Text style={styles.noteText}>{purchase.note}</Text> : null}

              <View style={styles.purchaseActions}>
                <TouchableOpacity
                  style={styles.purchaseAction}
                  onPress={() => handleSharePurchaseWhatsApp(purchase)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#16a34a" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.purchaseAction}
                  onPress={() => handleSharePurchasePdf(purchase)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document-text-outline" size={18} color="#1f2937" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.purchaseAction}
                  onPress={() => handlePrintPurchase(purchase)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="print-outline" size={18} color="#1f2937" />
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
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
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
    backgroundColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  summaryWarning: {
    color: '#dc2626',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryAction: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyState: {
    marginTop: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  purchaseCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 18,
    gap: 12,
  },
  purchaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  purchaseDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  purchaseMeta: {
    fontSize: 12,
    color: '#94a3b8',
  },
  purchaseAmounts: {
    alignItems: 'flex-end',
    gap: 4,
  },
  purchaseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'flex-end',
  },
  purchaseAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  purchaseTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
  },
  vendorInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  vendorInfoText: {
    fontSize: 13,
    color: '#4b5563',
  },
  purchaseDetailsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  detailBlock: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  detailValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  itemsList: {
    gap: 4,
  },
  itemText: {
    fontSize: 12,
    color: '#475569',
  },
  moreItems: {
    fontSize: 12,
    color: '#2563eb',
  },
  noteText: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
  },
});




