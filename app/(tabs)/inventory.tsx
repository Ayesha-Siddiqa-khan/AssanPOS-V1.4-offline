import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  PermissionsAndroid,
  KeyboardAvoidingView,
  Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import Toast from 'react-native-toast-message';
import Fuse from 'fuse.js';
// TODO: Re-enable when expo-barcode-scanner is fixed for new architecture
// import { BarCodeScanner, BarCodeScannerResult } from 'expo-barcode-scanner';

import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/Button';
import { ScanModeToggle, ScanMode } from '../../components/ui/ScanModeToggle';
import { spacing, radii, textStyles, breakpoints } from '../../theme/tokens';
import { getLayoutSize } from '../../theme/layout';

const createCurrencyFormatter = () => {
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 0,
    });
  } catch (error) {
    console.warn('[Inventory] Intl currency formatter unavailable, using fallback', error);
    return {
      format: (value: number | bigint) => {
        const amount = Number(value) || 0;
        return `Rs. ${amount.toLocaleString()}`;
      },
    } as Intl.NumberFormat;
  }
};

const currencyFormatter = createCurrencyFormatter();

const INVENTORY_BARCODE_TYPES: BarcodeType[] = ['ean13', 'code128', 'upc_a', 'upc_e'];

type StockScannerTarget = {
  productId: number;
  variantId: number | null;
  displayName: string;
  barcode?: string | null;
  requireVariantMatch?: boolean;
  globalMatch?: boolean;
};

type InventoryDataShape = ReturnType<typeof useData>;
type ProductItem = InventoryDataShape['products'][number];
type VariantItem = NonNullable<ProductItem['variants']>[number];

const normalizeBarcodeValue = (value: string | number | null | undefined) =>
  (value == null ? '' : String(value))
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

