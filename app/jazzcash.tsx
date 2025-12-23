import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { getTextFromFrame } from 'expo-text-recognition';
import * as FileSystem from 'expo-file-system/legacy';

import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useShop } from '../contexts/ShopContext';
import { shareTextViaWhatsApp } from '../lib/share';
import { formatDateForDisplay } from '../lib/date';
import { database } from '../lib/database';
import * as DocumentPicker from 'expo-document-picker';

type DataShape = ReturnType<typeof useData>;
type CustomerRecord = DataShape['customers'][number];
type JazzCashTransaction = DataShape['jazzCashTransactions'][number];

type JazzStats = {
  sent: number;
  received: number;
  count: number;
  lastActivity: string | null;
};

const formatCurrency = (value: number) =>
  `Rs. ${Number(value || 0).toLocaleString()}`;

const normalizePhone = (value?: string | null) =>
  value ? value.replace(/\D/g, '') : '';

const formatDateTime = (iso?: string | null) => {
  if (!iso) {
    return '--';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return formatDateForDisplay(iso);
  }
  const formattedDate = formatDateForDisplay(date);
  const formattedTime = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formattedDate} ${formattedTime}`;
};

const formatDateLabel = (iso?: string | null) => {
  if (!iso) {
    return formatDateForDisplay(new Date());
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return formatDateForDisplay(iso);
  }
  return formatDateForDisplay(date);
};

type ReceiptParty = {
  name?: string;
  phone?: string;
};

type ReceiptAutoFill = {
  amount?: number;
  toName?: string;
  toPhone?: string;
  fromName?: string;
  fromPhone?: string;
};

const sanitizeMsisdn = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return undefined;
  }
  if (digits.startsWith('0092') && digits.length >= 14) {
    return `0${digits.slice(-10)}`;
  }
  if (digits.startsWith('92') && digits.length >= 12) {
    return `0${digits.slice(-10)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }
  if (digits.length === 10 && digits.startsWith('3')) {
    return `0${digits}`;
  }
  return digits;
};

const normalizeLabelCandidate = (value: string) =>
  value
    .toLowerCase()
    .replace(/[:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const disallowedNameTokens = new Set([
  'transaction successful',
  'transaction',
  'transferred to jazzcash',
  'securely paid via',
  'fee',
  'rs',
  'tid',
  'jazzcash',
  'on november',
  'sent',
  'received',
]);

const isLikelyNameLine = (value?: string) => {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed || /\d/.test(trimmed)) {
    return false;
  }
  const normalized = normalizeLabelCandidate(trimmed);
  if (!normalized) {
    return false;
  }
  if (disallowedNameTokens.has(normalized)) {
    return false;
  }
  return true;
};

const findNameBeforeIndex = (lines: string[], start: number) => {
  for (let i = start - 1; i >= 0; i -= 1) {
    if (isLikelyNameLine(lines[i])) {
      return lines[i].trim();
    }
  }
  return undefined;
};

const parsePartyFromLines = (lines: string[], label: 'to' | 'from'): ReceiptParty => {
  const normalizedLabel = label.toLowerCase();
  const oppositeLabel = label === 'to' ? 'from' : 'to';
  const labelIndex = lines.findIndex((line) => normalizeLabelCandidate(line) === normalizedLabel);

  const considerRange = (start: number) => {
    for (let i = start; i < lines.length; i += 1) {
      const normalizedCandidate = normalizeLabelCandidate(lines[i]);
      if (normalizedCandidate === oppositeLabel) {
        break;
      }
      const phoneMatch = lines[i].match(/(\+?92|0)3\d{9}/);
      if (phoneMatch) {
        const phone = sanitizeMsisdn(phoneMatch[0]);
        if (!phone) {
          continue;
        }
        const residual = lines[i].replace(phoneMatch[0], '').trim();
        const name = residual || findNameBeforeIndex(lines, i);
        return { name: name || undefined, phone };
      }
    }
    return {};
  };

  if (labelIndex >= 0) {
    return considerRange(labelIndex + 1);
  }

  const inline = lines.findIndex((line) => {
    const collapsed = normalizeLabelCandidate(line);
    return collapsed.startsWith(`${normalizedLabel} `);
  });

  if (inline >= 0) {
    return considerRange(inline);
  }

  return {};
};

const extractPartyFromText = (
  text: string,
  lines: string[],
  label: 'to' | 'from'
): ReceiptParty => {
  const pattern = new RegExp(
    `${label}\\s*[:\\-]?\\s*([A-Za-z.'\\-\\s]+?)\\s+((?:\\+?92|0)3\\d{9})`,
    'i'
  );
  const match = text.match(pattern);
  if (match) {
    return {
      name: match[1].trim(),
      phone: sanitizeMsisdn(match[2]) ?? undefined,
    };
  }
  const fallback = parsePartyFromLines(lines, label);
  if (fallback.name || fallback.phone) {
    return fallback;
  }
  return {};
};

const parsePartyPairsSequentially = (lines: string[]): ReceiptParty[] => {
  const pairs: ReceiptParty[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const phoneMatch = lines[i].match(/(\+?92|0)3\d{9}/);
    if (!phoneMatch) {
      continue;
    }
    const phone = sanitizeMsisdn(phoneMatch[0]);
    if (!phone) {
      continue;
    }
    const residual = lines[i].replace(phoneMatch[0], '').trim();
    const name = residual || findNameBeforeIndex(lines, i);
    pairs.push({
      name: name || undefined,
      phone,
    });
  }
  return pairs;
};

const parseAmountFromLines = (lines: string[]) => {
  for (const line of lines) {
    const match = line.match(/(?:rs\.?|pkr)\s*([0-9.,]+)/i);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!Number.isNaN(value)) {
        return value;
      }
    }
  }
  const fallback = lines.join(' ').match(/([0-9]+(?:\.[0-9]+)?)\s*(?:rs|pkr)/i);
  if (fallback) {
    const value = parseFloat(fallback[1].replace(/,/g, ''));
    if (!Number.isNaN(value)) {
      return value;
    }
  }
  return undefined;
};

const parseJazzCashReceiptLines = (rawLines: string[]): ReceiptAutoFill => {
  const normalizedLines = rawLines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (!normalizedLines.length) {
    return {};
  }
  if (__DEV__) {
    console.log('[JazzCash OCR] Lines:', normalizedLines);
  }
  const combinedText = normalizedLines.join(' ');
  const sequentialPairs = parsePartyPairsSequentially(normalizedLines);
  if (__DEV__) {
    console.log('[JazzCash OCR] Sequential pairs:', sequentialPairs);
  }
  const toPrimary = extractPartyFromText(combinedText, normalizedLines, 'to');
  const fromPrimary = extractPartyFromText(combinedText, normalizedLines, 'from');
  const toParty =
    (toPrimary.name || toPrimary.phone ? toPrimary : sequentialPairs[0]) || {};
  const fromFallbackCandidate = sequentialPairs.find(
    (pair) => pair.phone && pair.phone !== toParty.phone
  );
  let fromParty: ReceiptParty = {};
  const hasPrimary = fromPrimary.name || fromPrimary.phone;
  const isSameAsTo =
    Boolean(fromPrimary.phone && toParty.phone && fromPrimary.phone === toParty.phone);
  if (hasPrimary && !isSameAsTo) {
    fromParty = fromPrimary;
  } else if (fromFallbackCandidate) {
    fromParty = fromFallbackCandidate;
  }
  const amount = parseAmountFromLines(normalizedLines);
  if (__DEV__) {
    console.log('[JazzCash OCR] Parsed parties:', {
      toParty,
      fromParty,
      amount,
    });
  }

  return {
    amount,
    toName: toParty.name,
    toPhone: toParty.phone,
    fromName: fromParty.name,
    fromPhone: fromParty.phone,
  };
};

