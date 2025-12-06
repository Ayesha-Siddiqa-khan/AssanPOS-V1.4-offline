import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useLanguage } from '../../contexts/LanguageContext';
import { useData } from '../../contexts/DataContext';
import { useShop } from '../../contexts/ShopContext';
import { formatDateForDisplay, formatDateTimeForDisplay, formatTimeForDisplay } from '../../lib/date';
import { shareTextViaWhatsApp } from '../../lib/share';
import {
  createReceiptPdf,
  generateReceiptHtml,
  openPrintPreview,
  shareReceipt,
  type ReceiptPayload,
  type StoreProfile,
} from '../../services/receiptService';

type Mode = 'create' | 'edit' | 'view';

const formatCurrency = (value: number) => `Rs. ${value.toLocaleString()}`;

const normalizePhone = (value?: string) => (value ? value.replace(/\D/g, '') : '');

const parseDateValue = (date?: string, time?: string) => {
  if (!date) {
    return 0;
  }
  const safeTime = time && time.length >= 4 ? time : '00:00';
  return new Date(`${date}T${safeTime}`).getTime();
};

const formatDateTime = (date?: string, time?: string, atLabel?: string) =>
  formatDateTimeForDisplay(date, time, atLabel);

export default function CustomerAccountModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ customerId?: string; mode?: string }>();

  const customerId = params.customerId ? Number(params.customerId) : null;
  const requestedMode = params.mode === 'edit' ? 'edit' : undefined;
  const initialMode: Mode = requestedMode ?? (customerId ? 'view' : 'create');

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [creditInput, setCreditInput] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  const [saleQuery, setSaleQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<'all' | 'paid' | 'due' | 'partial'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [creditError, setCreditError] = useState('');
  const [isCreditSaving, setIsCreditSaving] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const { t } = useLanguage();
  const {
    customers,
    sales,
    addCustomer,
    updateCustomer,
    addCreditTransaction,
    deleteSale,
    deleteCreditTransaction,
    getCustomerCreditTransactions,
  } = useData();
  const { profile: shopProfile } = useShop();

  const customer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId]
  );

  useEffect(() => {
    if (!customerId && mode !== 'create') {
      setMode('create');
    }
  }, [customerId, mode]);

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setPhone(customer.phone);
      setEmail(customer.email ?? '');
      setNote(customer.note ?? '');
      setCreditInput(customer.credit.toString());
      setImageUri((customer as any).imageUri ?? null);
    } else if (mode === 'create') {
      setName('');
      setPhone('');
      setEmail('');
      setNote('');
      setCreditInput('');
      setImageUri(null);
    }
  }, [customer, mode]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  };

  const customerSales = useMemo(() => {
    if (!customer) {
      return [];
    }

    const normalizedName = customer.name.trim().toLowerCase();
    const normalizedPhone = normalizePhone(customer.phone);

    return sales
      .filter((sale) => {
        if (!sale.customer) {
          return false;
        }
        if (sale.customer.id === customer.id) {
          return true;
        }
        const saleName = sale.customer.name
          ? sale.customer.name.trim().toLowerCase()
          : '';
        const salePhone = normalizePhone(String(sale.customer.phone ?? ''));
        return saleName === normalizedName || salePhone === normalizedPhone;
      })
      .sort(
        (a, b) => parseDateValue(b.date, b.time) - parseDateValue(a.date, a.time)
      );
  }, [customer, sales]);

  const salesStats = useMemo(() => {
    const totalSales = customerSales.length;
    const totalValue = customerSales.reduce((sum, sale) => sum + sale.total, 0);
    const pendingCount = customerSales.reduce(
      (count, sale) =>
        sale.status === 'Due' || sale.remainingBalance > 0 ? count + 1 : count,
      0
    );

    return { totalSales, totalValue, pendingCount };
  }, [customerSales]);

  const filteredSales = useMemo(() => {
    const query = saleQuery.trim().toLowerCase();

    return customerSales.filter((sale) => {
      const matchesQuery = query
        ? sale.id.toString().toLowerCase().includes(query)
        : true;

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'paid'
          ? sale.status === 'Paid'
          : statusFilter === 'due'
          ? sale.status === 'Due'
          : sale.status === 'Partially Paid';

      return matchesQuery && matchesStatus;
    });
  }, [customerSales, saleQuery, statusFilter]);

  const creditHistory = useMemo(() => {
    if (!customer) {
      return [];
    }
    const history = getCustomerCreditTransactions(customer.id);
    return [...history].sort(
      (a, b) => parseDateValue(b.date, b.time) - parseDateValue(a.date, a.time)
    );
  }, [customer, getCustomerCreditTransactions]);

  const validate = () => {
    const currentErrors: typeof errors = {};
    
    // All fields are optional - only validate format if provided
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^\d{11}$/.test(trimmedPhone)) {
      currentErrors.phone = t('Invalid phone number (11 digits required)');
    }

    setErrors(currentErrors);
    return Object.keys(currentErrors).length === 0;
  };

  const handleCancel = () => {
    if (mode === 'edit') {
      setErrors({});
      if (customer) {
        setName(customer.name);
        setPhone(customer.phone);
        setEmail(customer.email ?? '');
        setNote(customer.note ?? '');
        setCreditInput(customer.credit.toString());
      }
      setMode('view');
    } else {
      router.back();
    }
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    const creditValue = parseFloat(creditInput.replace(/[^0-9.]/g, ''));
    const sanitizedCredit = Number.isNaN(creditValue) ? 0 : creditValue;

    // Generate default name if empty
    const customerName = name.trim() || `Customer ${phone.trim() || Date.now()}`;

    const payload = {
      name: customerName,
      phone: phone.trim(),
      email: email.trim() || undefined,
      note: note.trim() || undefined,
      credit: sanitizedCredit,
      totalPurchases: customer?.totalPurchases ?? 0,
      lastPurchase: customer?.lastPurchase,
      dueAmount: customer?.dueAmount ?? 0,
      imageUri: imageUri || undefined,
    };

    try {
      setIsSaving(true);
      if (mode === 'edit' && customer) {
        await updateCustomer(customer.id, payload);
        Toast.show({ type: 'success', text1: t('Customer saved successfully') });
        setMode('view');
      } else {
        await addCustomer({
          ...payload,
          totalPurchases: 0,
          lastPurchase: undefined,
          dueAmount: 0,
        });
        Toast.show({ type: 'success', text1: t('Customer saved successfully') });
        router.back();
      }
    } catch (error) {
      console.error('Failed to save customer', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsSaving(false);
    }
  };

  const openCreditModal = () => {
    setCreditAmount('');
    setCreditNote('');
    setCreditError('');
    setShowCreditModal(true);
  };

  const handleAddCredit = async () => {
    if (!customer) {
      return;
    }

    const amountValue = parseFloat(creditAmount.replace(/[^0-9.]/g, ''));
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      setCreditError(t('Enter a valid amount'));
      return;
    }

    try {
      setIsCreditSaving(true);
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 5);

      await addCreditTransaction({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        amount: amountValue,
        type: 'add',
        date,
        time,
        description: creditNote.trim() || t('Manual credit adjustment'),
      });

      Toast.show({ type: 'success', text1: t('Credit added successfully') });
      setShowCreditModal(false);
    } catch (error) {
      console.error('Failed to add credit', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsCreditSaving(false);
    }
  };

  const handleSelectFilter = (value: 'all' | 'paid' | 'due' | 'partial') => {
    setStatusFilter(value);
  };

  const handleShareAll = async () => {
    if (!customer) {
      return;
    }

    try {
      const lines: string[] = [];
      lines.push(`${t('Customer')}: ${customer.name}`);
      lines.push(`${t('Phone')}: ${customer.phone}`);
      if (customer.email) {
        lines.push(`${t('Email')}: ${customer.email}`);
      }
      lines.push(`${t('Total Purchases')}: ${formatCurrency(customer.totalPurchases ?? 0)}`);
      lines.push(`${t('Credit')}: ${formatCurrency(customer.credit)}`);
      lines.push(`${t('Due')}: ${formatCurrency(customer.dueAmount)}`);

      if (customerSales.length > 0) {
        lines.push('');
        lines.push(`${t('Recent Sales')}:`);
        customerSales.slice(0, 3).forEach((sale) => {
          lines.push(
            `#${sale.id} - ${formatDateTime(sale.date, sale.time, t('at'))} - ${formatCurrency(
              sale.total ?? 0
            )}`
          );
        });
      }

      if (creditHistory.length > 0) {
        lines.push('');
        lines.push(`${t('Credit History')}:`);
        creditHistory.slice(0, 3).forEach((entry) => {
          const typeLabel =
            entry.type === 'add'
              ? t('Added')
              : entry.type === 'deduct'
              ? t('Deducted')
              : t('Used');
          lines.push(
            `${typeLabel} - ${formatCurrency(entry.amount)} - ${formatDateTime(
              entry.date,
              entry.time,
              t('at')
            )}`
          );
        });
      }

      const shared = await shareTextViaWhatsApp(lines.join('\n'));
      if (!shared) {
        Toast.show({ type: 'error', text1: t('WhatsApp not installed') });
      }
    } catch (error) {
      console.error('Failed to share customer summary', error);
      Toast.show({ type: 'error', text1: t('WhatsApp share failed') });
    }
  };

  const handleShareSale = async (sale: any) => {
    try {
      const creditUsed = Number(sale.creditUsed ?? 0);
      const paidAmount = Number(sale.paidAmount ?? 0);
      const paymentLabel =
        creditUsed > 0 && paidAmount <= 0 ? t('Customer Credit') : sale.paymentMethod ?? 'N/A';
      const lines: string[] = [];
      lines.push(`${t('Sale')} #${sale.id}`);
      lines.push(`${formatDateTime(sale.date, sale.time, t('at'))}`);
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
            `${index + 1}. ${item.name ?? 'Unknown'}${
              item.variantName ? ` - ${item.variantName}` : ''
            } x${itemQty} @ Rs. ${itemPrice.toLocaleString()}`
          );
        });
        if (sale.cart.length > 5) {
          lines.push(`+ ${sale.cart.length - 5} ${t('items')}`);
        }
      }

      const shared = await shareTextViaWhatsApp(lines.join('\n'));
      if (!shared) {
        Toast.show({ type: 'error', text1: t('WhatsApp not installed') });
      }
    } catch (error) {
      console.error('Failed to share sale', error);
      Toast.show({ type: 'error', text1: t('WhatsApp share failed') });
    }
  };

  const buildReceiptPayload = (sale: any): { receipt: ReceiptPayload; store: StoreProfile } => {
    const storeName =
      shopProfile?.shopName?.trim() && shopProfile.shopName.trim().length > 0
        ? shopProfile.shopName.trim()
        : t('Your Store');
    const creditUsed = Number(sale.creditUsed ?? 0);
    const paidAmount = Number(sale.paidAmount ?? 0);
    const amountAfterCredit =
      sale.amountAfterCredit ?? Math.max(Number(sale.total ?? 0) - creditUsed, 0);
    const paymentLabel =
      creditUsed > 0 && paidAmount <= 0 ? t('Customer Credit') : sale.paymentMethod ?? t('N/A');

    const receipt: ReceiptPayload = {
      id: sale.id,
      customerName: sale.customer?.name ?? t('Walk-in Customer'),
      subtotal: Number(sale.subtotal ?? 0),
      tax: Number(sale.tax ?? 0),
      total: Number(sale.total ?? 0),
      paymentMethod: paymentLabel,
      createdAt: `${sale.date} ${formatTimeForDisplay(sale.time)}`,
      creditUsed,
      amountAfterCredit,
      lineItems: Array.isArray(sale.cart)
        ? sale.cart.map((item: any) => ({
            name: item.variantName ? `${item.name} - ${item.variantName}` : item.name,
            quantity: item.quantity ?? 0,
            price: item.price ?? 0,
          }))
        : [],
      changeAmount: sale.changeAmount,
      amountPaid: paidAmount,
      remainingBalance: Number(sale.remainingBalance ?? 0),
    };

    const store: StoreProfile = {
      name: storeName,
      thankYouMessage: t('Thank you for your business!'),
    };
    return { receipt, store };
  };

  const handleShareSalePdf = async (sale: any) => {
    try {
      const { receipt, store } = buildReceiptPayload(sale);
      const html = await generateReceiptHtml(receipt, store);
      const pdf = await createReceiptPdf(html);
      await shareReceipt(pdf.uri);
    } catch (error) {
      console.error('Failed to share sale PDF', error);
      Toast.show({ type: 'error', text1: t('Unable to share PDF receipt') });
    }
  };

  const handlePrintSale = async (sale: any) => {
    try {
      const { receipt, store } = buildReceiptPayload(sale);
      const html = await generateReceiptHtml(receipt, store);
      await openPrintPreview(html);
    } catch (error) {
      console.error('Failed to print sale receipt', error);
      Toast.show({ type: 'error', text1: t('Unable to print receipt') });
    }
  };

  const handlePrintCreditEntry = async (entry: any) => {
    try {
      const lines = [
        `<h3 style="margin:0 0 6px 0;">${t('Credit History')}</h3>`,
        `<div>${t('Type')}: ${entry.type}</div>`,
        `<div>${t('Amount')}: ${formatCurrency(entry.amount || 0)}</div>`,
        `<div>${t('Date')}: ${formatDateTime(entry.date, entry.time, t('at'))}</div>`,
        entry.description ? `<div>${t('Description')}: ${entry.description}</div>` : '',
        entry.linkedSaleId ? `<div>${t('Sale')} #${entry.linkedSaleId}</div>` : '',
      ].filter(Boolean);

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; color: #111827; }
            </style>
          </head>
          <body>
            ${lines.join('')}
          </body>
        </html>
      `;
      await openPrintPreview(html);
    } catch (error) {
      console.error('Failed to print credit entry', error);
      Toast.show({ type: 'error', text1: t('Unable to print receipt') });
    }
  };

  const handlePrintCreditHistory = async () => {
    try {
      const rows = creditHistory
        .map(
          (entry) => `
            <tr>
              <td>${entry.type}</td>
              <td>${formatCurrency(entry.amount || 0)}</td>
              <td>${formatDateTime(entry.date, entry.time, t('at'))}</td>
              <td>${entry.linkedSaleId ? `#${entry.linkedSaleId}` : '-'}</td>
            </tr>
          `
        )
        .join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; color: #111827; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { padding: 6px 4px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 13px; }
              th { font-weight: 700; }
            </style>
          </head>
          <body>
            <h3 style="margin:0 0 6px 0;">${t('Credit History')}</h3>
            <div>${t('Customer')}: ${customer?.name ?? t('Unknown')}</div>
            <div>${t('Phone')}: ${customer?.phone ?? '-'}</div>
            <table>
              <thead>
                <tr>
                  <th>${t('Type')}</th>
                  <th>${t('Amount')}</th>
                  <th>${t('Date')}</th>
                  <th>${t('Sale')}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </body>
        </html>
      `;

      await openPrintPreview(html);
    } catch (error) {
      console.error('Failed to print credit history', error);
      Toast.show({ type: 'error', text1: t('Unable to print receipt') });
    }
  };

  const handleShareCreditEntry = async (entry: any) => {
    try {
      const lines: string[] = [];
      const typeLabel =
        entry.type === 'add' ? t('Added') : entry.type === 'deduct' ? t('Deducted') : t('Used');
      lines.push(`${t('Credit History')}`);
      lines.push(`${typeLabel} (${entry.id})`);
      lines.push(`${t('Amount')}: ${formatCurrency(entry.amount)}`);
      lines.push(`${formatDateTime(entry.date, entry.time, t('at'))}`);
      if (entry.description) {
        lines.push(`${t('Description')}: ${entry.description}`);
      }
      if (entry.linkedSaleId) {
        lines.push(`${t('Sale')} #${entry.linkedSaleId}`);
      }

      const shared = await shareTextViaWhatsApp(lines.join('\n'));
      if (!shared) {
        Toast.show({ type: 'error', text1: t('WhatsApp not installed') });
      }
    } catch (error) {
      console.error('Failed to share credit entry', error);
      Toast.show({ type: 'error', text1: t('WhatsApp share failed') });
    }
  };

  const handleShareCreditHistoryText = async () => {
    try {
      if (!creditHistory.length) {
        Toast.show({ type: 'info', text1: t('No credit history to share') });
        return;
      }

      const lines: string[] = [];
      lines.push(`${t('Customer')}: ${customer?.name ?? t('N/A')}`);
      lines.push(`${t('Credit History')}:`);
      creditHistory.forEach((entry) => {
        const typeLabel =
          entry.type === 'add'
            ? t('Added')
            : entry.type === 'deduct'
            ? t('Deducted')
            : t('Used');
        lines.push(
          `${typeLabel} - ${formatCurrency(entry.amount)} - ${formatDateTime(
            entry.date,
            entry.time,
            t('at')
          )}${entry.description ? ` - ${entry.description}` : ''}`
        );
      });

      const shared = await shareTextViaWhatsApp(lines.join('\n'));
      if (!shared) {
        Toast.show({ type: 'error', text1: t('WhatsApp not installed') });
      }
    } catch (error) {
      console.error('Failed to share credit history', error);
      Toast.show({ type: 'error', text1: t('WhatsApp share failed') });
    }
  };

  const buildCreditHistoryHtml = () => {
    const typeLabel = (type: string) =>
      type === 'add' ? t('Added') : type === 'deduct' ? t('Deducted') : t('Used');

    const totals = creditHistory.reduce(
      (acc, entry) => {
        if (entry.type === 'add') acc.added += entry.amount;
        else if (entry.type === 'deduct') acc.deducted += entry.amount;
        else acc.used += entry.amount;
        return acc;
      },
      { added: 0, deducted: 0, used: 0 }
    );

    const rows = creditHistory
      .map(
        (entry) => `
        <tr>
          <td style="padding:6px 8px; border:1px solid #e5e7eb;">${typeLabel(entry.type)}</td>
          <td style="padding:6px 8px; border:1px solid #e5e7eb;">${formatCurrency(
            entry.amount
          )}</td>
          <td style="padding:6px 8px; border:1px solid #e5e7eb;">${formatDateTime(
            entry.date,
            entry.time,
            t('at')
          )}</td>
          <td style="padding:6px 8px; border:1px solid #e5e7eb;">${
            entry.description || '-'
          }</td>
        </tr>
      `
      )
      .join('');

    return `
      <div style="font-family: Arial, sans-serif; color:#0f172a; padding:12px;">
        <h2 style="margin-bottom:8px;">${t('Credit History')}</h2>
        <p style="margin:0 0 12px 0;">${t('Customer')}: ${customer?.name ?? t('N/A')}</p>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr>
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:left;">${t('Type')}</th>
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:left;">${t('Amount')}</th>
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:left;">${t('Date')}</th>
              <th style="padding:8px; border:1px solid #e5e7eb; text-align:left;">${t('Description')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:12px; font-size:14px;">
          <p style="margin:4px 0;">${t('Added')}: ${formatCurrency(totals.added)}</p>
          <p style="margin:4px 0;">${t('Used')}: ${formatCurrency(totals.used)}</p>
          <p style="margin:4px 0;">${t('Deducted')}: ${formatCurrency(totals.deducted)}</p>
        </div>
      </div>
    `;
  };

  const handleShareCreditHistoryPdf = async () => {
    try {
      if (!creditHistory.length) {
        Toast.show({ type: 'info', text1: t('No credit history to share') });
        return;
      }
      const html = buildCreditHistoryHtml();
      const pdf = await createReceiptPdf(html);
      await shareReceipt(pdf.uri);
    } catch (error) {
      console.error('Failed to share credit history PDF', error);
      Toast.show({ type: 'error', text1: t('Unable to share PDF') });
    }
  };

  const handleShareAllPdf = async () => {
    try {
      if (!filteredSales.length) {
        Toast.show({ type: 'info', text1: t('No sales to share') });
        return;
      }

      const formatter = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'PKR',
      });

      const rows = filteredSales
        .map((sale) => {
          const itemsCount =
            sale.items ??
            sale.cart?.reduce((sum: number, item: any) => sum + (item.quantity ?? 0), 0) ??
            0;
          const formattedTime = formatTimeForDisplay(sale.time);
          const creditUsed = Number(sale.creditUsed ?? 0);
          const itemDetails = Array.isArray(sale.cart)
            ? sale.cart
                .slice(0, 3)
                .map((item: any) => {
                  const qty = item.quantity ?? 0;
                  const label = item.variantName ? `${item.name} - ${item.variantName}` : item.name;
                  return `${label} x${qty}`;
                })
                .join(', ') + (sale.cart.length > 3 ? ` +${sale.cart.length - 3}` : '')
            : '';
          return `
            <tr>
              <td>${formatDateForDisplay(sale.date)} ${formattedTime}</td>
              <td>${sale.customer?.name ?? t('Walk-in Customer')}</td>
              <td style="text-align:right;">${formatter.format(sale.total ?? 0)}</td>
              <td style="text-align:right;">${formatter.format(sale.paidAmount ?? 0)}</td>
              <td style="text-align:right;">${formatter.format(creditUsed)}</td>
              <td style="text-align:right;">${formatter.format(sale.remainingBalance ?? 0)}</td>
              <td style="text-align:right;">${itemsCount}</td>
              <td>${sale.paymentMethod ?? ''}</td>
              <td>${itemDetails}</td>
            </tr>
          `;
        })
        .join('');

      const dueCreditRows = filteredSales
        .filter((sale) => (sale.creditUsed ?? 0) > 0 || (sale.remainingBalance ?? 0) > 0)
        .map((sale) => {
          const formattedTime = formatTimeForDisplay(sale.time);
          const itemDetails = Array.isArray(sale.cart)
            ? sale.cart
                .slice(0, 2)
                .map((item: any) => {
                  const qty = item.quantity ?? 0;
                  const label = item.variantName ? `${item.name} - ${item.variantName}` : item.name;
                  return `${label} x${qty}`;
                })
                .join(', ') + (sale.cart.length > 2 ? ` +${sale.cart.length - 2}` : '')
            : '';
          return `
            <tr>
              <td>${formatDateForDisplay(sale.date)} ${formattedTime}</td>
              <td>${sale.customer?.name ?? t('Walk-in Customer')}</td>
              <td style="text-align:right;">${formatter.format(sale.total ?? 0)}</td>
              <td style="text-align:right;">${formatter.format(sale.paidAmount ?? 0)}</td>
              <td style="text-align:right;">${formatter.format(sale.creditUsed ?? 0)}</td>
              <td style="text-align:right;">${formatter.format(sale.remainingBalance ?? 0)}</td>
              <td>${sale.paymentMethod ?? ''}</td>
              <td>${itemDetails}</td>
            </tr>
          `;
        })
        .join('');

      const creditHistoryRows = creditHistory
        .map((entry) => {
          const typeLabel =
            entry.type === 'add' ? t('Added') : entry.type === 'deduct' ? t('Deducted') : t('Used');
          const formattedTime = formatTimeForDisplay(entry.time);
          return `
            <tr>
              <td>${formatDateForDisplay(entry.date)} ${formattedTime}</td>
              <td>${typeLabel}</td>
              <td style="text-align:right;">${formatter.format(entry.amount ?? 0)}</td>
              <td>${entry.description ?? ''}</td>
              <td>${entry.linkedSaleId ? `${t('Sale')} #${entry.linkedSaleId}` : ''}</td>
            </tr>
          `;
        })
        .join('');

      const creditTotals = creditHistory.reduce(
        (acc, entry) => {
          const amount = Number(entry.amount ?? 0);
          if (entry.type === 'add') acc.add += amount;
          else if (entry.type === 'deduct') acc.deduct += amount;
          else acc.use += amount;
          return acc;
        },
        { add: 0, deduct: 0, use: 0 }
      );

      const totals = filteredSales.reduce(
        (acc, sale) => {
          acc.total += Number(sale.total ?? 0);
          acc.paid += Number(sale.paidAmount ?? 0);
          acc.credit += Number(sale.creditUsed ?? 0);
          acc.balance += Number(sale.remainingBalance ?? 0);
          acc.items += Number(
            sale.items ??
              sale.cart?.reduce((sum: number, item: any) => sum + (item.quantity ?? 0), 0) ??
              0
          );
          return acc;
        },
        { total: 0, paid: 0, credit: 0, balance: 0, items: 0 }
      );

      const html = `
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; color: #111; }
              h2 { margin: 0 0 12px 0; }
              .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 12px 0; }
              .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; background: #f8fafc; }
              .label { font-size: 12px; color: #6b7280; }
              .value { font-weight: 700; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
              th, td { border: 1px solid #e5e7eb; padding: 6px; text-align: left; }
              th { background: #f8fafc; }
              tfoot td { font-weight: 700; }
            </style>
          </head>
          <body>
            <h2>${t('Sales History')}</h2>
            <div>${t('Customer')}: ${customer?.name ?? t('All Customers')}</div>
            <div class="summary">
              <div class="card"><div class="label">${t('Sales')}</div><div class="value">${filteredSales.length}</div></div>
              <div class="card"><div class="label">${t('Total')}</div><div class="value">${formatter.format(totals.total)}</div></div>
              <div class="card"><div class="label">${t('Paid')}</div><div class="value">${formatter.format(totals.paid)}</div></div>
              <div class="card"><div class="label">${t('Credit Used')}</div><div class="value">${formatter.format(totals.credit)}</div></div>
              <div class="card"><div class="label">${t('Balance')}</div><div class="value">${formatter.format(totals.balance)}</div></div>
              <div class="card"><div class="label">${t('Items')}</div><div class="value">${totals.items}</div></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>${t('Date/Time')}</th>
                  <th>${t('Customer')}</th>
                  <th style="text-align:right;">${t('Total')}</th>
                  <th style="text-align:right;">${t('Paid')}</th>
                  <th style="text-align:right;">${t('Credit Used')}</th>
                  <th style="text-align:right;">${t('Balance')}</th>
                  <th style="text-align:right;">${t('Items')}</th>
                  <th>${t('Method')}</th>
                  <th>${t('Details')}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="text-align:right;">${t('Totals')}</td>
                  <td style="text-align:right;">${formatter.format(totals.total)}</td>
                  <td style="text-align:right;">${formatter.format(totals.paid)}</td>
                  <td style="text-align:right;">${formatter.format(totals.credit)}</td>
                  <td style="text-align:right;">${formatter.format(totals.balance)}</td>
                  <td style="text-align:right;">${totals.items}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            ${
              dueCreditRows
                ? `<h3 style="margin-top:16px;">${t('Due / Credit')}</h3>
                   <table>
                     <thead>
                       <tr>
                         <th>${t('Date/Time')}</th>
                         <th>${t('Customer')}</th>
                         <th style="text-align:right;">${t('Total')}</th>
                         <th style="text-align:right;">${t('Paid')}</th>
                         <th style="text-align:right;">${t('Credit Used')}</th>
                         <th style="text-align:right;">${t('Balance')}</th>
                         <th>${t('Method')}</th>
                         <th>${t('Details')}</th>
                       </tr>
                    </thead>
                    <tbody>${dueCreditRows}</tbody>
                  </table>`
                : ''
            }
            ${
              creditHistoryRows
                ? `<h3 style="margin-top:16px;">${t('Credit History')}</h3>
                   <table>
                     <thead>
                       <tr>
                         <th>${t('Date/Time')}</th>
                         <th>${t('Type')}</th>
                         <th style="text-align:right;">${t('Amount')}</th>
                         <th>${t('Description')}</th>
                         <th>${t('Linked')}</th>
                       </tr>
                     </thead>
                     <tbody>${creditHistoryRows}</tbody>
                     <tfoot>
                       <tr>
                         <td colspan="5" style="text-align:left; font-weight:700;">
                           ${t('Added')}: ${formatter.format(creditTotals.add)} | ${t('Deducted')}: ${formatter.format(creditTotals.deduct)} | ${t('Used')}: ${formatter.format(creditTotals.use)}
                         </td>
                       </tr>
                     </tfoot>
                   </table>`
                : ''
            }
          </body>
        </html>
      `;

      const pdf = await createReceiptPdf(html);
      await shareReceipt(pdf.uri);
    } catch (error) {
      console.error('Failed to share all sales as PDF', error);
      Toast.show({ type: 'error', text1: t('Unable to share PDF receipt') });
    }
  };

  const handleEditCreditEntry = () => {
    Toast.show({
      type: 'info',
      text1: t('Edit coming soon'),
    });
  };

  const handleDeleteCreditEntry = (entryId: number) => {
    Alert.alert(
      t('Delete credit entry'),
      t('Are you sure you want to delete this credit entry?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCreditTransaction(entryId);
              Toast.show({ type: 'success', text1: t('Credit entry deleted') });
            } catch (error) {
              console.error('Failed to delete credit transaction', error);
              Toast.show({ type: 'error', text1: t('Something went wrong') });
            }
          },
        },
      ]
    );
  };

  const handleDeleteSale = (saleId: number) => {
    Alert.alert(
      t('Delete Sale'),
      t('Are you sure you want to delete this sale?'),
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
              Toast.show({ type: 'error', text1: t('Something went wrong') });
            }
          },
        },
      ]
    );
  };

  const renderForm = () => (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.formContent,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.formTitle}>
          {mode === 'edit' ? t('Edit Customer') : t('Add Customer')}
        </Text>

        <View style={styles.avatarSection}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person-circle-outline" size={88} color="#9ca3af" />
            </View>
          )}
          <View style={styles.avatarButtons}>
            <Button
              variant="outline"
              style={styles.avatarButton}
              onPress={pickImage}
            >
              {t('Pick Image')}
            </Button>
            <Button style={styles.avatarButton} onPress={takePhoto}>
              {t('Take Photo')}
            </Button>
          </View>
        </View>

        <Input
          label={t('Name')}
          value={name}
          onChangeText={setName}
          placeholder="Ali Ahmed"
          error={errors.name}
        />

        <Input
          label={t('Phone Number')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="03XXXXXXXXX"
          error={errors.phone}
        />

        <Input
          label={t('Email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          placeholder="customer@example.com"
        />

        <Input
          label={t('Note')}
          value={note}
          onChangeText={setNote}
          placeholder={t('Add an optional note')}
          multiline
          numberOfLines={3}
          style={styles.multiline}
        />

        <Input
          label={t('Starting Credit')}
          value={creditInput}
          onChangeText={setCreditInput}
          keyboardType="numeric"
          placeholder="0"
        />

        <View style={styles.formActions}>
          <Button
            variant="outline"
            onPress={handleCancel}
            style={styles.formActionButton}
          >
            {mode === 'edit' ? t('Cancel') : t('Cancel')}
          </Button>
          <Button
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving}
            style={styles.formActionButton}
          >
            {mode === 'edit' ? t('Save Changes') : t('Create Customer')}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="alert-circle-outline" size={48} color="#94a3b8" />
      <Text style={styles.emptyStateTitle}>{t('Customer not found')}</Text>
      <Text style={styles.emptyStateSubtitle}>
        {t('This customer may have been deleted or never existed.')}
      </Text>
      <Button variant="outline" style={styles.emptyStateAction} onPress={() => router.back()}>
        {t('Close')}
      </Button>
    </View>
  );

  const renderView = () => {
    if (!customer) {
      return renderEmptyState();
    }

    const filterOptions = [
      { key: 'all' as const, label: t('All') },
      { key: 'paid' as const, label: t('Paid') },
      { key: 'due' as const, label: t('Due') },
      { key: 'partial' as const, label: t('Partial') },
    ];

    const activeFilterLabel =
      filterOptions.find((option) => option.key === statusFilter)?.label ?? t('All');


    return (
      <ScrollView
        contentContainerStyle={[
          styles.detailContent,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Customer Image at the top */}
        <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 8 }}>
          {customer.imageUri ? (
            <Image source={{ uri: customer.imageUri }} style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 8 }} />
          ) : (
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#e5e7eb', marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person-circle-outline" size={80} color="#9ca3af" />
            </View>
          )}
        </View>

        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('Search by sale ID...')}
              placeholderTextColor="#94a3b8"
              value={saleQuery}
              onChangeText={setSaleQuery}
              returnKeyType="search"
            />
          </View>

          <TouchableOpacity
            style={styles.filterHeader}
            activeOpacity={0.7}
            onPress={() => setIsFilterOpen((prev) => !prev)}
          >
            <View style={styles.filterHeaderLeft}>
              <Ionicons name="funnel-outline" size={18} color="#111827" />
              <Text style={styles.filterLabel}>{t('Filter')}</Text>
            </View>
            <View style={styles.filterActivePill}>
              <Text style={styles.filterActiveText}>{activeFilterLabel}</Text>
            </View>
            <Ionicons
              name={isFilterOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#111827"
            />
          </TouchableOpacity>

          {isFilterOpen ? (
            <View style={styles.filterDropdown}>
              <Text style={styles.filterDropdownLabel}>
                {t('Filter by status')}
              </Text>
              {filterOptions.map((option, index) => {
                const isActive = statusFilter === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.filterOption,
                      index === 0 && styles.filterOptionFirst,
                      isActive && styles.filterOptionActive,
                    ]}
                    onPress={() => {
                      handleSelectFilter(option.key);
                      setIsFilterOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        isActive && styles.filterOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {isActive && (
                      <Ionicons name="checkmark" size={18} color="#2563eb" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            {/* Customer Image (if available) */}
            {customer.imageUri ? (
              <View style={{ marginRight: 12 }}>
                <Image
                  source={{ uri: customer.imageUri }}
                  style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#e5e7eb' }}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#e5e7eb', marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person-circle-outline" size={36} color="#9ca3af" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{customer.name}</Text>
              <Text style={styles.profileSubtitle}>{t('Customer Account')}</Text>
            </View>
            <Button
              variant="outline"
              onPress={() => setMode('edit')}
              style={styles.editButton}
            >
              {t('Edit Customer')}
            </Button>
          </View>

          <View style={styles.profileInfoRow}>
            <Ionicons name="call-outline" size={18} color="#2563eb" />
            <Text style={styles.profileInfoText}>{customer.phone}</Text>
          </View>
          {customer.email ? (
            <View style={styles.profileInfoRow}>
              <Ionicons name="mail-outline" size={18} color="#2563eb" />
              <Text style={styles.profileInfoText}>{customer.email}</Text>
            </View>
          ) : null}

          <View style={[styles.profileInfoRow, styles.creditRow]}>
            <Ionicons name="wallet-outline" size={18} color="#16a34a" />
            <Text style={styles.profileInfoText}>{t('Available Credit')}</Text>
            <View style={styles.creditSpacer} />
            <Text style={styles.creditValue}>{formatCurrency(customer.credit)}</Text>
          </View>

          <View style={styles.creditActions}>
            <Button style={styles.addCreditButton} onPress={openCreditModal}>
              <View style={styles.addCreditContent}>
                <Ionicons name="add" size={18} color="#ffffff" />
                <Text style={styles.addCreditLabel}>{t('Add Credit')}</Text>
              </View>
            </Button>
            <Button
              variant={showHistoryPanel ? 'secondary' : 'outline'}
              style={styles.historyButton}
              onPress={() => setShowHistoryPanel((prev) => !prev)}
            >
              <View style={styles.historyButtonContent}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={showHistoryPanel ? '#0f172a' : '#1f2937'}
                />
                <Text style={styles.historyButtonLabel}>
                  {t('History')}
                </Text>
              </View>
            </Button>
          </View>
        </View>

        {showHistoryPanel ? (
          <View style={styles.creditHistorySection}>
            <View style={styles.creditHistoryHeader}>
              <Text style={styles.sectionTitle}>{t('Credit History')}</Text>
              <View style={styles.creditHistoryActions}>
                <Button
                  variant="outline"
                  style={styles.shareAllButton}
                  onPress={handleShareCreditHistoryText}
                >
                  <View style={styles.shareAllContent}>
                    <Ionicons
                      name="share-social-outline"
                      size={18}
                      color="#1f2937"
                      style={styles.shareAllIcon}
                    />
                    <Text style={styles.shareAllLabel}>{t('Share All')}</Text>
                  </View>
                </Button>
                <Button
                  variant="outline"
                  style={styles.shareAllButton}
                  onPress={handleShareCreditHistoryPdf}
                >
                  <View style={styles.shareAllContent}>
                    <Ionicons
                      name="document-text-outline"
                      size={18}
                      color="#1f2937"
                      style={styles.shareAllIcon}
                    />
                    <Text style={styles.shareAllLabel}>{t('PDF')}</Text>
                  </View>
                </Button>
                <TouchableOpacity
                  style={styles.shareAllIconButton}
                  onPress={handlePrintCreditHistory}
                  activeOpacity={0.7}
                >
                  <Ionicons name="print-outline" size={18} color="#1f2937" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeHistoryButton}
                  onPress={() => setShowHistoryPanel(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color="#111827" />
                </TouchableOpacity>
              </View>
            </View>

            {creditHistory.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Ionicons name="time-outline" size={36} color="#94a3b8" />
                <Text style={styles.historyEmptyText}>
                  {t('No credit history yet')}
                </Text>
              </View>
            ) : (
              creditHistory.map((entry) => {
                const amountStyles = [
                  styles.creditHistoryAmount,
                  entry.type === 'add'
                    ? styles.creditHistoryAmountAdd
                    : entry.type === 'deduct'
                    ? styles.creditHistoryAmountDeduct
                    : styles.creditHistoryAmountNeutral,
                ];

                const tagContainerStyle =
                  entry.type === 'add'
                    ? styles.creditHistoryTagAdd
                    : entry.type === 'deduct'
                    ? styles.creditHistoryTagDeduct
                    : styles.creditHistoryTagUse;

                const tagTextStyle =
                  entry.type === 'add'
                    ? styles.creditHistoryTagTextAdd
                    : entry.type === 'deduct'
                    ? styles.creditHistoryTagTextDeduct
                    : styles.creditHistoryTagTextUse;

                return (
                  <View key={entry.id} style={styles.creditHistoryCard}>
                    <View style={styles.creditHistoryMain}>
                      <View style={styles.creditHistoryInfo}>
                        <View style={styles.creditHistoryIcon}>
                          <Ionicons
                            name={
                              entry.type === 'add'
                                ? 'trending-up'
                                : entry.type === 'deduct'
                                ? 'trending-down'
                                : 'swap-vertical'
                            }
                            size={22}
                            color={
                              entry.type === 'add'
                                ? '#16a34a'
                                : entry.type === 'deduct'
                                ? '#dc2626'
                                : '#b45309'
                            }
                          />
                        </View>
                        <View style={styles.creditHistoryContent}>
                          <Text style={styles.creditHistoryTitle} numberOfLines={2}>
                            {entry.description || t('Credit History')}
                          </Text>
                          <View style={styles.creditHistoryMeta}>
                            <Ionicons name="calendar-outline" size={14} color="#64748b" />
                            <Text style={styles.creditHistoryTimestamp}>
                              {formatDateTime(entry.date, entry.time, t('at'))}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <Text style={amountStyles}>
                        {entry.type === 'add' ? '+' : '-'}
                        {formatCurrency(entry.amount)}
                      </Text>
                    </View>

                    <View style={styles.creditHistoryFooter}>
                      <View style={[styles.creditHistoryTag, tagContainerStyle]}>
                        <Text style={[styles.creditHistoryTagText, tagTextStyle]}>
                          {entry.type === 'add'
                            ? t('Added')
                            : entry.type === 'deduct'
                            ? t('Deducted')
                            : t('Used')}
                        </Text>
                      </View>
                      <View style={styles.creditHistoryActionsRow}>
                        <TouchableOpacity
                          style={[styles.creditHistoryAction, styles.creditHistoryActionShare]}
                          onPress={() => handleShareCreditEntry(entry)}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name="share-social-outline"
                            size={18}
                            color="#16a34a"
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.creditHistoryAction, styles.creditHistoryActionPrint]}
                          onPress={() => handlePrintCreditEntry(entry)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="print-outline" size={18} color="#2563eb" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.creditHistoryAction, styles.creditHistoryActionEdit]}
                          onPress={handleEditCreditEntry}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="pencil-outline" size={18} color="#2563eb" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.creditHistoryAction, styles.creditHistoryActionDelete]}
                          onPress={() => handleDeleteCreditEntry(entry.id)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={18} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={18} color="#2563eb" />
          <Text style={styles.infoBannerText}>
            {t('Showing all {count} transaction(s) for {name} (matched by name/phone)')
              .replace('{count}', String(customerSales.length))
              .replace('{name}', customer.name)}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardTotal]}>
            <Text style={styles.statLabel}>{t('Total Sales')}</Text>
            <Text style={styles.statValue}>{salesStats.totalSales}</Text>
          </View>
          <View style={[styles.statCard, styles.statCardValue]}>
            <Text style={styles.statLabel}>{t('Total Value')}</Text>
            <Text style={styles.statValue}>
              {formatCurrency(salesStats.totalValue)}
            </Text>
          </View>
          <View style={[styles.statCard, styles.statCardPending]}>
            <Text style={styles.statLabel}>{t('Pending')}</Text>
            <Text style={styles.statValue}>{salesStats.pendingCount}</Text>
          </View>
        </View>

        <View style={styles.salesHeaderRow}>
          <Text style={styles.sectionTitle}>{t('Sales History')}</Text>
          <View style={styles.shareAllRow}>
            <Button
              variant="outline"
              style={styles.shareAllButton}
              onPress={handleShareAll}
            >
              <View style={styles.shareAllContent}>
                <Ionicons
                  name="share-social-outline"
                  size={18}
                  color="#1f2937"
                  style={styles.shareAllIcon}
                />
                <Text style={styles.shareAllLabel}>{t('Share All')}</Text>
              </View>
            </Button>
            <Button
              variant="outline"
              style={styles.shareAllButton}
              onPress={handleShareAllPdf}
            >
              <View style={styles.shareAllContent}>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color="#1f2937"
                  style={styles.shareAllIcon}
                />
                <Text style={styles.shareAllLabel}>{t('PDF')}</Text>
              </View>
            </Button>
          </View>
        </View>

        {filteredSales.length === 0 ? (
          <View style={styles.salesEmptyState}>
            <Ionicons name="document-text-outline" size={40} color="#94a3b8" />
            <Text style={styles.salesEmptyTitle}>{t('No sales recorded yet')}</Text>
            <Text style={styles.salesEmptySubtitle}>
              {t('Sales linked to this customer will appear here.')}
            </Text>
          </View>
        ) : (
          filteredSales.map((sale) => {
            const creditUsed = Number(sale.creditUsed ?? 0);
            const paidAmount = Number(sale.paidAmount ?? 0);
            const paymentLabel =
              creditUsed > 0 && paidAmount <= 0 ? t('Customer Credit') : sale.paymentMethod;

            return (
              <View key={sale.id} style={styles.saleCard}>
                <View style={styles.saleHeader}>
                  <View>
                    <Text style={styles.saleTitle}>
                      {sale.customer?.name || t('Walk-in Customer')}
                    </Text>
                    <View style={styles.saleMetaRow}>
                      <Ionicons name="calendar-outline" size={14} color="#64748b" />
                      <Text style={styles.saleTimestamp}>
                        {formatDateTime(sale.date, sale.time, t('at'))}
                      </Text>
                    </View>
                  </View>
                  <Badge
                    variant={
                      sale.status === 'Paid'
                        ? 'success'
                        : sale.status === 'Due'
                        ? 'danger'
                        : sale.status === 'Partially Paid'
                        ? 'warning'
                        : 'secondary'
                    }
                  >
                    {sale.status === 'Partially Paid' ? t('Partial') : t(sale.status)}
                  </Badge>
                </View>

                <View style={styles.saleSummaryRow}>
                  <View>
                    <Text style={styles.saleAmount}>{formatCurrency(sale.total)}</Text>
                    <Text style={styles.saleItemsMeta}>
                      {sale.items} {t('items')}
                    </Text>
                  </View>
                  <View style={styles.saleMetaRight}>
                    <View style={styles.paymentChip}>
                      <Text style={styles.paymentChipText}>{paymentLabel}</Text>
                    </View>
                    {creditUsed > 0 ? (
                      <Text style={styles.creditUsedText}>
                        {t('Credit Used')}: {formatCurrency(creditUsed)}
                      </Text>
                    ) : null}
                    {sale.remainingBalance > 0 ? (
                      <Text style={styles.saleDue}>
                        {t('Due')}: {formatCurrency(sale.remainingBalance)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.saleFooter}>
                  <TouchableOpacity
                    style={styles.saleAction}
                    onPress={() => handleShareSale(sale)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="share-social-outline"
                      size={18}
                      color="#2563eb"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saleAction}
                    onPress={() => handlePrintSale(sale)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="print-outline" size={18} color="#2563eb" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saleAction}
                    onPress={() => handleShareSalePdf(sale)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={18}
                      color="#2563eb"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saleAction}
                    onPress={() => handleDeleteSale(sale.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

      </ScrollView>
    );
  };

  // ...existing code...
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {mode === 'view' ? renderView() : renderForm()}

      <Modal
        visible={showCreditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('Add Credit')}</Text>
            <Text style={styles.modalSubtitle}>
              {t('Add funds to the customer credit balance.')}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('Enter amount')}
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={creditAmount}
              onChangeText={(value) => {
                setCreditAmount(value);
                setCreditError('');
              }}
            />
            <TextInput
              style={[styles.modalInput, styles.modalNoteInput]}
              placeholder={t('Add a note (optional)')}
              placeholderTextColor="#9ca3af"
              value={creditNote}
              onChangeText={setCreditNote}
              multiline
            />
            {creditError ? <Text style={styles.modalError}>{creditError}</Text> : null}

            <View style={styles.modalActions}>
              <Button
                variant="outline"
                style={styles.modalButton}
                onPress={() => setShowCreditModal(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                style={styles.modalButton}
                onPress={handleAddCredit}
                loading={isCreditSaving}
                disabled={isCreditSaving}
              >
                {t('Add Credit')}
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
    backgroundColor: '#f3f4f6',
  },
  flex: {
    flex: 1,
  },
  formContent: {
    padding: 20,
    gap: 16,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  formActionButton: {
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 10,
  },
  avatarImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  avatarPlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  avatarButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  avatarButton: {
    flex: 1,
  },
  detailContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 20,
  },
  searchSection: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
    gap: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    backgroundColor: '#f8fafc',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterActivePill: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  filterActiveText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  filterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  filterDropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  filterDropdownLabel: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  filterOptionFirst: {
    borderTopWidth: 0,
  },
  filterOptionActive: {
    backgroundColor: '#eef2ff',
  },
  filterOptionText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  filterOptionTextActive: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  profileCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  profileSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748b',
  },
  editButton: {
    borderRadius: 10,
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  profileInfoText: {
    fontSize: 15,
    color: '#0f172a',
  },
  creditRow: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 4,
  },
  creditSpacer: {
    flex: 1,
  },
  creditValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16a34a',
  },
  creditActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  addCreditButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 10,
  },
  addCreditContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addCreditLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  historyButton: {
    width: 120,
    borderRadius: 10,
  },
  historyButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  historyButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  creditHistorySection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 20,
    gap: 16,
  },
  creditHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditHistoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closeHistoryButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditHistoryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 16,
    gap: 12,
  },
  creditHistoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditHistoryMain: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  creditHistoryInfo: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  creditHistoryContent: {
    flex: 1,
  },
  creditHistoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  creditHistoryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  creditHistoryTimestamp: {
    fontSize: 12,
    color: '#64748b',
  },
  creditHistoryAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  creditHistoryAmountAdd: {
    color: '#16a34a',
  },
  creditHistoryAmountDeduct: {
    color: '#dc2626',
  },
  creditHistoryAmountNeutral: {
    color: '#7c3aed',
  },
  creditHistoryFooter: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  creditHistoryTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  creditHistoryTagAdd: {
    backgroundColor: '#dcfce7',
  },
  creditHistoryTagDeduct: {
    backgroundColor: '#fee2e2',
  },
  creditHistoryTagUse: {
    backgroundColor: '#fef3c7',
  },
  creditHistoryTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  creditHistoryTagTextAdd: {
    color: '#15803d',
  },
  creditHistoryTagTextDeduct: {
    color: '#b91c1c',
  },
  creditHistoryTagTextUse: {
    color: '#b45309',
  },
  creditHistoryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creditHistoryAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  creditHistoryActionShare: {
    borderColor: '#bbf7d0',
  },
  creditHistoryActionPrint: {
    borderColor: '#bfdbfe',
  },
  creditHistoryActionEdit: {
    borderColor: '#bfdbfe',
  },
  creditHistoryActionDelete: {
    borderColor: '#fecdd3',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  statCardTotal: {
    backgroundColor: '#eef2ff',
    borderColor: '#e0e7ff',
  },
  statCardValue: {
    backgroundColor: '#ecfdf5',
    borderColor: '#d1fae5',
  },
  statCardPending: {
    backgroundColor: '#fef2f2',
    borderColor: '#fee2e2',
  },
  statLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1e3a8a',
  },
  salesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  shareAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareAllButton: {
    borderRadius: 10,
    height: 42,
  },
  shareAllIconButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAllContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shareAllIcon: {
    marginRight: 2,
  },
  shareAllLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  salesEmptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  salesEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  salesEmptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  saleCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 18,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  saleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  saleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  saleTimestamp: {
    fontSize: 12,
    color: '#64748b',
  },
  saleSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  saleItemsMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  saleMetaRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  paymentChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
  },
  paymentChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  creditUsedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  saleDue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b91c1c',
  },
  saleFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  saleAction: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  historyModalCard: {
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  modalNoteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalError: {
    fontSize: 13,
    color: '#b91c1c',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
  },
  historyModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyScroll: {
    maxHeight: 320,
  },
  historyItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 12,
    gap: 6,
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  historyAmountAdd: {
    color: '#15803d',
  },
  historyAmountDeduct: {
    color: '#b91c1c',
  },
  historyTimestamp: {
    fontSize: 12,
    color: '#64748b',
  },
  historyDescription: {
    fontSize: 13,
    color: '#0f172a',
  },
  historyEmpty: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 10,
  },
  historyEmptyText: {
    fontSize: 14,
    color: '#64748b',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptyStateSubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  emptyStateAction: {
    marginTop: 8,
  },
});