export default function InventoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string | string[] }>();
  const filterParam = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const { products: rawProducts, deleteProduct, updateProduct } = useData();
  const products = rawProducts ?? [];
  const { language, t } = useLanguage();
  const insets = useSafeAreaInsets();
  const defaultFilters = { lowStockOnly: false, hasVariantsOnly: false };
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>({});
  const [filters, setFilters] = useState(defaultFilters);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [pendingFilters, setPendingFilters] = useState(defaultFilters);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceInput, setVoiceInput] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [canScanBarcode, setCanScanBarcode] = useState(true);
  const [isVoiceSessionActive, setIsVoiceSessionActive] = useState(false);
  const [stockScannerTarget, setStockScannerTarget] = useState<StockScannerTarget | null>(null);
  const [stockScannerQuantity, setStockScannerQuantity] = useState('');
  const [stockScannerCode, setStockScannerCode] = useState('');
  const [stockScannerMessage, setStockScannerMessage] = useState<string | null>(null);
  const [hasStockScannerScan, setHasStockScannerScan] = useState(false);
  const [canScanStockAdjust, setCanScanStockAdjust] = useState(true);
  const [isStockScannerSaving, setIsStockScannerSaving] = useState(false);
  const [showStockScannerCamera, setShowStockScannerCamera] = useState(true);
  const [stockScanMode, setStockScanMode] = useState<ScanMode>('barcode');
  const [scannerPermissionGranted, setScannerPermissionGranted] = useState(false);

  useEffect(() => {
    if (cameraPermission?.granted) {
      setScannerPermissionGranted(true);
    }
  }, [cameraPermission?.granted]);

  const ensureScannerPermission = useCallback(async () => {
    if (scannerPermissionGranted || cameraPermission?.granted) {
      setScannerPermissionGranted(true);
      return true;
    }
    const response = await requestCameraPermission();
    if (!response?.granted) {
      Toast.show({
        type: 'info',
        text1: t('Camera permission required'),
        text2: t('Allow camera access to scan barcodes.'),
      });
      return false;
    }
    setScannerPermissionGranted(true);
    return true;
  }, [cameraPermission?.granted, requestCameraPermission, scannerPermissionGranted, t]);

  const totalProducts = products.length;
  const layoutSize = getLayoutSize();
  const voiceLocale = useMemo(() => (language === 'urdu' ? 'ur-PK' : 'en-US'), [language]);
  
  // Debounce search query for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (filterModalVisible) {
      setPendingFilters(filters);
    }
  }, [filterModalVisible, filters]);

  useEffect(() => {
    if (filterParam === 'low') {
      setFilters((prev) => ({ ...prev, lowStockOnly: true }));
      requestAnimationFrame(() => router.replace('/inventory'));
    }
  }, [filterParam, router]);

  const handleOpenScanner = () => {
    setShowBarcodeModal(true);
    setBarcodeInput('');
    setShowCamera(true);
  };

  const handleBarcodeManualSearch = () => {
    const trimmed = barcodeInput.trim();
    if (!trimmed) {
      Toast.show({ type: 'info', text1: t('Enter barcode') });
      return;
    }
    setSearchQuery(trimmed);
    setShowSuggestions(true);
    setShowBarcodeModal(false);
    setBarcodeInput('');
  };

  const handleBarcodeModalClose = () => {
    setShowBarcodeModal(false);
    setBarcodeInput('');
    setShowCamera(false);
  };

  const handleCameraScanRequest = async () => {
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission();
      if (!response?.granted) {
        Toast.show({ type: 'info', text1: t('Camera permission required') });
        return;
      }
    }
    setCanScanBarcode(true);
    setShowCamera(true);
  };

  const handleBarcodeDetected = (value: string) => {
    if (!canScanBarcode) {
      return;
    }
    setCanScanBarcode(false);
    Vibration.vibrate(50);

    try {
      console.log('[DEBUG] inventory search scan:', value);
      Toast.show({ type: 'info', text1: 'Scanned (inventory search)', text2: value });
      setSearchQuery(value);
      setShowSuggestions(true);
      setShowBarcodeModal(false);
      setShowCamera(false);
      setBarcodeInput('');
      Toast.show({ type: 'success', text1: t('Barcode scanned'), text2: value });
    } catch (error) {
      console.error('[Inventory] Barcode detection error:', error);
      Toast.show({ type: 'error', text1: t('Scan error'), text2: t('Please try again') });
    }
    
    // Re-enable scanning after a delay
    setTimeout(() => setCanScanBarcode(true), 2000);
  };

  useEffect(() => {
    if (showCamera) {
      setCanScanBarcode(true);
      setScanMode('barcode');
    }
  }, [showCamera]);

  useEffect(() => {
    if (showStockScannerCamera) {
      setStockScanMode('barcode');
    }
  }, [showStockScannerCamera]);

  const barcodeTypesForMode = useMemo<BarcodeType[]>(() => {
    if (scanMode === 'qr') {
      return ['qr'];
    }
    if (scanMode === 'barcode') {
      return [...INVENTORY_BARCODE_TYPES];
    }
    return ['qr', ...INVENTORY_BARCODE_TYPES];
  }, [scanMode]);

  const stockBarcodeTypesForMode = useMemo<BarcodeType[]>(() => {
    if (stockScanMode === 'qr') {
      return ['qr'];
    }
    if (stockScanMode === 'barcode') {
      return [...INVENTORY_BARCODE_TYPES];
    }
    return ['qr', ...INVENTORY_BARCODE_TYPES];
  }, [stockScanMode]);

  const openStockScanner = useCallback(
    async (product: ProductItem, variant?: VariantItem) => {
      if (!product) {
        Toast.show({ type: 'error', text1: t('Product unavailable') });
        return;
      }
      const hasPermission = await ensureScannerPermission();
      if (!hasPermission) {
        return;
      }
      const displayName = variant
        ? `${product.name ?? ''} - ${variant.name ?? ''}`.trim()
        : product.name ?? '';
      const barcodeValue =
        variant?.barcode ?? (!product.hasVariants ? product.barcode : undefined) ?? null;
      setStockScannerTarget({
        productId: product.id,
        variantId: variant?.id ?? null,
        displayName: displayName || t('Unknown product'),
        barcode: barcodeValue,
        requireVariantMatch: false,
      });
      setStockScannerQuantity('');
      setStockScannerMessage(
        barcodeValue
          ? t('Scan the barcode to start adding stock.')
          : t('Scan the barcode or enter quantity manually.'),
      );
      setHasStockScannerScan(false);
      setCanScanStockAdjust(true);
      setShowStockScannerCamera(true);
      setStockScannerCode('');
    },
    [ensureScannerPermission, t],
  );

  const openProductScanner = useCallback(
    async (product?: ProductItem) => {
      const hasPermission = await ensureScannerPermission();
      if (!hasPermission) {
        return;
      }
      if (!product) {
        if (products.length === 0) {
          Toast.show({ type: 'info', text1: t('No products available to scan') });
          return;
        }
        setStockScannerTarget({
          productId: -1,
          variantId: null,
          displayName: t('Scan product barcode'),
          barcode: null,
          requireVariantMatch: false,
          globalMatch: true,
        });
        setStockScannerQuantity('');
        setStockScannerMessage(t('Scan a product barcode to add stock.'));
        setHasStockScannerScan(false);
        setCanScanStockAdjust(true);
        setShowStockScannerCamera(true);
        setStockScannerCode('');
        return;
      }
      const hasVariantBarcodes =
        product.hasVariants &&
        !!product.variants &&
        product.variants.some((variant) => !!variant.barcode);
      const requiresVariant = !!hasVariantBarcodes;
      const barcodeValue = requiresVariant ? null : product.barcode ?? null;
      setStockScannerTarget({
        productId: product.id,
        variantId: null,
        displayName: product.name ?? t('Unknown product'),
        barcode: barcodeValue,
        requireVariantMatch: requiresVariant,
      });
      setStockScannerQuantity('');
      setStockScannerMessage(
        requiresVariant
          ? t('Scan a variant barcode to add stock.')
          : barcodeValue
            ? t('Scan the barcode to start adding stock.')
            : t('Scan the barcode or enter quantity manually.'),
      );
      setHasStockScannerScan(false);
      setCanScanStockAdjust(true);
      setShowStockScannerCamera(true);
      setStockScannerCode('');
    },
    [ensureScannerPermission, products.length, t],
  );

  const closeStockScanner = useCallback(() => {
    setStockScannerTarget(null);
    setStockScannerQuantity('');
    setStockScannerCode('');
    setStockScannerMessage(null);
    setHasStockScannerScan(false);
    setCanScanStockAdjust(true);
    setIsStockScannerSaving(false);
    setShowStockScannerCamera(true);
  }, []);

  const handleStockScannerDetected = useCallback(
    (value: string) => {
      if (!stockScannerTarget || !canScanStockAdjust) {
        return;
      }
      Vibration.vibrate(50);
      console.log('[DEBUG] stock adjust scan:', value);
      Toast.show({ type: 'info', text1: 'Scanned (stock adjust)', text2: value });
      setCanScanStockAdjust(false);
      const trimmed = value.trim();
      const normalize = (input: string | number | null | undefined) =>
        (input == null ? '' : String(input)).trim();

      if (stockScannerTarget.globalMatch) {
        let matchedProduct: ProductItem | undefined;
        let matchedVariant: VariantItem | undefined;
        for (const product of products) {
          if (product.hasVariants && product.variants) {
            matchedVariant = product.variants.find(
              (variant) => normalize(variant.barcode) === trimmed,
            );
            if (matchedVariant) {
              matchedProduct = product;
              break;
            }
          }
          if (normalize(product.barcode) === trimmed) {
            matchedProduct = product;
            matchedVariant = undefined;
            break;
          }
        }
        if (!matchedProduct) {
          setStockScannerMessage(t('No product matches this barcode.'));
          setTimeout(() => setCanScanStockAdjust(true), 1500);
          return;
        }
        const displayName = matchedVariant
          ? `${matchedProduct.name ?? ''} - ${matchedVariant.name ?? ''}`.trim()
          : matchedProduct.name ?? '';
        setStockScannerTarget({
          productId: matchedProduct.id,
          variantId: matchedVariant?.id ?? null,
          displayName: displayName || t('Unknown product'),
          barcode: matchedVariant?.barcode ?? matchedProduct.barcode ?? null,
          requireVariantMatch: false,
          globalMatch: false,
        });
        setHasStockScannerScan(true);
        setStockScannerMessage(t('Barcode matched. Enter quantity below.'));
        setShowStockScannerCamera(false);
        setStockScannerCode(trimmed);
        setTimeout(() => setCanScanStockAdjust(true), 1000);
        return;
      }

      if (stockScannerTarget.requireVariantMatch && !stockScannerTarget.variantId) {
        const productRecord = products.find((item) => item.id === stockScannerTarget.productId);
        if (!productRecord || !productRecord.variants || productRecord.variants.length === 0) {
          setStockScannerMessage(t('No variants available for this product.'));
          setTimeout(() => setCanScanStockAdjust(true), 1500);
          return;
        }
        const matchedVariant = productRecord.variants.find(
          (variant) => normalize(variant.barcode) === trimmed,
        );
        if (!matchedVariant) {
          setStockScannerMessage(t('No matching variant found. Try again.'));
          setTimeout(() => setCanScanStockAdjust(true), 1500);
          return;
        }
        setStockScannerTarget((prev) =>
          prev
            ? {
                ...prev,
                variantId: matchedVariant.id,
                displayName: `${productRecord.name ?? ''} - ${matchedVariant.name ?? ''}`.trim(),
                barcode: matchedVariant.barcode ?? null,
                requireVariantMatch: false,
              }
            : prev,
        );
        setHasStockScannerScan(true);
        setStockScannerMessage(t('Barcode matched. Enter quantity below.'));
        setShowStockScannerCamera(false);
        setStockScannerCode(trimmed);
        setTimeout(() => setCanScanStockAdjust(true), 1000);
        return;
      }

      const expected = normalize(stockScannerTarget.barcode);

      // If this target has no barcode, try to retarget globally to the scanned code
      if (!expected) {
        let matchedProduct: ProductItem | undefined;
        let matchedVariant: VariantItem | undefined;
        for (const product of products) {
          if (product.hasVariants && product.variants) {
            matchedVariant = product.variants.find(
              (variant) => normalize(variant.barcode) === trimmed,
            );
            if (matchedVariant) {
              matchedProduct = product;
              break;
            }
          }
          if (normalize(product.barcode) === trimmed) {
            matchedProduct = product;
            matchedVariant = undefined;
            break;
          }
        }

        if (matchedProduct) {
          const displayName = matchedVariant
            ? `${matchedProduct.name ?? ''} - ${matchedVariant.name ?? ''}`.trim()
            : matchedProduct.name ?? '';
          setStockScannerTarget({
            productId: matchedProduct.id,
            variantId: matchedVariant?.id ?? null,
            displayName: displayName || t('Unknown product'),
            barcode: matchedVariant?.barcode ?? matchedProduct.barcode ?? null,
            requireVariantMatch: false,
            globalMatch: false,
          });
          setHasStockScannerScan(true);
          setStockScannerMessage(t('Barcode matched. Enter quantity below.'));
          setShowStockScannerCamera(false);
          setStockScannerCode(trimmed);
          setTimeout(() => setCanScanStockAdjust(true), 1000);
          return;
        }

        setStockScannerMessage(t('No product matches this barcode.'));
        setTimeout(() => setCanScanStockAdjust(true), 1500);
        return;
      }

      if (expected !== trimmed) {
        setStockScannerMessage(t('Scanned code does not match this item. Try again.'));
        setTimeout(() => setCanScanStockAdjust(true), 1500);
        return;
      }
      setHasStockScannerScan(true);
      setStockScannerMessage(t('Barcode matched. Enter quantity below.'));
      setShowStockScannerCamera(false);
      setStockScannerCode(trimmed);
      setTimeout(() => setCanScanStockAdjust(true), 1000);
    },
    [stockScannerTarget, canScanStockAdjust, products, t],
  );

  const handleStockScannerSave = useCallback(async () => {
    if (!stockScannerTarget) {
      return;
    }
    const parsed = Number.parseFloat(stockScannerQuantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Toast.show({ type: 'info', text1: t('Enter a valid quantity') });
      return;
    }
    if (stockScannerTarget.requireVariantMatch && !stockScannerTarget.variantId) {
      Toast.show({ type: 'info', text1: t('Scan a variant to continue') });
      return;
    }
    const productRecord = products.find((item) => item.id === stockScannerTarget.productId);
    if (!productRecord) {
      Toast.show({ type: 'error', text1: t('Product unavailable') });
      return;
    }

    try {
      setIsStockScannerSaving(true);
      if (stockScannerTarget.variantId && productRecord.hasVariants && productRecord.variants) {
        const updatedVariants = productRecord.variants.map((variant) => {
          if (variant.id === stockScannerTarget.variantId) {
            const nextStock = Math.max(0, (variant.stock ?? 0) + parsed);
            return { ...variant, stock: nextStock };
          }
          return variant;
        });
        await updateProduct(productRecord.id, { variants: updatedVariants });
      } else {
        const nextStock = Math.max(0, (productRecord.stock ?? 0) + parsed);
        await updateProduct(productRecord.id, { stock: nextStock });
      }
      Toast.show({ type: 'success', text1: t('Stock updated') });
      closeStockScanner();
    } catch (error) {
      console.error('[Inventory] Failed to update stock via scanner', error);
      Toast.show({ type: 'error', text1: t('Unable to update stock') });
    } finally {
      setIsStockScannerSaving(false);
    }
  }, [closeStockScanner, products, stockScannerQuantity, stockScannerTarget, t, updateProduct]);

  // Speech recognition using expo-speech-recognition
  useSpeechRecognitionEvent('start', () => {
    if (__DEV__) console.log('[Inventory] Speech recognition started');
    setIsVoiceListening(true);
    setIsVoiceSessionActive(true);
  });

  useSpeechRecognitionEvent('end', () => {
    if (__DEV__) console.log('[Inventory] Speech recognition ended');
    setIsVoiceListening(false);
    setIsVoiceSessionActive(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    console.log('[Inventory] Speech result:', event.results);
    const results = event.results;
    if (results && results.length > 0) {
      const result = results[results.length - 1];
      const transcript = (result as any)?.transcript ?? (result as any)?.transcription;
      if (transcript) {
        setVoiceInput(transcript);
        const isFinal = (result as any)?.isFinal ?? false;
        if (isFinal) {
          setIsVoiceListening(false);
          setIsVoiceSessionActive(false);
        }
      }
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.warn('[Inventory] Speech error:', event.error);
    setVoiceError(event.message ?? t('Could not understand audio'));
    setIsVoiceListening(false);
    setIsVoiceSessionActive(false);
  });

  const ensureVoicePermission = useCallback(async () => {
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return granted;
    } catch (error) {
      console.error('[Inventory] Failed to request microphone permission', error);
      return false;
    }
  }, []);

  const startVoiceListening = useCallback(async () => {
    try {
      setVoiceError(null);
      setVoiceInput('');
      setIsVoiceListening(true);

      const options = {
        lang: voiceLocale || 'en-US',
        interimResults: true,
        maxAlternatives: 3,
        continuous: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        contextualStrings: [],
      };

      await ExpoSpeechRecognitionModule.start(options);
      setIsVoiceSessionActive(true);
      Toast.show({
        type: 'info',
        text1: t('Listening...'),
        text2: t('Speak now'),
        visibilityTime: 2000,
      });
    } catch (error) {
      console.error('[Inventory] Unable to start voice recognition', error);
      setIsVoiceListening(false);
      const message =
        error instanceof Error && error.message
          ? error.message
          : t('Unable to start voice recognition');
      setVoiceError(message);
      setIsVoiceSessionActive(false);
      Toast.show({
        type: 'error',
        text1: t('Voice search unavailable'),
        text2: message,
        visibilityTime: 3000,
      });
    }
  }, [t, voiceLocale]);

  const stopVoiceListening = useCallback(async () => {
    if (!isVoiceSessionActive) {
      setIsVoiceListening(false);
      return;
    }
    try {
      await ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      console.warn('[Inventory] Failed to stop voice recognition', error);
    } finally {
      setIsVoiceListening(false);
      setIsVoiceSessionActive(false);
    }
  }, [isVoiceSessionActive]);

  const handleVoiceSearch = useCallback(async () => {
    // Voice recognition temporarily disabled due to compatibility issues
    // TODO: Implement alternative voice search solution
    Toast.show({
      type: 'info',
      text1: t('Voice Search'),
      text2: t('Voice search is temporarily unavailable. Use text search or barcode scanner.'),
      visibilityTime: 3000,
    });
    return;
    
    const granted = await ensureVoicePermission();
    if (!granted) {
      Toast.show({
        type: 'info',
        text1: t('Microphone permission required'),
        text2: t('Enable microphone to use voice search.'),
        visibilityTime: 2500,
      });
      return;
    }
    setVoiceModalVisible(true);
    startVoiceListening();
  }, [ensureVoicePermission, startVoiceListening, t]);

  const handleVoiceRetry = useCallback(() => {
    startVoiceListening();
  }, [startVoiceListening]);

  const handleVoiceModalClose = useCallback(() => {
    stopVoiceListening();
    setVoiceModalVisible(false);
    setVoiceInput('');
    setVoiceError(null);
  }, [stopVoiceListening]);

  const handleVoiceSubmit = () => {
    const normalized = voiceInput.trim();
    if (!normalized) {
      Toast.show({ type: 'info', text1: t('Enter a product name') });
      return;
    }

    stopVoiceListening();
    setSearchQuery(normalized);
    setShowSuggestions(true);
    setVoiceModalVisible(false);
    setVoiceInput('');
    setVoiceError(null);
    Toast.show({
      type: 'success',
      text1: t('Voice Search'),
      text2: normalized,
    });
  };

  const stockValue = useMemo(() => {
    return products.reduce((sum, product) => {
      if (product.hasVariants && product.variants) {
        const variantTotal = product.variants.reduce((variantSum, variant) => {
          const basePrice = variant.costPrice ?? variant.price ?? 0;
          return variantSum + basePrice * (variant.stock ?? 0);
        }, 0);
        return sum + variantTotal;
      }
      const basePrice = product.costPrice ?? product.price ?? 0;
      return sum + basePrice * (product.stock ?? 0);
    }, 0);
  }, [products]);

  const lowStockCount = useMemo(
    () =>
      products.filter((product) => {
        if (product.hasVariants && product.variants) {
          return product.variants.some(
            (variant) =>
              variant.stock !== undefined &&
              variant.minStock !== undefined &&
              variant.stock <= variant.minStock
          );
        }
        if (product.stock === undefined || product.minStock === undefined) {
          return false;
        }
        return product.stock <= product.minStock;
      }).length,
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = debouncedQuery.trim().toLowerCase();
    const barcodeQuery = normalizeBarcodeValue(debouncedQuery);
    
    // Apply filters first
    const passesFilters = (product: typeof products[number]) => {
      if (filters.lowStockOnly) {
        const isLow =
          product.hasVariants && product.variants
            ? product.variants.some(
                (variant) =>
                  variant.stock !== undefined &&
                  variant.minStock !== undefined &&
                  variant.stock <= variant.minStock
              )
            : product.stock !== undefined &&
              product.minStock !== undefined &&
              product.stock <= product.minStock;
        if (!isLow) {
          return false;
        }
      }
      if (filters.hasVariantsOnly && !product.hasVariants) {
        return false;
      }
      return true;
    };

    let filtered = products.filter(passesFilters);

    // Apply search if there's a query
    if (query) {
      // Fast path: direct barcode match
      const directBarcodeMatch = filtered.find(
        (product) =>
          normalizeBarcodeValue(product.barcode) === barcodeQuery ||
          (product.hasVariants &&
            product.variants &&
            product.variants.some((v) => normalizeBarcodeValue(v.barcode) === barcodeQuery))
      );
      if (directBarcodeMatch) {
        return [directBarcodeMatch];
      }

      // Create searchable items with product and variant combinations
      const searchableItems = filtered.flatMap((product) => {
        const items = [
          {
            product,
            searchText: product.name || '',
            category: product.category || '',
            barcode: product.barcode != null ? String(product.barcode) : '',
            isVariant: false,
            variantId: null as number | null,
          },
        ];

        // Add variant combinations
        if (product.hasVariants && product.variants) {
          product.variants.forEach((variant) => {
            items.push({
              product,
              searchText: `${product.name} - ${variant.name}`,
              category: product.category || '',
              barcode: variant.barcode != null ? String(variant.barcode) : '',
              isVariant: true,
              variantId: variant.id,
            });
          });
        }

        return items;
      });

      // Configure Fuse.js
      const fuse = new Fuse(searchableItems, {
        keys: [
          { name: 'searchText', weight: 2 },
          { name: 'category', weight: 1 },
          { name: 'barcode', weight: 1.5 },
        ],
        threshold: 0.3,
        ignoreLocation: true,
        useExtendedSearch: false,
        distance: 100,
        minMatchCharLength: 1,
        includeScore: true,
      });

      // Search and get unique products
      const results = fuse.search(query);
      
      // Filter results by score - only keep very good matches
      // If query is long and specific (like "shell - R3"), be very strict
      // If query is short (like "r"), be more lenient
      const isSpecificQuery = query.length > 3;
      const maxScore = isSpecificQuery ? 0.05 : 0.2; // Stricter for specific searches
      const filteredResults = results.filter(r => (r.score ?? 1) <= maxScore);
      
      const productIds = new Set(filteredResults.map((result) => result.item.product.id));
      filtered = filtered.filter((product) => productIds.has(product.id));

      // Store matching variant IDs for filtering display
      const matchingVariantIds = new Set(
        filteredResults
          .filter(r => r.item.isVariant && r.item.variantId)
          .map(r => r.item.variantId)
      );

      // Filter variants in products to only show matching ones
      filtered = filtered.map(product => {
        if (product.hasVariants && product.variants && matchingVariantIds.size > 0) {
          const filteredVariants = product.variants.filter(v => 
            matchingVariantIds.has(v.id)
          );
          
          // If no variants match but product name matches, show all variants
          if (filteredVariants.length === 0) {
            return product;
          }
          
          return {
            ...product,
            variants: filteredVariants,
          };
        }
        return product;
      });

      // Auto-expand products when search matches variants
      const productsToExpand: Record<number, boolean> = {};
      filteredResults.forEach((result) => {
        if (result.item.isVariant) {
          productsToExpand[result.item.product.id] = true;
        }
      });

      if (Object.keys(productsToExpand).length > 0) {
        setExpandedProducts((prev) => ({ ...prev, ...productsToExpand }));
      }
    }

    return filtered;
  }, [products, debouncedQuery, filters]);

  // Auto-suggestions for search (uses immediate searchQuery for responsiveness)
  const suggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const barcodeQuery = normalizeBarcodeValue(searchQuery);
    if (!query || query.length < 1) {
      return [];
    }

    const suggestionSet = new Set<{ text: string; type: 'product' | 'variant' | 'category'; productId?: number }>();
    
    products.forEach((product) => {
      // Product name suggestions
      if (product.name?.toLowerCase().includes(query)) {
        suggestionSet.add({ text: product.name, type: 'product', productId: product.id });
      }
      
      // Category suggestions
      if (product.category && product.category.toLowerCase().includes(query)) {
        suggestionSet.add({ text: product.category, type: 'category' });
      }
      
      // Barcode suggestions
      if (product.barcode && normalizeBarcodeValue(product.barcode).includes(barcodeQuery)) {
        suggestionSet.add({ text: `${product.name} (${product.barcode})`, type: 'product', productId: product.id });
      }
      
      // Variant suggestions
      if (product.hasVariants && product.variants) {
        product.variants.forEach((variant) => {
          // Check if variant name matches
          if (variant.name?.toLowerCase().includes(query)) {
            suggestionSet.add({ 
              text: `${product.name} - ${variant.name}`, 
              type: 'variant', 
              productId: product.id 
            });
          }
          
          // Check if combined name matches (for cases like searching "malaysian - bristol")
          const combinedName = `${product.name} - ${variant.name}`.toLowerCase();
          if (combinedName.includes(query) && 
              !variant.name?.toLowerCase().includes(query) && 
              !product.name?.toLowerCase().includes(query)) {
            suggestionSet.add({ 
              text: `${product.name} - ${variant.name}`, 
              type: 'variant', 
              productId: product.id 
            });
          }
          
          // Check if variant barcode matches
          if (variant.barcode && normalizeBarcodeValue(variant.barcode).includes(barcodeQuery)) {
            suggestionSet.add({ 
              text: `${product.name} - ${variant.name} (${variant.barcode})`, 
              type: 'variant', 
              productId: product.id 
            });
          }
        });
      }
    });
    
    return Array.from(suggestionSet).slice(0, 8); // Limit to 8 suggestions
  }, [products, searchQuery]);

  const handleSuggestionSelect = (suggestion: typeof suggestions[number]) => {
    setSearchQuery(suggestion.text);
    setShowSuggestions(false);
    
    // Expand the product if productId is available
    if (suggestion.productId) {
      // Use setTimeout to ensure the search query is set first
      setTimeout(() => {
        setExpandedProducts((prev) => ({ ...prev, [suggestion.productId!]: true }));
      }, 100);
    }
  };

  const handleDeleteVariant = useCallback(
    (productId: number, variantId: number) => {
      const product = products.find((item) => item.id === productId);
      if (!product) {
        return;
      }

      Alert.alert(
        t('Delete Variant'),
        t('Are you sure you want to delete this variant?'),
        [
          { text: t('Cancel'), style: 'cancel' },
          {
            text: t('Remove'),
            style: 'destructive',
            onPress: async () => {
              try {
                const updatedVariants =
                  product.variants?.filter((variant) => variant.id !== variantId) ?? [];
                await updateProduct(productId, {
                  variants: updatedVariants,
                  hasVariants: true,
                });
                Toast.show({ type: 'success', text1: t('Variant removed successfully') });
              } catch (error) {
                console.error('Failed to delete variant', error);
                Toast.show({ type: 'error', text1: t('Something went wrong') });
              }
            },
          },
        ]
      );
    },
    [products, t, updateProduct]
  );

  const togglePendingFilter = (key: keyof typeof defaultFilters) => {
    setPendingFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApplyFilters = () => {
    setFilters(pendingFilters);
    setFilterModalVisible(false);
  };

  const handleClearFilters = () => {
    setPendingFilters(defaultFilters);
    setFilters(defaultFilters);
  };

  // Helper function to highlight matching text
  const highlightText = (text: string, query: string, textStyle: any = styles.productName) => {
    if (!query.trim()) return <Text style={textStyle}>{text}</Text>;

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);

    return (
      <Text style={textStyle}>
        {parts.map((part, index) =>
          regex.test(part) ? (
            <Text key={`hl-${index}`} style={styles.highlightedText}>
              {part}
            </Text>
          ) : (
            <Text key={`hl-${index}`} style={textStyle}>
              {part}
            </Text>
          )
        )}
      </Text>
    );
  };

  const emptyState = filteredProducts.length === 0;

  return (
    <>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom + spacing.xl, 160) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <Text style={styles.headerTitle}>{t('Inventory Management')}</Text>

        <View style={styles.searchWrapper}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('Search products, variants, or barcode...')}
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setShowSuggestions(text.trim().length >= 1);
              }}
              onFocus={() => {
                if (searchQuery.trim().length >= 1) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                // Delay hiding suggestions to allow tap on suggestion
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                style={styles.clearButton} 
                onPress={() => {
                  setSearchQuery('');
                  setShowSuggestions(false);
                }}
              >
                <Ionicons name="close-circle" size={18} color="#9ca3af" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.scanButton} onPress={handleOpenScanner}>
              <Ionicons name="scan-outline" size={20} color="#2563eb" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.voiceButton} onPress={handleVoiceSearch}>
              <Ionicons name="mic-outline" size={20} color="#10b981" />
            </TouchableOpacity>
          </View>

          {showSuggestions && suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              {suggestions.map((suggestion, index) => (
                <TouchableOpacity
                  key={`${suggestion.type}-${index}`}
                  style={styles.suggestionItem}
                  onPress={() => handleSuggestionSelect(suggestion)}
                >
                  <Ionicons 
                    name={
                      suggestion.type === 'category' ? 'folder-outline' : 
                      suggestion.type === 'variant' ? 'list-outline' : 
                      'cube-outline'
                    } 
                    size={16} 
                    color="#6b7280" 
                  />
                  <Text style={styles.suggestionText}>{suggestion.text}</Text>
                  <View style={[
                    styles.suggestionBadge,
                    suggestion.type === 'category' && styles.categoryBadge,
                    suggestion.type === 'variant' && styles.suggestionVariantBadge,
                  ]}>
                    <Text style={styles.suggestionBadgeText}>
                      {suggestion.type === 'category' ? t('Category') : 
                       suggestion.type === 'variant' ? t('Variant') : 
                       t('Product')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              (filters.lowStockOnly || filters.hasVariantsOnly) && styles.filterButtonActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setFilterModalVisible(true)}
          >
            <Ionicons name="funnel-outline" size={16} color="#2563eb" />
            <Text style={styles.filterLabel}>{t('Filter')}</Text>
            <Ionicons name="chevron-down" size={14} color="#2563eb" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.scanHeaderButton, styles.scanSegment]}
            activeOpacity={0.85}
            onPress={() => openProductScanner()}
            disabled={products.length === 0}
          >
            <Ionicons name="barcode-outline" size={16} color="#047857" />
            <Text style={styles.scanSegmentLabel}>{t('Scan')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.85}
            onPress={() => router.push('/modals/product-entry')}
          >
            <Ionicons name="add" size={16} color="#ffffff" />
            <Text style={styles.addButtonLabel}>{t('Add Product')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.totalCard]}>
            <View style={styles.statTop}>
              <Ionicons name="cube-outline" size={16} color="#0f172a" />
              <Text style={styles.statLabel}>{t('Total Products')}</Text>
            </View>
            <Text style={styles.statValue}>{String(totalProducts)}</Text>
          </View>
          <View style={[styles.statCard, styles.valueCard]}>
            <View style={styles.statTop}>
              <Ionicons name="cash-outline" size={16} color="#047857" />
              <Text style={styles.statLabel}>{t('Stock Value')}</Text>
            </View>
            <Text style={[styles.statValue, styles.statValuePositive]} numberOfLines={1} adjustsFontSizeToFit>
              {currencyFormatter.format(stockValue)}
            </Text>
          </View>
          <View style={[styles.statCard, styles.lowStockCard]}>
            <View style={styles.statTop}>
              <Ionicons name="warning-outline" size={16} color="#b91c1c" />
              <Text style={styles.statLabel}>{t('Low Stock')}</Text>
            </View>
            <Text style={[styles.statValue, styles.statValueWarning]}>{String(lowStockCount)}</Text>
          </View>
        </View>

        {emptyState ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color="#cbd5f5" />
            <Text style={styles.emptyText}>{t('No products found')}</Text>
          </View>
        ) : (
          <View style={styles.productList}>
            {filteredProducts.map((product) => {
              const baseStock = product.stock ?? 0;
              const totalStock =
                product.hasVariants && product.variants
                  ? product.variants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0)
                  : baseStock;
              const variantCount = product.variants?.length ?? 0;
              const baseValue = (product.price ?? 0) * baseStock;
              const baseStatusStyle =
                baseStock === 0
                  ? styles.variantCardDanger
                  : baseStock < 5
                  ? styles.variantCardWarning
                  : styles.variantCardOkay;
              const isExpanded = Boolean(expandedProducts[product.id]);
              const isVariantProduct = product.hasVariants && product.variants;

              return (
                <View key={product.id} style={styles.productCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitle}>
                      <View style={styles.avatarCircle}>
                        <Ionicons name="cube-outline" size={20} color="#2563eb" />
                      </View>
                      <View>
                        {highlightText(product.name || '', debouncedQuery)}
                        <Text style={styles.productMeta}>{product.category}</Text>
                      </View>
                    </View>
                    <View style={styles.variantBadge}>
                      <Text style={styles.variantBadgeValue}>{String(variantCount)}</Text>
                      <Text style={styles.variantBadgeLabel}>
                        {variantCount === 1 ? t('variant') : t('variants')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.variantLinksRow}>
                    <TouchableOpacity
                      onPress={() =>
                        setExpandedProducts((prev) => ({
                          ...prev,
                          [product.id]: !prev[product.id],
                        }))
                      }
                      activeOpacity={0.75}
                    >
                      <Text style={styles.linkText}>
                        {isVariantProduct
                          ? isExpanded
                            ? t('Hide variants')
                            : t('Show variants')
                          : isExpanded
                            ? 'Hide details'
                            : 'View details'}
                      </Text>
                    </TouchableOpacity>
                    {product.hasVariants ? (
                      <TouchableOpacity
                        onPress={() =>
                          router.push(`/modals/product-variants?productId=${product.id}`)
                        }
                        activeOpacity={0.75}
                      >
                        <Text style={styles.linkText}>{t('Add variant')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {isExpanded && product.hasVariants && product.variants && (
                    <View style={styles.variantList}>
                      {product.variants.length === 0 ? (
                        <Text style={styles.variantEmpty}>{t('No variants yet')}</Text>
                      ) : (
                        product.variants.map((variant) => {
                          const variantValue =
                            (variant.price ?? 0) * (variant.stock ?? 0);
                          const stockCount = variant.stock ?? 0;
                          const cardStatusStyle =
                            stockCount === 0
                              ? styles.variantCardDanger
                              : stockCount < 5
                              ? styles.variantCardWarning
                              : styles.variantCardOkay;

                          return (
                            <View key={variant.id} style={[styles.variantCard, cardStatusStyle]}>
                              <View style={styles.variantHeaderCompact}>
                                <View style={styles.variantNameRow}>
                                  <Ionicons name="pricetag-outline" size={14} color="#2563eb" />
                                  {highlightText(variant.name || '', debouncedQuery, styles.variantName)}
                                </View>
                                <Text style={styles.variantValueSmall}>
                                  {t('Value')}: <Text style={styles.variantStatValueBold}>{currencyFormatter.format(variantValue)}</Text>
                                </Text>
                              </View>

                              <View style={styles.variantStatsCompact}>
                                <View style={styles.variantStatColumn}>
                                  <View style={styles.stockRow}>
                                    <Text style={styles.variantStatValue}>
                                      {t('Stock')}: {String(stockCount)}
                                    </Text>
                                    {stockCount === 0 ? (
                                      <View style={styles.stockPillDanger}>
                                        <Text style={styles.stockPillDangerText}>{t('Out of stock')}</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                  <Text style={styles.variantStatValue}>
                                    {t('Cost')}: {currencyFormatter.format(variant.costPrice ?? 0)}
                                  </Text>
                                </View>
                                <View style={styles.variantStatColumnRight}>
                                  <Text style={styles.variantStatValueBold}>
                                    {t('Price')}: {currencyFormatter.format(variant.price ?? 0)}
                                  </Text>
                                </View>
                              </View>

                              <View style={styles.variantActions}>
                                <View style={styles.variantActionButtons}>
                                  <TouchableOpacity
                                    style={[styles.adjustButton, styles.scanActionButton]}
                                    onPress={() => openStockScanner(product, variant)}
                                  >
                                    <Text style={[styles.adjustLabel, styles.scanActionLabel]}>
                                      {t('Add')}
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.adjustButton}
                                    onPress={() =>
                                      router.push(
                                        `/modals/stock-adjustment?productId=${product.id}&variantId=${variant.id}`
                                      )
                                    }
                                  >
                                    <Ionicons name="cube-outline" size={16} color="#2563eb" />
                                    <Text style={styles.adjustLabel}>{t('Adjust')}</Text>
                                  </TouchableOpacity>
                                </View>
                                <View style={styles.variantActionIcons}>
                                  <TouchableOpacity
                                    style={styles.iconButtonLeft}
                                    onPress={() =>
                                      router.push(
                                        `/modals/variant-edit?productId=${product.id}&variantId=${variant.id}`
                                      )
                                    }
                                  >
                                    <Ionicons name="create-outline" size={16} color="#2563eb" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.iconButtonDelete}
                                    onPress={() => handleDeleteVariant(product.id, variant.id)}
                                  >
                                    <Ionicons name="trash-outline" size={15} color="#ef4444" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}

                  {isExpanded && !product.hasVariants && (
                    <View style={[styles.variantCard, baseStatusStyle]}>
                      <View style={styles.variantHeaderCompact}>
                        <View style={styles.variantNameRow}>
                          <Ionicons name="pricetag-outline" size={14} color="#2563eb" />
                          <Text style={styles.variantName}>{t('Base')}</Text>
                        </View>
                        <Text style={styles.variantValueSmall}>
                          {t('Value')}:{' '}
                          <Text style={styles.variantStatValueBold}>
                            {currencyFormatter.format(baseValue)}
                          </Text>
                        </Text>
                      </View>

                      <View style={styles.variantStatsCompact}>
                        <View style={styles.variantStatColumn}>
                          <Text style={styles.variantStatValue}>
                            {t('Stock')}: {String(baseStock)}
                          </Text>
                          <Text style={styles.variantStatValue}>
                            {t('Cost')}: {currencyFormatter.format(product.costPrice ?? 0)}
                          </Text>
                        </View>
                        <View style={styles.variantStatColumnRight}>
                          <Text style={styles.variantStatValueBold}>
                            {t('Price')}: {currencyFormatter.format(product.price ?? 0)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.variantActions}>
                        <View style={styles.variantActionButtons}>
                          <TouchableOpacity
                            style={[styles.adjustButton, styles.scanActionButton]}
                            onPress={() => openStockScanner(product)}
                          >
                            <Text style={[styles.adjustLabel, styles.scanActionLabel]}>
                              {t('Add')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.adjustButton}
                            onPress={() =>
                              router.push(`/modals/stock-adjustment?productId=${product.id}`)
                            }
                          >
                            <Ionicons name="cube-outline" size={16} color="#2563eb" />
                            <Text style={styles.adjustLabel}>{t('Adjust')}</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.variantActionIcons}>
                          <TouchableOpacity
                            style={styles.iconButtonLeft}
                            onPress={() => router.push(`/modals/product-entry?productId=${product.id}`)}
                          >
                            <Ionicons name="create-outline" size={16} color="#2563eb" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.iconButtonDelete}
                            onPress={() =>
                              Alert.alert(
                                t('Delete Product'),
                                t('Are you sure you want to delete this product?'),
                                [
                                  { text: t('Cancel'), style: 'cancel' },
                                  {
                                    text: t('Delete'),
                                    style: 'destructive',
                                    onPress: async () => {
                                      try {
                                        await deleteProduct(product.id);
                                        Toast.show({
                                          type: 'success',
                                          text1: t('Product deleted successfully'),
                                        });
                                      } catch (error) {
                                        console.error('Failed to delete product', error);
                                        Toast.show({
                                          type: 'error',
                                          text1: t('Something went wrong'),
                                        });
                                      }
                                    },
                                  },
                                ]
                              )
                            }
                          >
                            <Ionicons name="trash-outline" size={15} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}

                  {product.hasVariants ? (
                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        style={styles.iconButtonLeft}
                        onPress={() => router.push(`/modals/product-entry?productId=${product.id}`)}
                      >
                        <Ionicons name="create-outline" size={16} color="#2563eb" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButtonRight}
                        onPress={() =>
                          Alert.alert(
                            t('Delete Product'),
                            t('Are you sure you want to delete this product?'),
                            [
                              { text: t('Cancel'), style: 'cancel' },
                              {
                                text: t('Delete'),
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await deleteProduct(product.id);
                                    Toast.show({
                                      type: 'success',
                                      text1: t('Product deleted successfully'),
                                    });
                                  } catch (error) {
                                    console.error('Failed to delete product', error);
                                    Toast.show({
                                      type: 'error',
                                      text1: t('Something went wrong'),
                                    });
                                  }
                                },
                              },
                            ]
                          )
                        }
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        </ScrollView>
      </SafeAreaView>
      <Modal
        transparent
        visible={showBarcodeModal}
        animationType="fade"
        onRequestClose={handleBarcodeModalClose}
      >
        <View style={styles.barcodeModalOverlay}>
          <View style={styles.barcodeModalContent}>
            {showCamera ? (
              <>
                <Text style={styles.barcodeModalTitle}>{t('Scan Barcode')}</Text>
                <ScanModeToggle
                  value={scanMode}
                  onChange={setScanMode}
                  labels={{
                    all: t('All codes'),
                    barcode: t('Barcode only'),
                    qr: t('QR only'),
                  }}
                  style={styles.scanModeToggle}
                />
                <View style={styles.cameraContainer}>
                  {cameraPermission?.granted ? (
                    <>
                      <CameraView
                        style={styles.cameraView}
                        facing="back"
                        barcodeScannerSettings={{
                          barcodeTypes: barcodeTypesForMode,
                        }}
                        onBarcodeScanned={(result) => {
                          if (canScanBarcode && result?.data) {
                            handleBarcodeDetected(result.data);
                          }
                        }}
                      />
                      <View style={styles.scanFrame} />
                    </>
                  ) : (
                    <View style={styles.cameraPermissionCard}>
                      <Ionicons name="camera-outline" size={48} color="#6b7280" />
                      <Text style={styles.cameraPermissionTitle}>
                        {t('Allow camera access to scan barcodes')}
                      </Text>
                      <TouchableOpacity
                        style={styles.cameraPermissionButton}
                        onPress={requestCameraPermission}
                      >
                        <Text style={styles.cameraPermissionButtonText}>{t('Allow Camera')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.manualToggleButton}
                  onPress={() => setShowCamera(false)}
                >
                  <Text style={styles.manualToggleText}>{t('Enter manually instead')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.barcodeModalButton, styles.barcodeModalButtonCancel, { marginTop: 16 }]}
                  onPress={handleBarcodeModalClose}
                >
                  <Text style={styles.barcodeModalButtonText}>{t('Cancel')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.barcodeModalTitle}>{t('Scan Barcode')}</Text>
                <Text style={styles.barcodeModalSubtitle}>{t('Choose scanning method')}</Text>

                <TouchableOpacity style={styles.scanMethodButton} onPress={handleCameraScanRequest}>
                  <Ionicons name="camera" size={32} color="#2563eb" />
                  <Text style={styles.scanMethodTitle}>{t('Scan with Camera')}</Text>
                  <Text style={styles.scanMethodDesc}>{t('Use device camera to scan barcode')}</Text>
                </TouchableOpacity>

                <View style={styles.manualInputSection}>
                  <Text style={styles.manualInputLabel}>{t('Or enter manually:')}</Text>
                  <TextInput
                    style={styles.barcodeModalInput}
                    value={barcodeInput}
                    onChangeText={setBarcodeInput}
                    placeholder={t('Enter barcode')}
                    returnKeyType="search"
                    onSubmitEditing={handleBarcodeManualSearch}
                  />
                </View>

                <View style={styles.barcodeModalButtons}>
                  <TouchableOpacity
                    style={[styles.barcodeModalButton, styles.barcodeModalButtonCancel]}
                    onPress={handleBarcodeModalClose}
                  >
                    <Text style={styles.barcodeModalButtonText}>{t('Cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.barcodeModalButton, styles.barcodeModalButtonSearch]}
                    onPress={handleBarcodeManualSearch}
                  >
                    <Text style={[styles.barcodeModalButtonText, styles.barcodeModalButtonSearchText]}>
                      {t('Search')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        visible={!!stockScannerTarget}
        animationType="fade"
        onRequestClose={closeStockScanner}
      >
        <KeyboardAvoidingView
          style={styles.stockScannerOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
        >
          <View style={styles.stockScannerCard}>
            <View style={styles.stockScannerHeader}>
              <Text style={styles.stockScannerTitle}>{t('Add stock')}</Text>
              <TouchableOpacity onPress={closeStockScanner}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <Text style={styles.stockScannerSubtitle}>
              {stockScannerTarget?.displayName}
            </Text>
            {stockScannerTarget && showStockScannerCamera ? (
              <>
                <ScanModeToggle
                  value={stockScanMode}
                  onChange={setStockScanMode}
                  labels={{
                    all: t('All codes'),
                    barcode: t('Barcode only'),
                    qr: t('QR only'),
                  }}
                  style={styles.scanModeToggle}
                />
                <View style={styles.stockScannerCameraContainer}>
                  {cameraPermission?.granted ? (
                    <>
                      <CameraView
                        style={styles.stockScannerCamera}
                        facing="back"
                        barcodeScannerSettings={{
                          barcodeTypes: stockBarcodeTypesForMode,
                        }}
                        onBarcodeScanned={(result) => {
                          if (canScanStockAdjust && result?.data) {
                            handleStockScannerDetected(result.data);
                          }
                        }}
                      />
                      <View style={styles.scanFrame} />
                    </>
                  ) : (
                    <View style={styles.cameraPermissionCard}>
                      <Ionicons name="camera-outline" size={48} color="#6b7280" />
                      <Text style={styles.cameraPermissionTitle}>
                        {t('Allow camera access to scan barcodes')}
                      </Text>
                      <TouchableOpacity
                        style={styles.cameraPermissionButton}
                        onPress={requestCameraPermission}
                      >
                        <Text style={styles.cameraPermissionButtonText}>{t('Allow Camera')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </>
            ) : null}
            {stockScannerMessage ? (
              <Text style={styles.stockScannerHint}>{stockScannerMessage}</Text>
            ) : null}
            {stockScannerTarget?.barcode && !hasStockScannerScan ? (
              <TouchableOpacity
                style={styles.manualToggleButton}
                onPress={() => {
                  setHasStockScannerScan(true);
                  setStockScannerMessage(t('Enter quantity manually below.'));
                  setShowStockScannerCamera(false);
                }}
              >
                <Text style={styles.manualToggleText}>{t('Enter manually instead')}</Text>
              </TouchableOpacity>
            ) : null}
            <TextInput
              style={[styles.stockScannerInput, styles.stockScannerCodeInput]}
              placeholder={t('Scanned barcode')}
              value={stockScannerCode}
              editable={false}
            />
            <TextInput
              style={[
                styles.stockScannerInput,
                Boolean(stockScannerTarget?.barcode) &&
                  !hasStockScannerScan &&
                  styles.stockScannerInputDisabled,
              ]}
              placeholder={t('Enter quantity')}
              keyboardType="numeric"
              value={stockScannerQuantity}
              onChangeText={setStockScannerQuantity}
              editable={!stockScannerTarget?.barcode || hasStockScannerScan}
            />
            <View style={styles.stockScannerActions}>
              <Button variant="outline" onPress={closeStockScanner}>
                {t('Cancel')}
              </Button>
              <Button
                onPress={handleStockScannerSave}
                loading={isStockScannerSaving}
                disabled={
                  isStockScannerSaving ||
                  !stockScannerTarget ||
                  (Boolean(stockScannerTarget?.barcode) && !hasStockScannerScan)
                }
              >
                {t('Save')}
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        transparent
        visible={voiceModalVisible}
        animationType="fade"
        onRequestClose={handleVoiceModalClose}
      >
        <View style={styles.voiceModalOverlay}>
          <View style={styles.voiceModalContent}>
            <Text style={styles.voiceModalTitle}>{t('Voice Search')}</Text>

            {isVoiceListening ? (
              <>
                <View style={styles.voiceMicContainer}>
                  <View style={[styles.voicePulse, styles.voicePulse1]} />
                  <View style={[styles.voicePulse, styles.voicePulse2]} />
                  <View style={[styles.voicePulse, styles.voicePulse3]} />
                  <Ionicons name="mic" size={48} color="#10b981" />
                </View>
                <Text style={styles.voiceListeningText}>{t('Listening...')}</Text>
                <Text style={styles.voiceHintText}>{t('Speak the product name')}</Text>
                <TouchableOpacity style={styles.voiceStopButton} onPress={stopVoiceListening}>
                  <Ionicons name="stop-circle" size={20} color="#ef4444" />
                  <Text style={styles.voiceStopButtonText}>{t('Stop listening')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.voiceModalSubtitle}>
                  {t('Type or speak the product name')}
                </Text>
                {!!voiceError && <Text style={styles.voiceErrorText}>{voiceError}</Text>}
                <TextInput
                  style={styles.voiceModalInput}
                  value={voiceInput}
                  onChangeText={setVoiceInput}
                  placeholder={t('E.g., barcode, Shell R3')}
                  autoFocus
                  onSubmitEditing={handleVoiceSubmit}
                />
                <TouchableOpacity style={styles.voiceRetryButton} onPress={handleVoiceRetry}>
                  <Ionicons name="mic-outline" size={18} color="#0f172a" />
                  <Text style={styles.voiceRetryButtonText}>{t('Try voice again')}</Text>
                </TouchableOpacity>
                <View style={styles.voiceModalButtons}>
                  <TouchableOpacity
                    style={[styles.voiceModalButton, styles.voiceModalButtonCancel]}
                    onPress={handleVoiceModalClose}
                  >
                    <Text style={styles.voiceModalButtonText}>{t('Cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.voiceModalButton, styles.voiceModalButtonSearch]}
                    onPress={handleVoiceSubmit}
                  >
                    <Text style={[styles.voiceModalButtonText, styles.voiceModalButtonSearchText]}>
                      {t('Search')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: Platform.select({ ios: spacing.sm, default: spacing.lg }),
    gap: spacing.lg,
  },
  headerTitle: {
    ...textStyles.screenTitle,
    paddingTop: spacing.xs,
  },
  searchWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.select({ ios: spacing.md, default: spacing.sm }),
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
  clearButton: {
    padding: spacing.xs,
  },
  scanButton: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: '#e0f2fe',
  },
  voiceButton: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: '#ecfdf5',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: spacing.xs,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  suggestionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#dbeafe',
  },
  categoryBadge: {
    backgroundColor: '#fef3c7',
  },
  suggestionVariantBadge: {
    backgroundColor: '#ddd6fe',
  },
  suggestionBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563eb',
    textTransform: 'uppercase',
  },
  highlightedText: {
    backgroundColor: '#fef08a',
    fontWeight: '600',
    color: '#854d0e',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    flex: 1,
  },
  filterButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  filterLabel: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1.2,
  },
  addButtonLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  statCard: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    minHeight: 80,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  totalCard: {
    flex: 0.9,
  },
  valueCard: {
    flex: 1.4,
  },
  lowStockCard: {
    flex: 0.9,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statLabel: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flexShrink: 1,
  },
  statValuePositive: {
    color: '#047857',
  },
  statValueWarning: {
    color: '#b91c1c',
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
  },
  productList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.lg,
    gap: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: '#e7f0ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    gap: 2,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  productMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  variantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#f3e8ff',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  variantBadgeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9333ea',
  },
  variantBadgeLabel: {
    fontSize: 12,
    color: '#7c3aed',
  },
  variantLinksRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  linkText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: 12,
  },
  scanSegment: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
    justifyContent: 'center',
  },
  scanHeaderButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  scanSegmentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
  },
  addVariantSegment: {
    flex: 1,
    justifyContent: 'center',
  },
  addVariantText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  iconButtonLeft: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantList: {
    marginTop: spacing.lg,
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  variantEmpty: {
    fontSize: 13,
    color: '#64748b',
  },
  variantCard: {
    backgroundColor: '#f9fafb',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: spacing.md,
    gap: spacing.xs,
  },
  variantCardDanger: {
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  variantCardWarning: {
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  variantCardOkay: {
    borderLeftWidth: 3,
    borderLeftColor: '#22c55e',
  },
  variantHeaderCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  variantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  variantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  variantValueSmall: {
    fontSize: 12,
    color: '#475569',
  },
  variantStatsCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  variantStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  variantStatValueBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  variantStatDanger: {
    color: '#dc2626',
  },
  variantStatColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  variantStatColumnRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stockPillDanger: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  stockPillDangerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  variantActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  variantActionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
  },
  adjustLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  scanActionButton: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  scanActionLabel: {
    color: '#047857',
  },
  variantActionIcons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButtonRight: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDelete: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  scannerContainer: {
    width: '100%',
    borderRadius: radii.lg,
    backgroundColor: '#ffffff',
    padding: spacing.xl,
    gap: spacing.lg,
    alignItems: 'center',
  },
  scannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  scannerPreview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraView: {
    flex: 1,
  },
  scanFrame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 220,
    height: 140,
    marginTop: -70,
    marginLeft: -110,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: radii.md,
    backgroundColor: 'rgba(37,99,235,0.05)',
  },
  cameraPermissionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  cameraPermissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  cameraPermissionButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  cameraPermissionButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  barcodeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  barcodeModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  barcodeModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  barcodeModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  cameraContainer: {
    width: '100%',
    height: 280,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#000000',
    marginBottom: spacing.lg,
    position: 'relative',
  },
  scanModeToggle: {
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  scanMethodButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  scanMethodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
  },
  scanMethodDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  manualInputSection: {
    marginBottom: 16,
  },
  manualInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 8,
  },
  barcodeModalInput: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: radii.md,
    padding: spacing.lg - 2,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  barcodeModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  barcodeModalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barcodeModalButtonCancel: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  barcodeModalButtonSearch: {
    backgroundColor: '#2563eb',
  },
  barcodeModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  barcodeModalButtonSearchText: {
    color: '#ffffff',
  },
  manualToggleButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  manualToggleText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  stockScannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  stockScannerCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  stockScannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockScannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  stockScannerSubtitle: {
    fontSize: 14,
    color: '#475569',
  },
  stockScannerCameraContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
    position: 'relative',
  },
  stockScannerCamera: {
    width: '100%',
    height: 200,
  },
  stockScannerHint: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  stockScannerInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.select({ ios: spacing.md, default: spacing.sm }),
    fontSize: 16,
    color: '#0f172a',
  },
  stockScannerCodeInput: {
    marginTop: 12,
    backgroundColor: '#f1f5f9',
  },
  stockScannerInputDisabled: {
    opacity: 0.6,
  },
  stockScannerActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  voiceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  voiceModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
    alignItems: 'center',
  },
  voiceModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  voiceModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: spacing.xl,
    textAlign: 'center',
    lineHeight: 20,
  },
  voiceMicContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    position: 'relative',
  },
  voicePulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#10b981',
    opacity: 0.2,
  },
  voicePulse1: {
    transform: [{ scale: 0.8 }],
  },
  voicePulse2: {
    transform: [{ scale: 1.0 }],
  },
  voicePulse3: {
    transform: [{ scale: 1.2 }],
  },
  voiceListeningText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10b981',
    marginBottom: spacing.sm,
  },
  voiceHintText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  voiceStopButton: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },
  voiceStopButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b91c1c',
  },
  voiceModalInput: {
    borderWidth: 2,
    borderColor: '#10b981',
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f0fdf4',
    marginBottom: spacing.xl,
    width: '100%',
  },
  voiceModalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  voiceModalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceModalButtonCancel: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  voiceModalButtonSearch: {
    backgroundColor: '#10b981',
  },
  voiceModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
  },
  voiceModalButtonSearchText: {
    color: '#ffffff',
  },
  voiceErrorText: {
    width: '100%',
    fontSize: 13,
    color: '#dc2626',
    marginBottom: 12,
    textAlign: 'center',
  },
  voiceRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    marginBottom: spacing.md,
  },
  voiceRetryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'flex-end',
  },
  bottomSheetOverlayTouchable: {
    flex: 1,
  },
  bottomSheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: spacing.xl,
    borderTopRightRadius: spacing.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  manageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  manageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  filterRowWrapper: {
    gap: 12,
    marginTop: 8,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  filterRowActive: {
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  filterRowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  filterRowDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  filterRowToggle: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#d4d4d8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRowToggleActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  filterActionButton: {
    flex: 1,
  },
});




















