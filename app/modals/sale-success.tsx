import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useShop } from '../../contexts/ShopContext';
import { Button } from '../../components/ui/Button';
import { formatDateTimeForDisplay, formatTimeForDisplay } from '../../lib/date';
import { shareTextViaWhatsApp } from '../../lib/share';
import Toast from 'react-native-toast-message';
import {
  scanForPrinters,
  printReceiptViaBluetooth,
  generateReceiptHtml,
  createReceiptPdf,
  shareReceipt,
  emailReceipt,
  type ReceiptPayload,
  type StoreProfile,
  type PrinterDevice,
} from '../../services/receiptService';

export default function SaleSuccessModal() {
  const router = useRouter();
  const { t } = useLanguage();
  const { sales } = useData();
  const { profile: shopProfile } = useShop();
  const insets = useSafeAreaInsets();
  const { saleId, amountReceived, amountPaidDisplay } = useLocalSearchParams<{
    saleId?: string;
    amountReceived?: string;
    amountPaidDisplay?: string;
  }>();

  const numericId = saleId ? Number(saleId) : null;

  const sale = useMemo(
    () => (numericId ? sales.find((entry) => entry.id === numericId) : undefined),
    [sales, numericId]
  );

  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<PrinterDevice[]>([]);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const doneButtonRef = useRef<any>(null);

  const amountReceivedValue = amountReceived ? Number(amountReceived) : undefined;
  const amountPaidDisplayValue = amountPaidDisplay ? Number(amountPaidDisplay) : undefined;

  useEffect(() => {
    if (sale?.customer?.email) {
      setEmailAddress(sale.customer.email);
    }
  }, [sale]);

  useEffect(() => {
    // Auto-focus Done button after a short delay
    const timer = setTimeout(() => {
      doneButtonRef.current?.focus?.();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (!sale) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>{t('Loading...')}</Text>
        <Button
          variant="outline"
          style={styles.backButton}
          onPress={() => router.replace('/(tabs)/sales')}
        >
          {t('Done')}
        </Button>
      </SafeAreaView>
    );
  }

  const customerName = sale.customer?.name ?? t('Walk-in Customer');
  const paidAmount = sale.paidAmount ?? 0;
  const creditUsed = sale.creditUsed ?? 0;
  const amountAfterCredit =
    sale.amountAfterCredit ?? Math.max((sale.total ?? 0) - creditUsed, 0);
  const paymentMethodLabel =
    creditUsed > 0 && paidAmount <= 0 ? t('Customer Credit') : sale.paymentMethod;
  const subtotal = sale.subtotal;
  const tax = sale.tax;
  const total = sale.total;
  const changeDue = sale.changeAmount;
  const normalizedShopName = shopProfile.shopName?.trim();
  const storeName = normalizedShopName && normalizedShopName.length > 0 ? normalizedShopName : t('Your Store');
  const displayAmountPaid =
    Number.isFinite(amountPaidDisplayValue) && amountPaidDisplayValue !== undefined
      ? amountPaidDisplayValue
      : total ?? paidAmount;
  const displayAmountReceived = amountReceivedValue ?? paidAmount;
  const dueAmount = sale.remainingBalance ?? 0;
  const hasDueAmount = dueAmount > 0.0001;

  const saleDate = formatDateTimeForDisplay(sale.date, sale.time, t('at'));

  const renderedItems = sale.cart.map((item) => ({
    key: `${item.productId}-${item.variantId ?? 'base'}`,
    label: item.variantName ? `${item.name} • ${item.variantName}` : item.name,
    quantity: item.quantity,
    price: item.price,
  }));

  const receiptPayload: ReceiptPayload = useMemo(
    () => ({
      id: sale.id,
      customerName,
      subtotal,
      tax,
      total,
      paymentMethod: paymentMethodLabel,
      createdAt: `${sale.date} ${formatTimeForDisplay(sale.time)}`,
      creditUsed,
      amountAfterCredit,
      lineItems: sale.cart.map((item) => ({
        name: item.variantName ? `${item.name} - ${item.variantName}` : item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      changeAmount: changeDue,
      amountPaid: paidAmount,
      remainingBalance: dueAmount,
    }),
    [
      sale,
      customerName,
      subtotal,
      tax,
      total,
      paymentMethodLabel,
      changeDue,
      paidAmount,
      dueAmount,
      creditUsed,
      amountAfterCredit,
    ]
  );

  const storeProfile: StoreProfile = useMemo(
    () => ({
      name: storeName,
      thankYouMessage: t('Thank you for your business!'),
    }),
    [storeName, t]
  );

  const shareLines = [
    `${t('Receipt')} - ${storeName}`,
    `${t('Sale Completed')}: ${saleDate}`,
    `${t('Customer')}: ${customerName}`,
    '',
    `${t('Items')}:`,
    ...renderedItems.map(
      (item) => `• ${item.label} — ${item.quantity} × Rs. ${item.price.toLocaleString()}`
    ),
    '',
    `${t('Subtotal')}: Rs. ${subtotal.toLocaleString()}`,
    `${t('Tax')}: Rs. ${tax.toLocaleString()}`,
    `${t('Total Due')}: Rs. ${total.toLocaleString()}`,
    `${t('Payment Method')}: ${paymentMethodLabel}`,
    creditUsed > 0 ? `${t('Credit Used')}: Rs. ${creditUsed.toLocaleString()}` : null,
    `${t('Amount Paid')}: Rs. ${paidAmount.toLocaleString()}`,
    amountReceivedValue !== undefined
      ? `${t('Amount Received')}: Rs. ${amountReceivedValue.toLocaleString()}`
      : null,
    hasDueAmount ? `${t('Remaining Balance')}: Rs. ${dueAmount.toLocaleString()}` : null,
    `${t('Return Change')}: Rs. ${changeDue.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}`,
    '',
    t('Thank you for your business!'),
  ].filter(Boolean);

  const shareMessage = shareLines.join('\n');

  const handleSharePdf = async () => {
    setIsSharingPdf(true);
    try {
      const html = await generateReceiptHtml(receiptPayload, storeProfile);
      const pdf = await createReceiptPdf(html);
      await shareReceipt(pdf.uri);
    } catch (error) {
      console.error('PDF share failed', error);
      Toast.show({ type: 'error', text1: t('Unable to share PDF receipt') });
    } finally {
      setIsSharingPdf(false);
    }
  };

  const handleOpenPrinterModal = async () => {
    setPrinterModalVisible(true);
    setIsScanningPrinters(true);
    try {
      const printers = await scanForPrinters();
      setAvailablePrinters(printers);
      if (!printers.length) {
        Toast.show({ type: 'info', text1: t('No Bluetooth printers found') });
      }
    } catch (error: any) {
      console.error('Printer scan failed', error);
      
      // Check if it's a Bluetooth error
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('Bluetooth') || errorMessage.includes('powered off')) {
        Toast.show({ 
          type: 'error', 
          text1: t('Bluetooth is disabled'), 
          text2: t('Please turn on Bluetooth and try again')
        });
        setPrinterModalVisible(false);
      } else {
        Toast.show({ type: 'error', text1: t('Unable to discover printers') });
      }
    } finally {
      setIsScanningPrinters(false);
    }
  };

  const handlePrintReceipt = async (printer: PrinterDevice) => {
    setIsPrinting(true);
    try {
      await printReceiptViaBluetooth(printer.id, shareMessage);
      Toast.show({ type: 'success', text1: t('Receipt sent to printer') });
      setPrinterModalVisible(false);
    } catch (error) {
      console.error('Printing failed', error);
      Toast.show({ type: 'error', text1: t('Printing failed') });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) {
      Toast.show({ type: 'info', text1: t('Enter an email address') });
      return;
    }
    setIsSendingEmail(true);
    try {
      const html = await generateReceiptHtml(receiptPayload, storeProfile);
      const pdf = await createReceiptPdf(html);
      await emailReceipt(pdf.uri, [emailAddress.trim()]);
      Toast.show({ type: 'success', text1: t('Receipt emailed') });
      setEmailModalVisible(false);
    } catch (error) {
      console.error('Email receipt failed', error);
      Toast.show({ type: 'error', text1: t('Unable to email receipt') });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleShare = async () => {
    try {
      const shared = await shareTextViaWhatsApp(shareMessage);
      if (!shared) {
        Toast.show({ type: 'error', text1: t('WhatsApp not installed') });
      }
    } catch (error) {
      console.error('Failed to share receipt', error);
      Toast.show({ type: 'error', text1: t('WhatsApp share failed') });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(24, insets.bottom + 180) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{t('Sale Completed')}</Text>
            <Text style={styles.headerSubtitle}>{saleDate}</Text>
          </View>
        </View>

        <View style={styles.receiptCard}>
          <Text style={styles.receiptTitle}>{t('Receipt')}</Text>
          <Text style={styles.storeName}>{storeName}</Text>
          {shopProfile.phoneNumber && (
            <Text style={styles.storePhone}>{t('Mobile')}: {shopProfile.phoneNumber}</Text>
          )}

          <View style={styles.separator} />

          <View style={styles.row}>
            <Text style={styles.label}>{t('Customer')}:</Text>
            <Text style={styles.value}>{customerName}</Text>
          </View>

          <View style={styles.separator} />

          <Text style={[styles.label, styles.itemsHeading]}>{t('Items')}:</Text>
          {renderedItems.map((item) => (
            <View key={item.key} style={styles.itemRow}>
              <View>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemMeta}>
                  {item.quantity} × Rs. {item.price.toLocaleString()}
                </Text>
              </View>
              <Text style={styles.itemTotal}>
                Rs. {(item.price * item.quantity).toLocaleString()}
              </Text>
            </View>
          ))}

          <View style={styles.separator} />

          <View style={styles.row}>
            <Text style={styles.label}>{t('Subtotal')}:</Text>
            <Text style={styles.value}>Rs. {subtotal.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('Tax')}:</Text>
            <Text style={styles.value}>Rs. {tax.toLocaleString()}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, styles.totalLabel]}>{t('Total')}:</Text>
            <Text style={[styles.value, styles.totalLabel]}>Rs. {total.toLocaleString()}</Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.row}>
            <Text style={styles.label}>{t('Payment Method')}:</Text>
            <Text style={styles.value}>{paymentMethodLabel}</Text>
          </View>
          {creditUsed > 0 ? (
            <View style={styles.row}>
              <Text style={styles.label}>{t('Credit Used')}:</Text>
              <Text style={styles.value}>
                Rs. {creditUsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={styles.label}>{t('Amount Paid')}:</Text>
            <Text style={styles.value}>
              Rs. {displayAmountPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('Amount Received')}:</Text>
            <Text style={styles.value}>
              Rs. {displayAmountReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, hasDueAmount && styles.dueLabel]}>{t('Due Amount')}:</Text>
            <Text style={[styles.value, hasDueAmount && styles.dueValue]}>
              Rs. {dueAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('Return Change')}:</Text>
            <Text style={styles.value}>
              Rs. {changeDue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>

          <View style={styles.separator} />

          <Text style={styles.thankYou}>{t('Thank you for your business!')}</Text>
        </View>

        <View style={styles.actionStack}>
          <Button
            style={[styles.actionButton, styles.primaryAction]}
            onPress={handleOpenPrinterModal}
            disabled={isScanningPrinters || isPrinting}
          >
            {isScanningPrinters || isPrinting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="print-outline" size={18} color="#ffffff" style={styles.actionIcon} />
            )}
            <Text style={styles.primaryActionLabel}>
              {isPrinting
                ? t('Printing...')
                : isScanningPrinters
                ? t('Scanning printers...')
                : t('Print receipt')}
            </Text>
          </Button>

          <Button
            variant="outline"
            style={styles.actionButton}
            onPress={handleSharePdf}
            disabled={isSharingPdf}
          >
            {isSharingPdf ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Ionicons name="document-outline" size={18} color="#2563eb" style={styles.actionIcon} />
            )}
            <Text style={styles.altActionLabel}>{t('Share PDF')}</Text>
          </Button>

          <Button
            variant="outline"
            style={styles.actionButton}
            onPress={() => setEmailModalVisible(true)}
          >
            <Ionicons name="mail-outline" size={18} color="#2563eb" style={styles.actionIcon} />
            <Text style={styles.altActionLabel}>{t('Email receipt')}</Text>
          </Button>

          <Button style={[styles.actionButton, styles.shareButton]} onPress={handleShare}>
            <Ionicons name="share-social" size={18} color="#ffffff" style={styles.shareIcon} />
            <Text style={styles.shareLabel}>{t('Share Receipt on WhatsApp')}</Text>
          </Button>
        </View>
      </ScrollView>
        <View
          style={[
            styles.fixedDoneContainer,
            { paddingBottom: Math.max(16, insets.bottom + 8) },
          ]}
        >
          <Button
            ref={doneButtonRef}
            variant="outline"
            style={styles.fixedDoneButton}
            onPress={() => router.replace('/modals/product-selection')}
          >
            {t('Done')}
          </Button>
        </View>
      <Modal
        visible={printerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPrinterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Select a printer')}</Text>
            {isScanningPrinters ? (
              <ActivityIndicator size="large" color="#2563eb" />
            ) : availablePrinters.length ? (
              <View style={styles.printerList}>
                {availablePrinters.map((printer) => (
                  <TouchableOpacity
                    key={printer.id}
                    style={styles.printerItem}
                    onPress={() => handlePrintReceipt(printer)}
                    disabled={isPrinting}
                  >
                    <Ionicons name="print-outline" size={18} color="#1d4ed8" />
                    <Text style={styles.printerName}>{printer.name ?? t('Unnamed printer')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.modalSubtitle}>{t('No printers discovered')}</Text>
            )}
            <Button variant="outline" onPress={() => setPrinterModalVisible(false)}>
              {t('Close')}
            </Button>
          </View>
        </View>
      </Modal>

      <Modal
        visible={emailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEmailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Email receipt')}</Text>
            <Text style={styles.modalSubtitle}>{t('Send a copy of the receipt to your customer')}</Text>
            <TextInput
              style={styles.emailInput}
              value={emailAddress}
              onChangeText={setEmailAddress}
              placeholder={t('customer@example.com')}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Button variant="outline" onPress={() => setEmailModalVisible(false)}>
                {t('Cancel')}
              </Button>
              <Button onPress={handleSendEmail} disabled={isSendingEmail}>
                {isSendingEmail ? <ActivityIndicator size="small" color="#ffffff" /> : t('Send')}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#065f46',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  receiptCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d1fae5',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 12,
  },
  receiptTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  storeName: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  storePhone: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    color: '#64748b',
  },
  dueLabel: {
    color: '#dc2626',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  dueValue: {
    color: '#dc2626',
  },
  itemsHeading: {
    marginTop: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  itemMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  totalLabel: {
    color: '#0f172a',
    fontWeight: '700',
  },
  thankYou: {
    fontSize: 13,
    color: '#2563eb',
    textAlign: 'center',
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionStack: {
    width: '100%',
    gap: 12,
  },
  primaryAction: {
    backgroundColor: '#1d4ed8',
  },
  primaryActionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionIcon: {
    marginRight: 6,
  },
  altActionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
  },
  shareButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareIcon: {
    marginRight: 8,
  },
  shareLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  fixedDoneContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    zIndex: 10,
  },
  fixedDoneButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 0,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  backButton: {
    paddingHorizontal: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  printerList: {
    width: '100%',
    maxHeight: 300,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
  },
  printerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  printerName: {
    fontSize: 14,
    color: '#111827',
    marginLeft: 12,
  },
  emailInput: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1fae5',
    backgroundColor: '#f9fafb',
    fontSize: 15,
    color: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
});
