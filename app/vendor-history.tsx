import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useShop } from '../contexts/ShopContext';
import { shareTextViaWhatsApp } from '../lib/share';
import {
  createReceiptPdf,
  generateReceiptHtml,
  shareReceipt,
  type ReceiptPayload,
  type StoreProfile,
} from '../services/receiptService';

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
  const history = useMemo(
    () => (vendorId ? getVendorPurchases(vendorId) : safePurchases),
    [vendorId, safePurchases, getVendorPurchases]
  );

  const totalSpent = useMemo(() => {
    if (!Array.isArray(history)) return 0;
    return history.reduce((sum, purchase) => sum + (Number(purchase.total) || 0), 0);
  }, [history]);

  const outstanding = useMemo(() => {
    if (!Array.isArray(history)) return 0;
    return history.reduce(
      (sum, purchase) => sum + (Number(purchase.remainingBalance) || 0),
      0
    );
  }, [history]);

  const buildReceiptPayload = (purchase: any): { receipt: ReceiptPayload; store: StoreProfile } => {
    const storeName =
      shopProfile?.shopName?.trim() && shopProfile.shopName.trim().length > 0
        ? shopProfile.shopName.trim()
        : t('Your Store');

    const receipt: ReceiptPayload = {
      id: purchase.id,
      customerName: purchase.vendor?.name ?? t('Vendor'),
      subtotal: Number(purchase.subtotal ?? 0),
      tax: Number(purchase.tax ?? 0),
      total: Number(purchase.total ?? 0),
      paymentMethod: purchase.paymentMethod ?? t('N/A'),
      createdAt: `${purchase.date} ${purchase.time}`,
      lineItems: Array.isArray(purchase.items)
        ? purchase.items.map((item: any) => ({
            name: item.variantName ? `${item.name} - ${item.variantName}` : item.name,
            quantity: item.quantity ?? 0,
            price: item.costPrice ?? item.price ?? 0,
          }))
        : [],
      changeAmount: 0,
      amountPaid: purchase.paidAmount ?? purchase.total ?? 0,
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
      lines.push(`${purchase.date} - ${purchase.time ?? ''}`);
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
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Total Purchases')}</Text>
            <Text style={styles.summaryValue}>{history.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Total spent')}</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalSpent)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Outstanding')}</Text>
            <Text style={[styles.summaryValue, outstanding > 0 && styles.summaryWarning]}>
              {formatCurrency(outstanding)}
            </Text>
          </View>
        </View>

        {history.length === 0 ? (
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
          history.map((purchase) => (
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
                    {purchase.date} - {purchase.time ?? ''}
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




