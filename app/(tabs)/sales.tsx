import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Pressable,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePos } from '../../contexts/PosContext';
import { useShop } from '../../contexts/ShopContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { formatDateForDisplay, formatTimeForDisplay, formatDateForStorage } from '../../lib/date';
import { spacing, radii, textStyles } from '../../theme/tokens';
import { shareTextViaWhatsApp } from '../../lib/share';
import {
  createReceiptPdf,
  generateReceiptHtml,
  openPrintPreview,
  shareReceipt,
  scanForPrinters,
  printReceiptViaBluetooth,
  type PrinterDevice,
} from '../../services/receiptService';

const PRINTER_STORAGE_KEY = 'pos.selectedPrinter';

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

export default function SalesScreen() {
  const { sales: rawSales, deleteSale } = useData();
  const { t } = useLanguage();
  const router = useRouter();
  const { resetSale } = usePos();
  const { profile: shopProfile } = useShop();
  const sales = rawSales ?? [];
  const todayKey = getTodayKey();

  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const listOpacity = useRef(new Animated.Value(1)).current;
  const listTranslate = useRef(new Animated.Value(0)).current;
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterDevice | null>(null);
  const [printerModalVisible, setPrinterModalVisible] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<PrinterDevice[]>([]);
  const [isScanningPrinters, setIsScanningPrinters] = useState(false);
  const [expandedSales, setExpandedSales] = useState<Set<number>>(new Set());

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
    const base = sales.filter((sale) => {
      if (!sale.date) return false;
      const saleDate = sale.date instanceof Date ? sale.date : new Date(sale.date);
      if (Number.isNaN(saleDate.getTime())) return false;
      const saleKey = formatDateForStorage(saleDate);
      return saleKey === todayKey;
    });
    if (statusFilter === 'all') {
      return base;
    }
    if (statusFilter === 'paid') {
      return base.filter((sale) => sale.status === 'Paid');
    }
    if (statusFilter === 'due') {
      return base.filter((sale) => sale.status === 'Due');
    }
    return base.filter((sale) => sale.status === 'Partially Paid');
  }, [sales, statusFilter]);

  const toggleSaleItems = (id: number) => {
    setExpandedSales((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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

  const buildPrintableText = (sale: any) => {
    const creditUsed = Number(sale.creditUsed ?? 0);
    const paidAmount = Number(sale.paidAmount ?? 0);
    const paymentLabel =
      creditUsed > 0 && paidAmount <= 0 ? t('Customer Credit') : sale.paymentMethod ?? 'N/A';
    const lines: string[] = [];
    lines.push(`${t('Sale')} #${sale.id}`);
    lines.push(`${formatDateForDisplay(sale.date)} ${sale.time ? formatTimeForDisplay(sale.time) : ''}`);
    lines.push(`${t('Total')}: ${formatCurrency(sale.total ?? 0)}`);
    lines.push(`${t('Items')}: ${sale.items ?? 0}`);
    lines.push(`${t('Payment Method')}: ${paymentLabel}`);
    if (creditUsed > 0) {
      lines.push(`${t('Credit Used')}: ${formatCurrency(creditUsed)}`);
    }
    if ((sale.remainingBalance ?? 0) > 0) {
      lines.push(`${t('Due')}: ${formatCurrency(sale.remainingBalance)}`);
    }
    if (Array.isArray(sale.cart) && sale.cart.length > 0) {
      lines.push('');
      lines.push(`${t('Items')}:`);
      sale.cart.slice(0, 5).forEach((item: any, index: number) => {
        const itemPrice = Number(item.price ?? 0);
        const itemQty = item.quantity ?? 0;
        lines.push(
          `${index + 1}. ${item.name ?? 'Unknown'}${item.variantName ? ` - ${item.variantName}` : ''} x${itemQty} @ Rs. ${itemPrice.toLocaleString()}`
        );
      });
      if (sale.cart.length > 5) {
        lines.push(`+ ${sale.cart.length - 5} ${t('items')}`);
      }
    }
    return lines.join('\n');
  };

  const openPrinterSelector = async () => {
    setPrinterModalVisible(true);
    setIsScanningPrinters(true);
    setAvailablePrinters([]);
    try {
      const printers = await scanForPrinters();
      setAvailablePrinters(printers);
      if (!printers.length) {
        Toast.show({ type: 'info', text1: t('No Bluetooth printers found') });
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      const isExpoGo = message.toLowerCase().includes('expo go');
      const text1 = isExpoGo
        ? t('Bluetooth is not available in Expo Go')
        : t('Unable to scan printers');
      const text2 = isExpoGo ? t('Use a development build to print via Bluetooth.') : undefined;
      Toast.show({ type: 'info', text1, text2 });
      setPrinterModalVisible(false);
    } finally {
      setIsScanningPrinters(false);
    }
  };

  const handleSelectPrinter = async (printer: PrinterDevice) => {
    try {
      setSelectedPrinter(printer);
      await AsyncStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(printer));
      Toast.show({ type: 'success', text1: t('Printer selected') });
    } catch (error) {
      console.error('Failed to save printer', error);
    } finally {
      setPrinterModalVisible(false);
    }
  };

  useEffect(() => {
    const loadPrinter = async () => {
      try {
        const stored = await AsyncStorage.getItem(PRINTER_STORAGE_KEY);
        if (stored) {
          setSelectedPrinter(JSON.parse(stored));
        }
      } catch (error) {
        console.warn('Failed to load printer', error);
      }
    };
    loadPrinter();
  }, []);

  const storeName =
    shopProfile.shopName?.trim()?.length ? shopProfile.shopName.trim() : t('Your Store');

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

  const shareSaleText = async (sale: any) => {
    const customerName = sale.customer?.name || t('Walk-in Customer');
    const shareLines = [
      `${t('Receipt')} - ${storeName}`,
      `${t('Sale Completed')}: ${formatDateForDisplay(sale.date)} ${formatTimeForDisplay(sale.time)}`,
      `${t('Customer')}: ${customerName}`,
      '',
      `${t('Items')}:`,
      ...(sale.cart || []).map((item: any) => {
        const displayPrice = item.price || 0;
        const displayQty = item.quantity || 0;
        const label = item.variantName ? `${item.name} - ${item.variantName}` : item.name;
        return `• ${label} - ${displayQty} x Rs. ${displayPrice.toLocaleString()}`;
      }),
      '',
      `${t('Total')}: ${formatCurrency(sale.total)}`,
      `${t('Payment Method')}: ${sale.paymentMethod || 'Cash'}`,
      sale.remainingBalance > 0 ? `${t('Due')}: ${formatCurrency(sale.remainingBalance)}` : null,
    ].filter((line): line is string => Boolean(line));

    const shared = await shareTextViaWhatsApp(shareLines.join('\n'));
    if (!shared) {
      Toast.show({ type: 'info', text1: t('WhatsApp share failed') });
    }
  };

  const shareSalePdf = async (sale: any) => {
    try {
      const payload = buildReceiptPayload(sale);
      const html = await generateReceiptHtml(payload, {
        name: storeName,
        thankYouMessage: t('Thank you for your business!'),
      });
      const fileName = `Receipt-${sale.id}-${sale.date ?? ''}.pdf`;
      const pdf = await createReceiptPdf(html, { fileName });
      const shared = await shareReceipt(pdf.uri, { fileName });
      if (shared) {
        Toast.show({ type: 'success', text1: t('Receipt shared') });
      } else {
        Toast.show({ type: 'error', text1: t('Unable to share PDF receipt') });
      }
    } catch (error) {
      console.error('Failed to share receipt PDF', error);
      Toast.show({ type: 'error', text1: t('Unable to share PDF receipt') });
    }
  };

  const printToNetworkPrinter = async (sale: any, printer: any) => {
    try {
      Toast.show({
        type: 'info',
        text1: t('Printing...'),
        text2: `${printer.name} (${printer.ip})`,
      });

      const { printerService } = await import('../../services/escPosPrinterService');
      
      // Build receipt data
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
          `${result.message}\n\n${t('Suggestions')}:\n• ${t('Check printer is on')}\n• ${t('Verify IP address')}\n• ${t('Ensure same Wi-Fi network')}`,
          [
            { text: t('OK') },
            {
              text: t('Test Printer'),
              onPress: async () => {
                const testResult = await printerService.testPrint(printer);
                Alert.alert(
                  testResult.success ? t('Success') : t('Failed'),
                  testResult.message
                );
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Network print error:', error);
      Alert.alert(
        t('Print Error'),
        error.message || t('Failed to print to network printer')
      );
    }
  };

  const printSale = async (sale: any) => {
    // Load saved printers
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
            Toast.show({ type: 'error', text1: t('Unable to print receipt') });
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
            const fileName = `Receipt-${sale.id}-${sale.date ?? ''}.pdf`;
            const pdf = await createReceiptPdf(html, { fileName });
            const shared = await shareReceipt(pdf.uri, { fileName });
            if (shared) {
              Toast.show({
                type: 'success',
                text1: t('PDF ready'),
                text2: t('Share to your printer app'),
              });
            } else {
              Toast.show({ type: 'error', text1: t('Unable to share PDF receipt') });
            }
          } catch (error) {
            console.error('Failed to create PDF', error);
            Toast.show({ type: 'error', text1: t('Unable to create PDF') });
          }
        },
      },
    ];
    
    // Add network printer option if available
    if (networkPrinters.length > 0) {
      buttons.splice(1, 0, {
        text: t('Network Printer'),
        onPress: async () => {
          // Show printer selection if multiple printers
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

  const confirmDeleteSale = (saleId: number) => {
    Alert.alert(
      t('Delete sale?'),
      t('This will remove the sale and restock the items.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSale(saleId);
              Toast.show({ type: 'success', text1: t('Sale deleted') });
            } catch (error) {
              console.error('Failed to delete sale', error);
              Toast.show({ type: 'error', text1: t('Failed to delete sale') });
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>{t('Sales')}</Text>
          <Text style={styles.screenSubtitle}>{t('Sales History')}</Text>
        </View>
        <TouchableOpacity
          style={styles.historyIconButton}
          onPress={() => router.push('/history')}
          accessibilityLabel={t('History')}
          hitSlop={8}
        >
          <Ionicons name="time-outline" size={20} color="#2563eb" />
        </TouchableOpacity>
        <Button
          style={styles.newSaleButton}
          onPress={() => {
            try {
              if (__DEV__) console.log('[Sales] Starting new sale, resetting cart');
              resetSale();
              if (__DEV__) console.log('[Sales] Cart reset, navigating to product selection');
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
                    {String(statusCounts[option.key])}
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
            <Text style={styles.statValue}>{String(filteredSales.length)}</Text>
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
                <View style={styles.groupHeader}>
                  <Text style={styles.groupLabel}>{groupLabel}</Text>
                </View>
                {groupSales.map((sale) => {
                  const remainingBalance = Number(sale.remainingBalance ?? 0) || 0;
                  const hasDue = remainingBalance > 0;
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
                  const paymentIcon = getPaymentIcon(paymentLabel);
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
                          <View style={styles.saleDetailValueRow}>
                            <Ionicons name={paymentIcon} size={14} color="#475569" />
                            <Text style={styles.saleDetailValue}>{paymentLabel}</Text>
                        </View>
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
                                hasDue ? styles.saleDuePending : styles.saleDueClear,
                              ]}
                            >
                              {hasDue ? formatCurrency(remainingBalance) : '\u2014'}
                            </Text>
                          </View>
                        </View>
                        {Array.isArray(sale.cart) && sale.cart.length > 0 ? (
                          <>
                            <TouchableOpacity
                              style={styles.itemToggle}
                              onPress={() => toggleSaleItems(Number(sale.id))}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.itemToggleText}>
                                {expandedSales.has(Number(sale.id)) ? t('Hide items') : t('View items')}
                              </Text>
                              <Ionicons
                                name={expandedSales.has(Number(sale.id)) ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color="#2563eb"
                              />
                            </TouchableOpacity>
                            {expandedSales.has(Number(sale.id)) ? (
                              <View style={styles.itemsPreview}>
                                <View style={styles.itemsHeader}>
                                  <Text style={[styles.itemCellName, styles.itemHeaderText]}>{t('Item')}</Text>
                                  <Text style={[styles.itemCellQty, styles.itemHeaderText]}>{t('Qty')}</Text>
                                  <Text style={[styles.itemCellPrice, styles.itemHeaderText]}>{t('Price')}</Text>
                                  <Text style={[styles.itemCellTotal, styles.itemHeaderText]}>{t('Total')}</Text>
                                </View>
                                {sale.cart.map((item: any, idx: number) => {
                                  const qty = item.quantity ?? 0;
                                  const price = Number(item.price ?? 0);
                                  const lineTotal = price * qty;
                                  return (
                                    <View key={`${sale.id}-item-${idx}`} style={styles.itemRow}>
                                      <Text style={styles.itemCellName} numberOfLines={1}>
                                        {item.name}
                                        {item.variantName ? ` - ${item.variantName}` : ''}
                                      </Text>
                                      <Text style={styles.itemCellQty}>{qty}</Text>
                                      <Text style={styles.itemCellPrice}>{formatCurrency(price)}</Text>
                                      <Text style={styles.itemCellTotal}>{formatCurrency(lineTotal)}</Text>
                                    </View>
                                  );
                                })}
                              </View>
                            ) : null}
                          </>
                        ) : null}

                        <View style={styles.saleActions}>
                          <TouchableOpacity
                            style={[styles.actionButton, styles.actionNeutral]}
                            onPress={() => shareSaleText(sale)}
                            accessibilityLabel={t('Share')}
                          >
                            <Ionicons name="share-social-outline" size={18} color="#2563eb" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionButton, styles.actionNeutral]}
                            onPress={() => printSale(sale)}
                            accessibilityLabel={t('Print receipt')}
                          >
                            <Ionicons name="print-outline" size={18} color="#2563eb" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionButton, styles.actionNeutral]}
                            onPress={() => shareSalePdf(sale)}
                            accessibilityLabel={t('Share receipt PDF')}
                          >
                            <Ionicons name="document-text-outline" size={18} color="#2563eb" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionButton, styles.actionDanger]}
                            onPress={() => confirmDeleteSale(sale.id)}
                            accessibilityLabel={t('Delete')}
                          >
                            <Ionicons name="trash-outline" size={18} color="#dc2626" />
                          </TouchableOpacity>
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
      <Modal
        visible={printerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPrinterModalVisible(false)}
      >
        <View style={styles.printerOverlay}>
          <View style={styles.printerCard}>
            <View style={styles.printerHeader}>
              <Text style={styles.printerTitle}>{t('Select a printer')}</Text>
              <TouchableOpacity
                onPress={() => setPrinterModalVisible(false)}
                hitSlop={8}
                style={styles.printerCloseButton}
              >
                <Ionicons name="close" size={20} color="#111827" />
              </TouchableOpacity>
            </View>

            {isScanningPrinters ? (
              <View style={styles.printerMessageContainer}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.printerMessage}>{t('Scanning printers...')}</Text>
              </View>
            ) : availablePrinters.length ? (
              <View style={styles.printerList}>
                {availablePrinters.map((printer) => (
                  <TouchableOpacity
                    key={printer.id}
                    style={styles.printerItem}
                    onPress={() => handleSelectPrinter(printer)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.printerName}>{printer.name ?? t('Unnamed printer')}</Text>
                    {selectedPrinter?.id === printer.id ? (
                      <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.printerEmpty}>{t('No printers discovered')}</Text>
            )}

            <View style={styles.printerActionsRow}>
              <Button variant="outline" onPress={openPrinterSelector} style={styles.printerActionButton}>
                {t('Rescan')}
              </Button>
              <Button
                variant="outline"
                onPress={() => setPrinterModalVisible(false)}
                style={styles.printerActionButton}
              >
                {t('Close')}
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
  historyIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0ecff',
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
  groupSection: {
    gap: spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    flex: 1,
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
  saleCreditBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
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
  itemsPreview: {
    marginTop: spacing.sm,
    gap: 4,
  },
  itemText: {
    fontSize: 12,
    color: '#475569',
  },
  moreItemsText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  itemToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: spacing.xs,
  },
  itemToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  itemHeaderText: {
    fontWeight: '700',
    color: '#111827',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemCellName: {
    flex: 0.5,
    fontSize: 12,
    color: '#111827',
  },
  itemCellQty: {
    flex: 0.15,
    fontSize: 12,
    color: '#111827',
    textAlign: 'right',
  },
  itemCellPrice: {
    flex: 0.175,
    fontSize: 12,
    color: '#111827',
    textAlign: 'right',
  },
  itemCellTotal: {
    flex: 0.175,
    fontSize: 12,
    color: '#111827',
    textAlign: 'right',
    fontWeight: '700',
  },
  saleActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    alignSelf: 'flex-end',
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
  actionDanger: {
    backgroundColor: '#ffe4e6',
  },
  printerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  printerCard: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  printerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  printerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  printerList: {
    maxHeight: 260,
    gap: spacing.sm,
  },
  printerItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
  },
  printerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  printerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  printerActionButton: {
    flex: 1,
  },
  printerCloseButton: {
    alignSelf: 'flex-end',
  },
  printerEmpty: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  printerMessageContainer: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  printerMessage: {
    fontSize: 14,
    color: '#475569',
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