export default function JazzCashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const {
    customers,
    jazzCashTransactions,
    addJazzCashTransaction,
    deleteJazzCashTransaction,
    deleteCustomer,
    jazzCashProfitSettings,
    saveJazzCashProfitSettings,
    refreshData,
  } = useData();
  const { profile: shopProfile } = useShop();

  const [searchQuery, setSearchQuery] = useState('');
  const [isJazzCashModalVisible, setIsJazzCashModalVisible] = useState(false);
  const [jazzCashFlow, setJazzCashFlow] = useState<'send' | 'receive'>('send');
  const [jazzCashCustomerName, setJazzCashCustomerName] = useState('');
  const [jazzCashCustomerPhone, setJazzCashCustomerPhone] = useState('');
  const [jazzCashCustomerCnic, setJazzCashCustomerCnic] = useState('');
  const [jazzCashAmount, setJazzCashAmount] = useState('');
  const [jazzCashNote, setJazzCashNote] = useState('');
  const [isReceiptScanning, setIsReceiptScanning] = useState(false);
  const [receiptAutoFillDetails, setReceiptAutoFillDetails] =
    useState<ReceiptAutoFill | null>(null);
  const [receiptScanError, setReceiptScanError] = useState<string | null>(null);
  const [quickFlow, setQuickFlow] = useState<'send' | 'receive'>('send');
  const [showPermanentSection, setShowPermanentSection] = useState(false);
  const [showRecentSection, setShowRecentSection] = useState(true);
  const [showNetBalance, setShowNetBalance] = useState(true);
  const [isQuickAdjustVisible, setIsQuickAdjustVisible] = useState(false);
  const [quickAmountInput, setQuickAmountInput] = useState('');
  const [quickNoteInput, setQuickNoteInput] = useState('');
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [isQuickHistoryVisible, setIsQuickHistoryVisible] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isBackupModalVisible, setIsBackupModalVisible] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [isRestoreBusy, setIsRestoreBusy] = useState(false);
  const [isCnicScannerVisible, setIsCnicScannerVisible] = useState(false);
  const [canScanCnic, setCanScanCnic] = useState(true);
  const [cnicCameraPermission, requestCnicCameraPermission] =
    useCameraPermissions();
  const cnicCameraRef = useRef<CameraView>(null);

  const jazzNameRef = useRef<TextInput>(null);
  const jazzPhoneRef = useRef<TextInput>(null);
  const jazzCnicRef = useRef<TextInput>(null);
  const jazzAmountRef = useRef<TextInput>(null);
  const jazzNoteRef = useRef<TextInput>(null);
  const quickAmountRef = useRef<TextInput>(null);
  const quickNoteRef = useRef<TextInput>(null);
  const [isProfitModalVisible, setIsProfitModalVisible] = useState(false);
  const [sendProfitMode, setSendProfitMode] = useState<'flat' | 'percent'>(
    jazzCashProfitSettings.send.mode
  );
  const [sendProfitValue, setSendProfitValue] = useState(
    String(jazzCashProfitSettings.send.value ?? '')
  );
  const [receiveProfitMode, setReceiveProfitMode] = useState<'flat' | 'percent'>(
    jazzCashProfitSettings.receive.mode
  );
  const [receiveProfitValue, setReceiveProfitValue] = useState(
    String(jazzCashProfitSettings.receive.value ?? '')
  );
  const [isSavingProfit, setIsSavingProfit] = useState(false);

  useEffect(() => {
    if (!isQuickAdjustVisible) {
      return;
    }
    const timer = setTimeout(() => {
      quickAmountRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [isQuickAdjustVisible]);

  useEffect(() => {
    if (!isProfitModalVisible) {
      return;
    }
    setSendProfitMode(jazzCashProfitSettings.send.mode);
    setSendProfitValue(
      jazzCashProfitSettings.send.value > 0
        ? String(jazzCashProfitSettings.send.value)
        : ''
    );
    setReceiveProfitMode(jazzCashProfitSettings.receive.mode);
    setReceiveProfitValue(
      jazzCashProfitSettings.receive.value > 0
        ? String(jazzCashProfitSettings.receive.value)
        : ''
    );
  }, [isProfitModalVisible, jazzCashProfitSettings]);

  const calculateProfitForFlow = useCallback(
    (rawAmount: number, flow: 'send' | 'receive') => {
      const baseAmount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
      const config =
        flow === 'send' ? jazzCashProfitSettings.send : jazzCashProfitSettings.receive;
      const profitValue = Number(config.value) || 0;
      let profitAmount = 0;
      if (baseAmount > 0 && profitValue > 0) {
        profitAmount = config.mode === 'percent' ? (baseAmount * profitValue) / 100 : profitValue;
      }
      return {
        baseAmount,
        profitAmount,
        totalAmount: baseAmount + profitAmount,
      };
    },
    [jazzCashProfitSettings]
  );

  const applyReceiptAutoFill = useCallback(
    (details: ReceiptAutoFill | null, flow: 'send' | 'receive', force = false) => {
      if (!details) {
        return;
      }
      if (details.amount) {
        setJazzCashAmount((prev) =>
          force || !prev.trim() ? String(details.amount) : prev
        );
      }
      const nextName = flow === 'send' ? details.toName : details.fromName;
      const nextPhone = flow === 'send' ? details.toPhone : details.fromPhone;
      if (nextName) {
        setJazzCashCustomerName((prev) =>
          force || !prev.trim() ? nextName : prev
        );
      }
      if (nextPhone) {
        setJazzCashCustomerPhone((prev) =>
          force || !prev.trim() ? nextPhone : prev
        );
      }
    },
    []
  );

  const previousFlowRef = useRef<'send' | 'receive'>(jazzCashFlow);

  useEffect(() => {
    if (!receiptAutoFillDetails) {
      return;
    }
    const isFlowChange = previousFlowRef.current !== jazzCashFlow;
    applyReceiptAutoFill(receiptAutoFillDetails, jazzCashFlow, isFlowChange);
    previousFlowRef.current = jazzCashFlow;
  }, [applyReceiptAutoFill, jazzCashFlow, receiptAutoFillDetails]);

  const quickProfitPreview = useMemo(
    () => calculateProfitForFlow(Number(quickAmountInput), quickFlow),
    [quickAmountInput, quickFlow, calculateProfitForFlow]
  );

  const formProfitPreview = useMemo(
    () => calculateProfitForFlow(Number(jazzCashAmount), jazzCashFlow),
    [jazzCashAmount, jazzCashFlow, calculateProfitForFlow]
  );

  const ensureReceiptPermissions = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        t('Permission needed'),
        t('Allow photo access to scan JazzCash receipts.')
      );
      return false;
    }
    return true;
  }, [t]);

  const handlePickJazzCashReceipt = useCallback(async () => {
    if (isReceiptScanning) {
      return;
    }
    const hasPermission = await ensureReceiptPermissions();
    if (!hasPermission) {
      return;
    }
    try {
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 1,
        base64: false,
        exif: false,
      });
      if (pickerResult.canceled) {
        return;
      }
      const asset = pickerResult.assets?.[0];
      if (!asset?.uri) {
        Toast.show({
          type: 'error',
          text1: t('Unable to open image'),
          text2: t('Try again with a different receipt screenshot.'),
        });
        return;
      }
      setIsReceiptScanning(true);
      setReceiptScanError(null);
      const detectedLines = await getTextFromFrame(asset.uri, false);
      if (!detectedLines?.length) {
        setReceiptAutoFillDetails(null);
        setReceiptScanError(t('No readable text was found on the slip.'));
        return;
      }
      const parsed = parseJazzCashReceiptLines(detectedLines);
      const hasData =
        Boolean(parsed.amount) ||
        Boolean(parsed.toName) ||
        Boolean(parsed.toPhone) ||
        Boolean(parsed.fromName) ||
        Boolean(parsed.fromPhone);
      if (!hasData) {
        setReceiptAutoFillDetails(null);
        setReceiptScanError(t('Could not find JazzCash details in the slip.'));
        return;
      }
      setReceiptAutoFillDetails(parsed);
      applyReceiptAutoFill(parsed, jazzCashFlow, true);
      Toast.show({
        type: 'success',
        text1: t('Receipt scanned'),
        text2:
          jazzCashFlow === 'send'
            ? t('Filled receiver details automatically.')
            : t('Filled sender details automatically.'),
      });
    } catch (error) {
      console.error('Receipt scan failed', error);
      setReceiptAutoFillDetails(null);
      setReceiptScanError(t('Unable to scan slip. Try another photo.'));
      Toast.show({
        type: 'error',
        text1: t('Receipt scan failed'),
        text2: t('Please try again with a clearer receipt.'),
      });
    } finally {
      setIsReceiptScanning(false);
    }
  }, [
    applyReceiptAutoFill,
    ensureReceiptPermissions,
    isReceiptScanning,
    jazzCashFlow,
    t,
  ]);

  const ownerDisplayName = useMemo(
    () => shopProfile.ownerName?.trim() || t('Owner'),
    [shopProfile.ownerName, t]
  );

  const todayKey = useMemo(() => new Date().toDateString(), []);

  const isTransactionToday = useCallback(
    (iso?: string | null) => {
      if (!iso) {
        return false;
      }
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return false;
      }
      return date.toDateString() === todayKey;
    },
    [todayKey]
  );

  const totals = useMemo(() => {
    return jazzCashTransactions.reduce(
      (acc, txn) => {
        if (!isTransactionToday(txn.createdAt)) {
          return acc;
        }
        const amount = Number(txn.amount) || 0;
        const profit = Number(txn.profitAmount) || 0;
        if (txn.flow === 'send') {
          acc.sent += amount;
        } else {
          acc.received += amount;
        }
        acc.profit += profit;
        return acc;
      },
      { sent: 0, received: 0, profit: 0 }
    );
  }, [jazzCashTransactions, isTransactionToday]);

  const statsByPhone = useMemo(() => {
    const map = new Map<string, JazzStats>();
    jazzCashTransactions.forEach((txn) => {
      const key = normalizePhone(txn.customerPhone);
      if (!key) {
        return;
      }
      const existing: JazzStats = map.get(key) ?? {
        sent: 0,
        received: 0,
        count: 0,
        lastActivity: null,
      };
      if (txn.flow === 'send') {
        existing.sent += txn.amount;
      } else {
        existing.received += txn.amount;
      }
      existing.count += 1;
      if (
        !existing.lastActivity ||
        new Date(txn.createdAt).getTime() >
          new Date(existing.lastActivity).getTime()
      ) {
        existing.lastActivity = txn.createdAt;
      }
      map.set(key, existing);
    });
    return map;
  }, [jazzCashTransactions]);

  const customersWithStats = useMemo(() => {
    return customers
      .map((customer) => {
        const stats =
          statsByPhone.get(normalizePhone(customer.phone)) ?? ({
            sent: 0,
            received: 0,
            count: 0,
            lastActivity: null,
          } as JazzStats);
        return {
          ...customer,
          jazzStats: stats,
        };
      })
      .sort((a, b) => {
        const aLast = a.jazzStats.lastActivity
          ? new Date(a.jazzStats.lastActivity).getTime()
          : 0;
        const bLast = b.jazzStats.lastActivity
          ? new Date(b.jazzStats.lastActivity).getTime()
          : 0;
        return bLast - aLast;
      });
  }, [customers, statsByPhone]);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return customersWithStats;
    }
    return customersWithStats.filter((customer) => {
      const haystack = `${customer.name} ${customer.phone ?? ''} ${
        customer.email ?? ''
      }`.toLowerCase();
      return haystack.includes(query);
    });
  }, [customersWithStats, searchQuery]);

  const todayTransactions = useMemo(
    () => jazzCashTransactions.filter((txn) => isTransactionToday(txn.createdAt)),
    [jazzCashTransactions, isTransactionToday]
  );

  const previousTransactions = useMemo(
    () => jazzCashTransactions.filter((txn) => !isTransactionToday(txn.createdAt)),
    [jazzCashTransactions, isTransactionToday]
  );

  const historyGroups = useMemo(() => {
    const map = new Map<string, JazzCashTransaction[]>();
    previousTransactions.forEach((txn) => {
      const label = formatDateLabel(txn.createdAt);
      if (!map.has(label)) {
        map.set(label, []);
      }
      map.get(label)!.push(txn);
    });
    return Array.from(map.entries()).map(([label, txns]) => ({
      label,
      transactions: txns,
    }));
  }, [previousTransactions]);

  const [historyCollapseMap, setHistoryCollapseMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setHistoryCollapseMap((prev) => {
      const next: Record<string, boolean> = {};
      historyGroups.forEach(({ label }) => {
        next[label] = prev[label] ?? true;
      });
      return next;
    });
  }, [historyGroups]);

  const getTransactionDisplayName = (txn: JazzCashTransaction) => {
    if (txn.customerPhone === '' && txn.customerCnic === '') {
      return `${ownerDisplayName} (${t('Added')})`;
    }
    return txn.customerName || t('Unknown');
  };

  const buildBackupPayload = () => ({
    generatedAt: new Date().toISOString(),
    owner: ownerDisplayName,
    totals: {
      sent: totals.sent,
      received: totals.received,
      net: totals.received - totals.sent,
    },
    transactions: jazzCashTransactions,
  });

  const handleLogJazzCash = (
    flow: 'send' | 'receive',
    customer?: CustomerRecord
  ) => {
    resetJazzCashForm();
    if (customer) {
      setJazzCashCustomerName(customer.name ?? '');
      setJazzCashCustomerPhone(customer.phone ?? '');
    }
    setJazzCashFlow(flow);
    setIsJazzCashModalVisible(true);
  };

  const resetJazzCashForm = () => {
    setJazzCashCustomerName('');
    setJazzCashCustomerPhone('');
    setJazzCashCustomerCnic('');
    setJazzCashAmount('');
    setJazzCashNote('');
    // Default the transfer flow back to Send so every new entry starts there.
    setJazzCashFlow('send');
  };

  const handleJazzCnicChange = (value: string) => {
    const digits = value.replace(/[^0-9]/g, '').slice(0, 13);
    let formatted = digits;
    if (digits.length > 5 && digits.length <= 12) {
      formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    } else if (digits.length > 12) {
      formatted = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(
        12
      )}`;
    }
    setJazzCashCustomerCnic(formatted);
  };

  const handleOpenCnicScanner = async () => {
    setIsCnicScannerVisible(true);
    setCanScanCnic(true);
    if (!cnicCameraPermission?.granted) {
      const response = await requestCnicCameraPermission();
      if (!response?.granted) {
        Toast.show({ type: 'info', text1: t('Camera permission required') });
      }
    }
  };

  const handleCloseCnicScanner = () => {
    setIsCnicScannerVisible(false);
    setCanScanCnic(true);
  };

  const handleCaptureCnic = async () => {
    if (!cnicCameraRef.current) {
      return;
    }
    try {
      const photo = await cnicCameraRef.current.takePictureAsync();
      if (!photo?.uri) {
        Toast.show({ type: 'error', text1: t('Failed to capture image') });
        return;
      }
      
      setCanScanCnic(false);
      const detectedLines = await getTextFromFrame(photo.uri, false);
      
      if (!detectedLines?.length) {
        Toast.show({ type: 'info', text1: t('No text found on card') });
        setTimeout(() => setCanScanCnic(true), 1000);
        return;
      }
      
      const allText = detectedLines.join(' ');
      handleCnicScanDetected(allText);
      
    } catch (error) {
      console.error('CNIC capture failed:', error);
      Toast.show({ type: 'error', text1: t('Failed to scan card') });
      setTimeout(() => setCanScanCnic(true), 1000);
    }
  };

  const handleCnicScanDetected = (rawValue: string) => {
    if (!canScanCnic) {
      return;
    }
    setCanScanCnic(false);

    // Try multiple CNIC extraction strategies
    let extracted = '';
    
    // Strategy 1: Look for CNIC format with dashes/spaces: XXXXX-XXXXXXX-X or XXXXX XXXXXXX X
    const cnicWithSeparators = /(\d{5})[\s\-]+(\d{7})[\s\-]+(\d)/g;
    const match1 = cnicWithSeparators.exec(rawValue);
    if (match1) {
      extracted = match1[1] + match1[2] + match1[3];
    }
    
    // Strategy 2: Look for exactly 13 consecutive digits
    if (!extracted || extracted.length !== 13) {
      const consecutiveDigits = /\b(\d{13})\b/;
      const match2 = rawValue.match(consecutiveDigits);
      if (match2) {
        extracted = match2[1];
      }
    }
    
    // Strategy 3: Look for pattern without spaces but with separators: 31102-0566866-7
    if (!extracted || extracted.length !== 13) {
      const cnicPattern = /(\d{5})-(\d{7})-(\d)/;
      const match3 = rawValue.match(cnicPattern);
      if (match3) {
        extracted = match3[1] + match3[2] + match3[3];
      }
    }
    
    // Strategy 4: Extract all digits and look for 13-digit substring
    if (!extracted || extracted.length !== 13) {
      const allDigits = rawValue.replace(/\D/g, '');
      // Look for common CNIC starting patterns (31xxx, 32xxx, 33xxx, 34xxx, 35xxx, 36xxx, 37xxx, 38xxx, 41xxx, 42xxx, etc.)
      const cnicStartPattern = /(?:3[1-8]|4[1-7]|5[1-4]|6[1-2])(\d{11})/;
      const match4 = allDigits.match(cnicStartPattern);
      if (match4) {
        extracted = match4[0];
      } else if (allDigits.length >= 13) {
        // Last resort: take first 13 digits
        extracted = allDigits.slice(0, 13);
      }
    }

    if (!extracted || extracted.length !== 13) {
      Toast.show({
        type: 'info',
        text1: t('Unable to read ID number'),
        text2: t('Please try again or enter manually'),
      });
      setTimeout(() => setCanScanCnic(true), 1500);
      return;
    }

    handleJazzCnicChange(extracted);
    Toast.show({
      type: 'success',
      text1: t('ID number captured'),
      text2: `${extracted.slice(0, 5)}-${extracted.slice(5, 12)}-${extracted.slice(12)}`,
    });

    handleCloseCnicScanner();
    setTimeout(() => {
      jazzAmountRef.current?.focus();
    }, 300);
  };

  const clampProfitValue = (raw: string, mode: 'flat' | 'percent') => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    if (mode === 'percent') {
      return Math.min(parsed, 100);
    }
    return parsed;
  };

  const handleSaveProfitSettings = async () => {
    const nextSettings = {
      send: { mode: sendProfitMode, value: clampProfitValue(sendProfitValue, sendProfitMode) },
      receive: {
        mode: receiveProfitMode,
        value: clampProfitValue(receiveProfitValue, receiveProfitMode),
      },
    };

    setIsSavingProfit(true);
    try {
      await saveJazzCashProfitSettings(nextSettings);
      Toast.show({ type: 'success', text1: t('Profit settings updated') });
      setIsProfitModalVisible(false);
    } catch (error) {
      console.error('Save JazzCash profit settings failed', error);
      Toast.show({ type: 'error', text1: t('Could not save profit settings') });
    } finally {
      setIsSavingProfit(false);
    }
  };

  const handleSubmitJazzCash = async () => {
    if (!jazzCashCustomerName.trim()) {
      Toast.show({ type: 'info', text1: t('Enter customer name') });
      return;
    }

    if (!jazzCashAmount.trim()) {
      Toast.show({ type: 'info', text1: t('Enter an amount') });
      return;
    }

    const amountValue = Number(jazzCashAmount);
    if (!amountValue || amountValue <= 0) {
      Toast.show({ type: 'info', text1: t('Enter a valid amount') });
      return;
    }

    const { totalAmount, profitAmount } = calculateProfitForFlow(amountValue, jazzCashFlow);

    await addJazzCashTransaction({
      flow: jazzCashFlow,
      customerName: jazzCashCustomerName.trim(),
      customerPhone: jazzCashCustomerPhone.trim(),
      customerCnic: jazzCashCustomerCnic.trim(),
      amount: totalAmount,
      baseAmount: amountValue,
      profitAmount,
      note: jazzCashNote.trim() ? jazzCashNote.trim() : undefined,
    });

    const profitText =
      profitAmount > 0
        ? ` (${t('Profit')}: ${formatCurrency(profitAmount)})`
        : '';

    Toast.show({
      type: 'success',
      text1: t('JazzCash entry saved'),
      text2: `${jazzCashFlow === 'send' ? t('Sent') : t('Received')} ${formatCurrency(
        totalAmount
      )}${profitText}`,
    });

    resetJazzCashForm();
    setIsJazzCashModalVisible(false);
    setReceiptAutoFillDetails(null);
    setReceiptScanError(null);
    setIsReceiptScanning(false);
  };

  const openQuickAdjustModal = () => {
    setQuickAmountInput('');
    setQuickNoteInput('');
    setIsQuickAdjustVisible(true);
  };

  const closeQuickAdjustModal = () => {
    setIsQuickAdjustVisible(false);
    setQuickAmountInput('');
    setQuickNoteInput('');
    setQuickFlow('send');
  };

  const handleBackupLocal = async () => {
    if (isBackupBusy) {
      return;
    }
    setIsBackupBusy(true);
    try {
      const payload = JSON.stringify(buildBackupPayload(), null, 2);
      const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!dir) {
        Toast.show({
          type: 'error',
          text1: t('Local backup unavailable'),
          text2: t('Storage directory not accessible.'),
        });
        setIsBackupBusy(false);
        setIsBackupModalVisible(false);
        return;
      }
      const filename = `jazzcash-backup-${Date.now()}.json`;
      const fileUri = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, payload);
      Toast.show({ type: 'success', text1: t('Backup saved locally'), text2: filename });
    } catch (error) {
      console.error('Local backup failed', error);
      Toast.show({ type: 'error', text1: t('Failed to save backup') });
    } finally {
      setIsBackupBusy(false);
      setIsBackupModalVisible(false);
    }
  };

  const handleBackupToDownloads = async () => {
    if (isBackupBusy) {
      return;
    }
    setIsBackupBusy(true);
    try {
      if (!FileSystem.StorageAccessFramework?.requestDirectoryPermissionsAsync) {
        Toast.show({
          type: 'info',
          text1: t('Downloads not supported on this device'),
          text2: t('Use the Save or Cloud option instead.'),
        });
        setIsBackupBusy(false);
        setIsBackupModalVisible(false);
        return;
      }
      const payload = JSON.stringify(buildBackupPayload(), null, 2);
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted || !permissions.directoryUri) {
        Toast.show({ type: 'info', text1: t('Permission denied'), text2: t('Select a folder to continue.') });
        return;
      }
      const filename = `jazzcash-backup-${Date.now()}.json`;
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        filename,
        'application/json'
      );
      await FileSystem.writeAsStringAsync(fileUri, payload);
      Toast.show({ type: 'success', text1: t('Backup saved'), text2: filename });
    } catch (error) {
      console.error('Download backup failed', error);
      Toast.show({ type: 'error', text1: t('Failed to save to Downloads') });
    } finally {
      setIsBackupBusy(false);
      setIsBackupModalVisible(false);
    }
  };

  const handleBackupCloud = async () => {
    if (isBackupBusy) {
      return;
    }
    setIsBackupBusy(true);
    try {
      const payload = JSON.stringify(buildBackupPayload(), null, 2);
      await Share.share({
        message: payload,
        title: 'JazzCash Backup',
      });
      Toast.show({ type: 'info', text1: t('Choose a cloud destination to finish backup') });
    } catch (error) {
      console.error('Cloud backup failed', error);
      Toast.show({ type: 'error', text1: t('Failed to start cloud backup') });
    } finally {
      setIsBackupBusy(false);
      setIsBackupModalVisible(false);
    }
  };

  const handleRestoreJazzCash = async () => {
    if (isRestoreBusy || isBackupBusy) {
      return;
    }
    setIsRestoreBusy(true);
    try {
      const picker = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (picker.canceled) {
        setIsRestoreBusy(false);
        return;
      }
      const asset =
        picker.assets?.[0] ||
        ((picker as any).type === 'success'
          ? { uri: (picker as any).uri, name: (picker as any).name }
          : null);
      if (!asset?.uri) {
        Toast.show({ type: 'error', text1: t('No file selected') });
        setIsRestoreBusy(false);
        return;
      }

      const candidateUris = [
        (asset as any).fileCopyUri,
        asset.uri,
      ].filter(Boolean) as string[];

      let content: string | null = null;
      for (const uri of candidateUris) {
        try {
          content = await FileSystem.readAsStringAsync(uri, { encoding: 'utf8' });
          break;
        } catch (readError) {
          console.warn('Failed to read backup uri, trying next', uri, readError);
        }
        // SAF fallback
        if (!content && FileSystem.StorageAccessFramework?.readAsStringAsync && uri.startsWith('content://')) {
          try {
            content = await FileSystem.StorageAccessFramework.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 as any });
            break;
          } catch (safError) {
            console.warn('SAF read failed for backup uri', uri, safError);
          }
        }
      }

      if (!content) {
        Toast.show({ type: 'error', text1: t('Restore failed'), text2: t('Could not read backup file') });
        setIsRestoreBusy(false);
        return;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        console.error('Parse restore file failed', parseError);
        Toast.show({ type: 'error', text1: t('Restore failed'), text2: t('Invalid JSON in backup file') });
        setIsRestoreBusy(false);
        return;
      }

      const transactions: JazzCashTransaction[] =
        Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.transactions)
          ? parsed.transactions
          : Array.isArray(parsed.data?.transactions)
          ? parsed.data.transactions
          : [];
      if (!transactions.length) {
        Toast.show({ type: 'error', text1: t('No transactions found in backup') });
        setIsRestoreBusy(false);
        return;
      }

      const connection = await database.getDB();
      if (!connection) {
        throw new Error('Database unavailable');
      }

      await connection.execAsync('DELETE FROM jazzCashTransactions');
      const insert =
        'INSERT INTO jazzCashTransactions (flow, customerName, customerPhone, customerCnic, amount, baseAmount, profitAmount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

      for (const txn of transactions) {
        const flow = txn.flow === 'receive' ? 'receive' : 'send';
        const amount = Number(txn.amount) || 0;
        const baseAmount = txn.baseAmount !== undefined ? Number(txn.baseAmount) || 0 : amount;
        const profitAmount = txn.profitAmount !== undefined ? Number(txn.profitAmount) || 0 : 0;
        const createdAt = txn.createdAt || new Date().toISOString();
        await connection.runAsync(insert, [
          flow,
          txn.customerName ?? '',
          txn.customerPhone ?? '',
          txn.customerCnic ?? '',
          amount,
          baseAmount,
          profitAmount,
          txn.note ?? '',
          createdAt,
        ]);
      }

      await refreshData();
      Toast.show({
        type: 'success',
        text1: t('JazzCash data restored'),
        text2: t('Restart the app if totals look stale.'),
      });
      setIsBackupModalVisible(false);
    } catch (error) {
      console.error('Restore JazzCash failed', error);
      Toast.show({ type: 'error', text1: t('Restore failed'), text2: t('Invalid file or read error') });
    } finally {
      setIsRestoreBusy(false);
    }
  };

  const handleQuickAdjustSubmit = async () => {
    if (!quickAmountInput.trim()) {
      Toast.show({ type: 'info', text1: t('Enter an amount') });
      return;
    }

    const amountValue = Number(quickAmountInput);
    if (!amountValue || amountValue <= 0) {
      Toast.show({ type: 'info', text1: t('Enter a valid amount') });
      return;
    }

    const { totalAmount, profitAmount } = calculateProfitForFlow(amountValue, quickFlow);

    setIsQuickSaving(true);
    try {
      const defaultName =
        quickFlow === 'send'
          ? `${ownerDisplayName} (${t('Added')})`
          : `${ownerDisplayName} (${t('Added')})`;
      await addJazzCashTransaction({
        flow: quickFlow,
        customerName: defaultName,
        customerPhone: '',
        customerCnic: '',
        amount: totalAmount,
        baseAmount: amountValue,
        profitAmount,
        note: quickNoteInput.trim() ? quickNoteInput.trim() : undefined,
      });

      Toast.show({
        type: 'success',
        text1:
          quickFlow === 'send'
            ? t('Amount logged as send')
            : t('Amount logged as receive'),
        text2: `${formatCurrency(totalAmount)}${
          profitAmount > 0 ? ` (${t('Profit')}: ${formatCurrency(profitAmount)})` : ''
        }`,
      });

      closeQuickAdjustModal();
    } catch (error) {
      console.error('Quick JazzCash adjustment failed', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsQuickSaving(false);
    }
  };

  const toggleHistoryGroup = (label: string) => {
    setHistoryCollapseMap((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const handleClearHistory = () => {
    if (previousTransactions.length === 0 || isClearingHistory) {
      return;
    }
    Alert.alert(
      t('Clear History'),
      t('This will remove all previous transactions. Continue?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Clear'),
          style: 'destructive',
          onPress: async () => {
            try {
              setIsClearingHistory(true);
              await Promise.all(
                previousTransactions.map((txn) => deleteJazzCashTransaction(txn.id))
              );
              Toast.show({ type: 'success', text1: t('History cleared') });
              setIsQuickHistoryVisible(false);
            } catch (error) {
              console.error('Failed to clear history', error);
              Toast.show({ type: 'error', text1: t('Something went wrong') });
            } finally {
              setIsClearingHistory(false);
            }
          },
        },
      ]
    );
  };

  const handleShareCustomer = async (customer: CustomerRecord, stats: JazzStats) => {
    const payload = [
      t('JazzCash Account'),
      `${t('Name')}: ${customer.name}`,
      customer.phone ? `${t('Phone')}: ${customer.phone}` : null,
      `${t('Outstanding credit')}: ${formatCurrency(customer.credit ?? 0)}`,
      `${t('Total sent')}: ${formatCurrency(stats.sent)}`,
      `${t('Total received')}: ${formatCurrency(stats.received)}`,
      `${t('Transactions')}: ${stats.count}`,
      stats.lastActivity
        ? `${t('Last activity')}: ${formatDateTime(stats.lastActivity)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const success = await shareTextViaWhatsApp(payload);
    if (!success) {
      Toast.show({
        type: 'info',
        text1: t('Unable to open WhatsApp'),
      });
    }
  };

  const confirmDeleteCustomer = (customer: CustomerRecord) => {
    Alert.alert(
      t('Delete customer?'),
      t('This will permanently remove their account and history.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteCustomer(customer.id);
            Toast.show({
              type: 'success',
              text1: t('Customer deleted'),
            });
          },
        },
      ]
    );
  };

  const openCustomerAccount = (customerId?: number, mode?: 'edit') => {
    if (!customerId) {
      router.push('/modals/customer-account');
      return;
    }
    router.push({
      pathname: '/modals/customer-account',
      params: {
        customerId: String(customerId),
        ...(mode ? { mode } : {}),
      },
    });
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
        <Text style={styles.headerTitle}>{t('JazzCash Hub')}</Text>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => openCustomerAccount(undefined)}
          activeOpacity={0.7}
        >
          <Ionicons name="book-outline" size={20} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statCard}>
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>{t('Total Sent')}</Text>
            <Text style={styles.statValue}>{formatCurrency(totals.sent)}</Text>
            <Text style={styles.statHelper}>{t('All time')}</Text>
            <View style={[styles.statBadge, styles.statBadgeDanger]}>
              <Ionicons name="arrow-up" size={14} color="#dc2626" />
              <Text style={styles.statBadgeText}>{t('Credit out')}</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBlock}>
            <Text style={styles.statLabel}>{t('Total Received')}</Text>
            <Text style={styles.statValue}>
              {formatCurrency(totals.received)}
            </Text>
            <Text style={styles.statHelper}>{t('All time')}</Text>
            <View style={[styles.statBadge, styles.statBadgeSuccess]}>
              <Ionicons name="arrow-down" size={14} color="#16a34a" />
              <Text style={styles.statBadgeText}>{t('Credit in')}</Text>
            </View>
          </View>
        </View>
        <View style={styles.netCard}>
            <View style={styles.netHeader}>
              <View>
                <Text style={styles.netLabel}>{t('Net JazzCash Balance')}</Text>
                <Text style={styles.netHelperText}>
                  {t('Cash you hold for JazzCash transfers.')}
                </Text>
                {showNetBalance ? (
                  <>
                    <Text
                      style={[
                        styles.netValue,
                        totals.received - totals.sent >= 0
                          ? styles.netPositive
                          : styles.netNegative,
                      ]}
                    >
                      {formatCurrency(totals.received - totals.sent)}
                    </Text>
                    {totals.profit > 0 ? (
                      <Text style={styles.netProfitText}>
                        {`${t('Profit earned')}: ${formatCurrency(totals.profit)}`}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.netHiddenText}>{t('Hidden')}</Text>
                )}
            </View>
            <View style={styles.netHeaderActions}>
              <TouchableOpacity
                onPress={() => setIsProfitModalVisible(true)}
                style={[styles.sectionToggle, styles.netIconButton]}
                accessibilityRole="button"
                accessibilityLabel={t('Configure JazzCash profit')}
              >
                <Ionicons name="settings-outline" size={20} color="#2563eb" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowNetBalance((prev) => !prev)}
                style={[styles.sectionToggle, styles.netIconButton]}
              >
                <Ionicons
                  name={showNetBalance ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#2563eb"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sectionToggle, styles.netIconButton]}
                onPress={() => setIsBackupModalVisible(true)}
              >
                <Ionicons name="cloud-upload-outline" size={20} color="#2563eb" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.logActions}>
            <TouchableOpacity
              style={[
                styles.flowToggleButton,
                styles.flowToggleSend,
              ]}
              onPress={() => {
                setQuickFlow('send');
                handleLogJazzCash('send');
              }}
            >
              <Ionicons name="arrow-up-circle" size={18} color="#ffffff" />
              <Text style={[styles.logButtonText, styles.logButtonTextPrimary]}>
                {t('Send Money')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logButton, styles.logAddButton]}
              onPress={() => {
                setQuickFlow('receive');
                openQuickAdjustModal();
              }}
            >
              <Ionicons name="add-circle" size={18} color="#2563eb" />
              <Text style={styles.logButtonText}>{t('Add Amount')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Text style={styles.searchLabel}>{t('Search permanent customers')}</Text>
          <Ionicons name="search" size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('Search permanent customers...')}
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
        </View>

        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeading}>
            <Ionicons name="people-circle" size={18} color="#2563eb" />
            <Text style={styles.sectionTitle}>{t('Permanent Customers')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.sectionToggle, styles.netIconButton]}
            onPress={() => setShowPermanentSection((prev) => !prev)}
          >
            <Ionicons
              name={showPermanentSection ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#2563eb"
            />
          </TouchableOpacity>
        </View>
        {showPermanentSection && (
          filteredCustomers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#cbd5f5" />
              <Text style={styles.emptyTitle}>{t('No customers yet')}</Text>
              <Text style={styles.emptySubtitle}>
                {t(
                  'Add your JazzCash partners to keep their credit, history, and shareable account handy.'
                )}
              </Text>
            </View>
          ) : (
            filteredCustomers.map((customer) => (
              <View key={customer.id} style={styles.customerCard}>
              <View style={styles.customerHeader}>
                <View>
                  <Text style={styles.customerName}>{customer.name}</Text>
                  {customer.phone ? (
                    <Text style={styles.customerPhone}>{customer.phone}</Text>
                  ) : null}
                  <Text style={styles.customerMeta}>
                    {customer.jazzStats.lastActivity
                      ? `${t('Last activity')}: ${formatDateTime(
                          customer.jazzStats.lastActivity
                        )}`
                      : t('No JazzCash history yet')}
                  </Text>
                </View>
                <View style={styles.customerHeaderRight}>
                  <View style={styles.creditSummary}>
                    <Text style={styles.creditLabel}>{t('Credit')}</Text>
                    <Text style={styles.creditValue}>
                      {formatCurrency(customer.credit ?? 0)}
                    </Text>
                  </View>
                  <View style={styles.customerQuickActions}>
                    <TouchableOpacity
                      style={[styles.customerQuickButton, styles.customerQuickSend]}
                      onPress={() => handleLogJazzCash('send', customer)}
                      activeOpacity={0.85}
                      accessibilityLabel={t('Log send')}
                    >
                      <Ionicons name="arrow-up" size={16} color="#dc2626" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.customerQuickButton,
                        styles.customerQuickReceive,
                      ]}
                      onPress={() => handleLogJazzCash('receive', customer)}
                      activeOpacity={0.85}
                      accessibilityLabel={t('Log receive')}
                    >
                      <Ionicons name="arrow-down" size={16} color="#16a34a" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.customerStatsRow}>
                <View style={styles.customerStat}>
                  <Text style={styles.customerStatLabel}>{t('Sent')}</Text>
                  <Text style={styles.customerStatValue}>
                    {formatCurrency(customer.jazzStats.sent)}
                  </Text>
                </View>
                <View style={styles.customerStat}>
                  <Text style={styles.customerStatLabel}>{t('Received')}</Text>
                  <Text style={styles.customerStatValue}>
                    {formatCurrency(customer.jazzStats.received)}
                  </Text>
                </View>
                <View style={[styles.customerStat, styles.customerStatLast]}>
                  <Text style={styles.customerStatLabel}>{t('Transfers')}</Text>
                  <Text style={styles.customerStatValue}>
                    {customer.jazzStats.count}
                  </Text>
                </View>
              </View>

              <View style={styles.customerActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openCustomerAccount(customer.id)}
                >
                  <Ionicons name="time-outline" size={16} color="#2563eb" />
                  <Text style={styles.actionLabel}>{t('History')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openCustomerAccount(customer.id, 'edit')}
                >
                  <Ionicons name="create-outline" size={16} color="#0ea5e9" />
                  <Text style={styles.actionLabel}>{t('Edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() =>
                    handleShareCustomer(customer, customer.jazzStats)
                  }
                >
                  <Ionicons
                    name="share-social-outline"
                    size={16}
                    color="#16a34a"
                  />
                  <Text style={styles.actionLabel}>{t('Share')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => confirmDeleteCustomer(customer)}
                >
                  <Ionicons name="trash-outline" size={16} color="#dc2626" />
                  <Text style={styles.actionLabel}>{t('Delete')}</Text>
                </TouchableOpacity>
              </View>
              </View>
            ))
          )
        )}

        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeading}>
            <Ionicons name="swap-vertical-outline" size={18} color="#2563eb" />
            <Text style={styles.sectionTitle}>
              {t('Recent Send & Receive')}
            </Text>
          </View>
          <View style={styles.sectionToggleGroup}>
            <TouchableOpacity
              style={[styles.sectionToggle, styles.netIconButton]}
              onPress={() => setIsQuickHistoryVisible(true)}
              accessibilityLabel={t('View previous transactions')}
            >
              <Ionicons name="time-outline" size={20} color="#2563eb" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sectionToggle, styles.netIconButton]}
              onPress={() => setShowRecentSection((prev) => !prev)}
            >
              <Ionicons
                name={showRecentSection ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#2563eb"
              />
            </TouchableOpacity>
          </View>
        </View>

        {showRecentSection ? (
          todayTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={48} color="#cbd5f5" />
              <Text style={styles.emptyTitle}>{t('No transactions today')}</Text>
              <Text style={styles.emptySubtitle}>
                {t('New JazzCash activity recorded today will appear here.')}
              </Text>
            </View>
          ) : (
            todayTransactions.map((txn) => {
              const isOwnerEntry = txn.customerPhone === '' && txn.customerCnic === '';
              const profitAmount = Number(txn.profitAmount) > 0 ? Number(txn.profitAmount) : 0;
              return (
                <View
                  key={txn.id}
                  style={[styles.activityCard, isOwnerEntry && styles.ownerActivityCard]}
                >
                  <View
                    style={[
                      styles.activityIconWrap,
                      isOwnerEntry && styles.ownerActivityIconWrap,
                    ]}
                  >
                    <Ionicons
                      name={
                        txn.flow === 'send'
                          ? 'arrow-up-circle'
                          : 'arrow-down-circle'
                      }
                      size={24}
                      color={txn.flow === 'send' ? '#dc2626' : '#16a34a'}
                    />
                  </View>
                  <View style={styles.activityInfo}>
                    <View style={styles.activityHeader}>
                      <Text style={styles.activityName}>
                        {getTransactionDisplayName(txn)}
                      </Text>
                      <View style={styles.activityAmountStack}>
                        <Text
                          style={[
                            styles.activityAmount,
                            txn.flow === 'send'
                              ? styles.activityAmountNegative
                              : styles.activityAmountPositive,
                          ]}
                        >
                          {formatCurrency(txn.amount)}
                        </Text>
                        {profitAmount > 0 ? (
                          <Text style={styles.activityProfitText}>
                            {`${t('Profit')}: ${formatCurrency(profitAmount)}`}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.activityMeta}>
                      {txn.customerPhone ? txn.customerPhone : t('Owner')}
                    </Text>
                    <Text style={styles.activityMeta}>
                      {formatDateTime(txn.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            })
          )
        ) : null}
      </ScrollView>

      <Modal visible={isQuickAdjustVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {quickFlow === 'send' ? t('Quick Send Entry') : t('Quick Receive Entry')}
              </Text>
              <View style={styles.quickHeaderActions}>
                <TouchableOpacity
                  onPress={() => setIsQuickHistoryVisible(true)}
                  style={styles.historyButton}
                  accessibilityLabel={t('View previous transactions')}
                >
                  <Ionicons name="time-outline" size={20} color="#2563eb" />
                </TouchableOpacity>
                <TouchableOpacity onPress={closeQuickAdjustModal}>
                  <Ionicons name="close" size={22} color="#0f172a" />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.quickAdjustInfo}>
            {quickFlow === 'send'
                ? t('This will decrease the net JazzCash balance.')
                : t('This will increase the net JazzCash balance.')}
            </Text>
            <TextInput
              ref={quickAmountRef}
              style={styles.modalInput}
              placeholder={t('Amount (PKR)')}
              keyboardType="numeric"
              returnKeyType="next"
              value={quickAmountInput}
              onChangeText={setQuickAmountInput}
              onSubmitEditing={() => quickNoteRef.current?.focus()}
            />
            {quickProfitPreview.profitAmount > 0 ? (
              <Text style={styles.profitPreviewText}>
                {`${t('Profit')}: ${formatCurrency(
                  quickProfitPreview.profitAmount
                )} · ${t('Total')}: ${formatCurrency(quickProfitPreview.totalAmount)}`}
              </Text>
            ) : null}
            <TextInput
              ref={quickNoteRef}
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder={t('Notes (optional)')}
              value={quickNoteInput}
              onChangeText={setQuickNoteInput}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={closeQuickAdjustModal}
                disabled={isQuickSaving}
              >
                <Text style={styles.modalCancelText}>{t('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSubmit]}
                onPress={handleQuickAdjustSubmit}
                disabled={isQuickSaving}
              >
                <Text style={styles.modalSubmitText}>
                  {isQuickSaving ? t('Saving...') : t('Save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isProfitModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.profitModalCard]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('JazzCash Profit')}</Text>
              <TouchableOpacity
                onPress={() => setIsProfitModalVisible(false)}
                accessibilityLabel={t('Close profit settings')}
              >
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <Text style={styles.profitIntro}>
              {t(
                'Automatically add your commission when logging JazzCash send or receive entries.'
              )}
            </Text>

            <View style={styles.profitSection}>
              <Text style={styles.profitSectionTitle}>{t('Send profit')}</Text>
              <View style={styles.profitModeRow}>
                {(['flat', 'percent'] as const).map((mode) => (
                  <TouchableOpacity
                    key={`send-${mode}`}
                    style={[
                      styles.profitModeButton,
                      sendProfitMode === mode && styles.profitModeButtonActive,
                    ]}
                    onPress={() => setSendProfitMode(mode)}
                  >
                    <Ionicons
                      name={mode === 'flat' ? 'cash-outline' : 'trending-up-outline'}
                      size={16}
                      color={sendProfitMode === mode ? '#ffffff' : '#1d4ed8'}
                    />
                    <Text
                      style={[
                        styles.profitModeButtonText,
                        sendProfitMode === mode && styles.profitModeButtonTextActive,
                      ]}
                    >
                      {mode === 'flat' ? t('Flat amount') : t('Percentage')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                placeholder={
                  sendProfitMode === 'percent'
                    ? t('Enter percentage (e.g. 2)')
                    : t('Enter amount (PKR)')
                }
                value={sendProfitValue}
                onChangeText={setSendProfitValue}
              />
              <Text style={styles.profitHint}>
                {sendProfitMode === 'percent'
                  ? t('Adds a percentage of the amount when you send JazzCash.')
                  : t('Adds a fixed PKR amount when you send JazzCash.')}
              </Text>
            </View>

            <View style={styles.profitSection}>
              <Text style={styles.profitSectionTitle}>{t('Receive profit')}</Text>
              <View style={styles.profitModeRow}>
                {(['flat', 'percent'] as const).map((mode) => (
                  <TouchableOpacity
                    key={`receive-${mode}`}
                    style={[
                      styles.profitModeButton,
                      receiveProfitMode === mode && styles.profitModeButtonActive,
                    ]}
                    onPress={() => setReceiveProfitMode(mode)}
                  >
                    <Ionicons
                      name={mode === 'flat' ? 'cash-outline' : 'trending-up-outline'}
                      size={16}
                      color={receiveProfitMode === mode ? '#ffffff' : '#1d4ed8'}
                    />
                    <Text
                      style={[
                        styles.profitModeButtonText,
                        receiveProfitMode === mode && styles.profitModeButtonTextActive,
                      ]}
                    >
                      {mode === 'flat' ? t('Flat amount') : t('Percentage')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.modalInput}
                keyboardType="numeric"
                placeholder={
                  receiveProfitMode === 'percent'
                    ? t('Enter percentage (e.g. 2)')
                    : t('Enter amount (PKR)')
                }
                value={receiveProfitValue}
                onChangeText={setReceiveProfitValue}
              />
              <Text style={styles.profitHint}>
                {receiveProfitMode === 'percent'
                  ? t('Adds a percentage of the amount when you receive JazzCash.')
                  : t('Adds a fixed PKR amount when you receive JazzCash.')}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setIsProfitModalVisible(false)}
                disabled={isSavingProfit}
              >
                <Text style={styles.modalCancelText}>{t('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSubmit]}
                onPress={handleSaveProfitSettings}
                disabled={isSavingProfit}
              >
                <Text style={styles.modalSubmitText}>
                  {isSavingProfit ? t('Saving...') : t('Save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isBackupModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.backupModal]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('Backup Net Balance')}</Text>
              <TouchableOpacity onPress={() => setIsBackupModalVisible(false)}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <View style={styles.backupOptionRow}>
              <TouchableOpacity
                style={styles.backupOption}
                onPress={handleBackupToDownloads}
                disabled={isBackupBusy}
              >
                <Ionicons name="download-outline" size={22} color="#2563eb" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backupOption}
                onPress={handleBackupLocal}
                disabled={isBackupBusy}
              >
                <Ionicons name="save-outline" size={22} color="#2563eb" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backupOption}
                onPress={handleBackupCloud}
                disabled={isBackupBusy}
              >
                <Ionicons name="cloud-upload-outline" size={22} color="#2563eb" />
              </TouchableOpacity>
            </View>
          {isBackupBusy ? (
            <Text style={styles.historyRowMeta}>{t('Processing backup...')}</Text>
          ) : (
            <Text style={styles.quickAdjustInfo}>
              {t('Download icon saves to your folder, disk icon saves internally, cloud shares.')}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.restoreButton, (isBackupBusy || isRestoreBusy) && styles.restoreButtonDisabled]}
            onPress={handleRestoreJazzCash}
            disabled={isBackupBusy || isRestoreBusy}
          >
            <Ionicons name="refresh" size={18} color="#dc2626" />
            <Text style={styles.restoreButtonText}>
              {isRestoreBusy ? t('Restoring...') : t('Restore from backup file')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      </Modal>

      <Modal visible={isQuickHistoryVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.historyModal]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('Previous Transactions')}</Text>
              <View style={styles.quickHeaderActions}>
                <TouchableOpacity
                  onPress={handleClearHistory}
                  style={styles.historyButton}
                  disabled={previousTransactions.length === 0 || isClearingHistory}
                  accessibilityLabel={t('Clear history')}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={
                      previousTransactions.length === 0 || isClearingHistory
                        ? '#cbd5f5'
                        : '#dc2626'
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsQuickHistoryVisible(false)}>
                  <Ionicons name="close" size={22} color="#0f172a" />
                </TouchableOpacity>
              </View>
            </View>
            {previousTransactions.length === 0 ? (
              <Text style={styles.historyEmpty}>{t('No earlier transactions yet.')}</Text>
            ) : (
              <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
                {historyGroups.map(({ label, transactions }) => {
                  const collapsed = historyCollapseMap[label];
                  return (
                    <View key={label} style={styles.historyGroup}>
                      <TouchableOpacity
                        style={styles.historyGroupHeader}
                        onPress={() => toggleHistoryGroup(label)}
                      >
                        <Text style={styles.historyGroupTitle}>{label}</Text>
                        <Ionicons
                          name={collapsed ? 'chevron-down' : 'chevron-up'}
                          size={18}
                          color="#2563eb"
                        />
                      </TouchableOpacity>
                      {!collapsed &&
                        transactions.map((txn) => {
                          const profitAmount =
                            Number(txn.profitAmount) > 0 ? Number(txn.profitAmount) : 0;
                          return (
                            <View key={`history-${txn.id}`} style={styles.historyRow}>
                              <View>
                                <Text style={styles.historyRowTitle}>
                                  {getTransactionDisplayName(txn)}
                                </Text>
                                <Text style={styles.historyRowMeta}>
                                  {formatDateTime(txn.createdAt)}
                                </Text>
                              </View>
                              <View style={styles.historyAmountStack}>
                                <Text
                                  style={[
                                    styles.historyRowAmount,
                                    txn.flow === 'send'
                                      ? styles.historyRowAmountNegative
                                      : styles.historyRowAmountPositive,
                                  ]}
                                >
                                  {txn.flow === 'send' ? '-' : '+'}
                                  {formatCurrency(txn.amount)}
                                </Text>
                                {profitAmount > 0 ? (
                                  <Text style={styles.historyProfitText}>
                                    {`${t('Profit')}: ${formatCurrency(profitAmount)}`}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={isJazzCashModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('JazzCash Transfer')}</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsJazzCashModalVisible(false);
                  resetJazzCashForm();
                }}
              >
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <View style={styles.flowToggle}>
              {(['send', 'receive'] as const).map((flow) => (
                <TouchableOpacity
                  key={flow}
                  style={[
                    styles.flowButton,
                    jazzCashFlow === flow && styles.flowButtonActive,
                  ]}
                  onPress={() => setJazzCashFlow(flow)}
                >
                  <Ionicons
                    name={
                      flow === 'send' ? 'arrow-up-circle' : 'arrow-down-circle'
                    }
                    size={18}
                    color={jazzCashFlow === flow ? '#ffffff' : '#2563eb'}
                  />
                  <Text
                    style={[
                      styles.flowLabel,
                      jazzCashFlow === flow && styles.flowLabelActive,
                    ]}
                  >
                    {flow === 'send' ? t('Send') : t('Receive')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.receiptActions}>
              <TouchableOpacity
                style={[
                  styles.receiptButton,
                  isReceiptScanning && styles.receiptButtonDisabled,
                ]}
                onPress={handlePickJazzCashReceipt}
                activeOpacity={0.85}
                disabled={isReceiptScanning}
              >
                {isReceiptScanning ? (
                  <>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.receiptButtonText}>{t('Reading slip...')}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="image-outline" size={18} color="#2563eb" />
                    <Text style={styles.receiptButtonText}>{t('Upload JazzCash slip')}</Text>
                  </>
                )}
              </TouchableOpacity>
              {receiptAutoFillDetails ? (
                <Text style={styles.receiptHelperText}>
                  {t('Details auto-filled from slip. Switch Send/Receive to use other party info.')}
                </Text>
              ) : null}
              {receiptScanError ? (
                <Text style={styles.receiptErrorText}>{receiptScanError}</Text>
              ) : null}
            </View>

            <TextInput
              ref={jazzNameRef}
              style={styles.modalInput}
              placeholder={t('Customer name')}
              autoFocus
              returnKeyType='next'
              value={jazzCashCustomerName}
              onChangeText={setJazzCashCustomerName}
              onSubmitEditing={() => jazzPhoneRef.current?.focus()}
            />
            <TextInput
              ref={jazzPhoneRef}
              style={styles.modalInput}
              placeholder={t('Mobile number')}
              keyboardType="phone-pad"
              returnKeyType="next"
              value={jazzCashCustomerPhone}
              onChangeText={setJazzCashCustomerPhone}
              onSubmitEditing={() => jazzCnicRef.current?.focus()}
            />
            <View style={styles.modalInputContainer}>
              <TextInput
                ref={jazzCnicRef}
                style={[styles.modalInput, styles.modalInputWithIcon]}
                placeholder={t('CNIC / ID card number')}
                keyboardType="number-pad"
                returnKeyType="next"
                maxLength={15}
                value={jazzCashCustomerCnic}
                onChangeText={handleJazzCnicChange}
                onSubmitEditing={() => jazzAmountRef.current?.focus()}
              />
              <TouchableOpacity
                style={styles.modalInputIconButton}
                onPress={handleOpenCnicScanner}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('Scan CNIC or ID card')}
              >
                <Ionicons name="scan-outline" size={20} color="#2563eb" />
              </TouchableOpacity>
            </View>
            <TextInput
              ref={jazzAmountRef}
              style={styles.modalInput}
              placeholder={t('Amount (PKR)')}
              keyboardType="numeric"
              returnKeyType="next"
              value={jazzCashAmount}
              onChangeText={setJazzCashAmount}
              onSubmitEditing={() => jazzNoteRef.current?.focus()}
            />
            {formProfitPreview.profitAmount > 0 ? (
              <Text style={styles.profitPreviewText}>
                {`${t('Profit')}: ${formatCurrency(
                  formProfitPreview.profitAmount
                )} · ${t('Total')}: ${formatCurrency(formProfitPreview.totalAmount)}`}
              </Text>
            ) : null}
            <TextInput
              ref={jazzNoteRef}
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder={t('Notes (optional)')}
              value={jazzCashNote}
              onChangeText={setJazzCashNote}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setIsJazzCashModalVisible(false);
                  resetJazzCashForm();
                }}
              >
                <Text style={styles.modalCancelText}>{t('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSubmit]}
                onPress={handleSubmitJazzCash}
              >
                <Text style={styles.modalSubmitText}>{t('Save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={isCnicScannerVisible}
        animationType="fade"
        onRequestClose={handleCloseCnicScanner}
      >
        <View style={styles.scannerModalOverlay}>
          <View style={styles.scannerModalCard}>
            <Text style={styles.scannerModalTitle}>{t('Scan CNIC / ID card')}</Text>
            <Text style={styles.scannerModalSubtitle}>
              {t('Position the ID card in the frame and tap Capture to read the number.')}
            </Text>
            <View style={styles.scannerCameraContainer}>
              {cnicCameraPermission?.granted ? (
                <>
                  <CameraView
                    ref={cnicCameraRef}
                    style={styles.scannerCameraView}
                    facing="back"
                  >
                    <View pointerEvents="none" style={styles.scannerFrame} />
                  </CameraView>
                  <TouchableOpacity
                    style={[styles.scannerButton, styles.scannerButtonPrimary, styles.captureButton]}
                    onPress={handleCaptureCnic}
                    disabled={!canScanCnic}
                  >
                    <Ionicons name="camera" size={24} color="#ffffff" />
                    <Text style={styles.scannerButtonPrimaryText}>{t('Capture')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.scannerPermissionCard}>
                  <Ionicons name="camera-outline" size={42} color="#64748b" />
                  <Text style={styles.scannerPermissionTitle}>
                    {t('Allow camera access to scan IDs')}
                  </Text>
                  <Text style={styles.scannerPermissionText}>
                    {t('Enable the camera to read the CNIC number from the card automatically.')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.scannerButton, styles.scannerButtonPrimary]}
                    onPress={async () => {
                      const response = await requestCnicCameraPermission();
                      if (!response?.granted) {
                        Toast.show({ type: 'info', text1: t('Camera permission required') });
                      }
                    }}
                  >
                    <Text style={styles.scannerButtonPrimaryText}>{t('Allow Camera')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <Text style={styles.scannerTip}>
              {t('Tip: You can always type or edit the ID manually if scanning fails.')}
            </Text>
            <TouchableOpacity
              style={[styles.scannerButton, styles.scannerButtonGhost]}
              onPress={handleCloseCnicScanner}
            >
              <Text style={styles.scannerButtonGhostText}>{t('Close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#eef2ff',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statCard: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  statBlock: {
    flex: 1,
  },
  statLabel: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  statHelper: {
    marginTop: 2,
    fontSize: 11,
    color: '#cbd5f5',
  },
  statBadge: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  statBadgeDanger: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
  },
  statBadgeSuccess: {
    backgroundColor: 'rgba(22, 163, 74, 0.15)',
  },
  statBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#1f2937',
    marginHorizontal: 16,
  },
  netCard: {
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  netHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  netHelperText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  netValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  netProfitText: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
  },
  netHiddenText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 4,
  },
  netPositive: {
    color: '#16a34a',
  },
  netNegative: {
    color: '#dc2626',
  },
  netHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  logActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  logButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    borderColor: '#2563eb',
    backgroundColor: '#ffffff',
  },
  flowToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  flowToggleSend: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  flowToggleReceive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  logButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  logButtonTextPrimary: {
    color: '#ffffff',
  },
  logAddButton: {
    borderColor: '#2563eb',
    backgroundColor: '#ffffff',
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
    marginBottom: 12,
  },
  searchLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 12,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  netIconButton: {
    padding: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eef2ff',
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  customerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 12,
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  customerPhone: {
    marginTop: 2,
    fontSize: 13,
    color: '#6b7280',
  },
  customerMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  creditSummary: {
    alignItems: 'flex-end',
  },
  customerHeaderRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  customerQuickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  customerQuickButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  customerQuickSend: {
    backgroundColor: '#fee2e2',
  },
  customerQuickReceive: {
    backgroundColor: '#dcfce7',
  },
  creditLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  creditValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  customerStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  customerStat: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  customerStatLast: {
    marginRight: 0,
  },
  customerStatLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  customerStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  customerActions: {
    flexDirection: 'row',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  activityCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  ownerActivityCard: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  activityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  ownerActivityIconWrap: {
    backgroundColor: '#dcfce7',
  },
  activityInfo: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  activityName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    flexWrap: 'wrap',
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  activityAmountPositive: {
    color: '#16a34a',
  },
  activityAmountNegative: {
    color: '#dc2626',
  },
  activityMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: '#2563eb',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  quickHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyButton: {
    padding: 6,
  },
  flowToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  flowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingVertical: 10,
  },
  flowButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  flowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  flowLabelActive: {
    color: '#ffffff',
  },
  receiptActions: {
    marginTop: 12,
    marginBottom: 8,
    gap: 6,
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 12,
    paddingVertical: 10,
    backgroundColor: '#eef2ff',
  },
  receiptButtonDisabled: {
    opacity: 0.7,
  },
  receiptButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  receiptHelperText: {
    fontSize: 12,
    color: '#4b5563',
    lineHeight: 16,
  },
  receiptErrorText: {
    fontSize: 12,
    color: '#dc2626',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 12,
  },
  modalTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  profitModalCard: {
    gap: 8,
  },
  profitIntro: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
    lineHeight: 18,
  },
  profitSection: {
    marginTop: 8,
  },
  profitSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  profitModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  profitModeButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  profitModeButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  profitModeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  profitModeButtonTextActive: {
    color: '#ffffff',
  },
  profitHint: {
    fontSize: 12,
    color: '#64748b',
  },
  modalInputContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  modalInputWithIcon: {
    paddingRight: 44,
    marginBottom: 0,
  },
  modalInputIconButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    padding: 8,
    borderRadius: 18,
    backgroundColor: '#eef2ff',
  },
  activityAmountStack: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  activityProfitText: {
    fontSize: 12,
    color: '#64748b',
  },
  profitPreviewText: {
    fontSize: 12,
    color: '#475569',
    marginTop: -4,
    marginBottom: 8,
  },
  quickAdjustInfo: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  historyModal: {
    maxHeight: '70%',
  },
  historyList: {
    marginTop: 12,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  historyRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  historyRowMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  historyRowAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyRowAmountNegative: {
    color: '#dc2626',
  },
  historyRowAmountPositive: {
    color: '#16a34a',
  },
  historyAmountStack: {
    alignItems: 'flex-end',
  },
  historyProfitText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  historyEmpty: {
    marginTop: 12,
    fontSize: 13,
    color: '#6b7280',
  },
  historyGroup: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 4,
  },
  historyGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  historyGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  backupModal: {
    maxWidth: 320,
    alignSelf: 'center',
  },
  backupOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginVertical: 12,
  },
  backupOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  restoreButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    backgroundColor: '#fff1f2',
  },
  restoreButtonDisabled: {
    opacity: 0.6,
  },
  restoreButtonText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancel: {
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  modalSubmit: {
    backgroundColor: '#2563eb',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  scannerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  scannerModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 20,
  },
  scannerModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  scannerModalSubtitle: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  scannerCameraContainer: {
    marginTop: 16,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#000000',
  },
  scannerCameraView: {
    width: '100%',
    height: 260,
  },
  scannerFrame: {
    flex: 1,
    borderWidth: 2,
    borderColor: 'rgba(37,99,235,0.9)',
    borderRadius: 20,
    margin: 28,
  },
  scannerPermissionCard: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  scannerPermissionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
  },
  scannerPermissionText: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
  },
  scannerTip: {
    marginTop: 16,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  scannerButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  scannerButtonPrimary: {
    backgroundColor: '#2563eb',
  },
  scannerButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  scannerButtonGhost: {
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  scannerButtonGhostText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  captureButton: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
});
