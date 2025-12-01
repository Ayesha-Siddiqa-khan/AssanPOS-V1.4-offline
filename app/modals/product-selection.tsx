import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  Modal,
  KeyboardAvoidingView,
  Alert,
  PermissionsAndroid,
  Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useNavigation, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';

import { useLanguage } from '../../contexts/LanguageContext';
import { fuzzySearch } from '../../lib/searchUtils';
import { useData } from '../../contexts/DataContext';
import { usePos } from '../../contexts/PosContext';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { ScanModeToggle, ScanMode } from '../../components/ui/ScanModeToggle';
import { db } from '../../lib/database';

const PRODUCT_SELECTION_BARCODE_TYPES: BarcodeType[] = ['ean13', 'code128', 'upc_a', 'upc_e', 'code39', 'code93'];
const SCAN_REENABLE_DELAY_MS = 4000;

const normalizeSearchText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2022\-\.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeBarcodeValue = (value: string | number | null | undefined) =>
  (value == null ? '' : String(value))
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

export default function ProductSelectionModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isWideLayout = Platform.OS === 'web' && width > 520;
  const { t } = useLanguage();
  const { products, customers, addSale } = useData();

  const {
    cart,
    addItem,
    updateQuantity,
    removeItem,
    resetSale,
    selectedCustomerId,
    setSelectedCustomerId,
    walkInCustomerName,
    setWalkInCustomerName,
    discount,
    setDiscount,
    taxRate,
    setTaxRate,
    quickPaymentEnabled,
    setQuickPaymentEnabled,
  } = usePos();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<
    Array<{ productId: number; variantId?: number | null; label: string }>
  >([]);
  const [suppressSuggestions, setSuppressSuggestions] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const [recentProducts, setRecentProducts] = useState<Array<{ productId: number; variantId?: number | null; label: string }>>([]);
  const [showRecentDropdown, setShowRecentDropdown] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [canScanBarcode, setCanScanBarcode] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');
  const [multiScanMode, setMultiScanMode] = useState(false);
  const lastAutoAddBarcodeRef = useRef<string | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [isQuickPaying, setIsQuickPaying] = useState(false);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [discountInput, setDiscountInput] = useState(discount === 0 ? '' : discount.toString());
  const [taxInput, setTaxInput] = useState(taxRate === 0 ? '' : taxRate.toString());
  const [randomPurchaseInput, setRandomPurchaseInput] = useState(''); // ad-hoc amount added to subtotal
  const [showRandomPurchase, setShowRandomPurchase] = useState(false);
  const [showPricingAdjustments, setShowPricingAdjustments] = useState(false);
  const [showCustomProductModal, setShowCustomProductModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'net' | 'due'>('net');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQuantity, setCustomQuantity] = useState('1');
  const [customFieldLabel, setCustomFieldLabel] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [customNameSuggestions, setCustomNameSuggestions] = useState<string[]>([]);
  const customNameInputRef = useRef<TextInput>(null);
  const customPriceInputRef = useRef<TextInput>(null);
  const [showCustomNameChips, setShowCustomNameChips] = useState(false);
  const [isManageCustomNamesVisible, setIsManageCustomNamesVisible] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [customPriceError, setCustomPriceError] = useState<string | null>(null);
  const [instantAddMode, setInstantAddMode] = useState<'manual' | 'direct'>('direct');
  const [isAdvancedOptionsVisible, setIsAdvancedOptionsVisible] = useState(false);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [customerMode, setCustomerMode] = useState<'walk-in' | 'saved'>(
    selectedCustomerId ? 'saved' : 'walk-in'
  );
  const [isPriceLookup, setIsPriceLookup] = useState(false);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [activeQuantityKey, setActiveQuantityKey] = useState<string | null>(null);
  const isCustomProductValid = useMemo(() => {
    const parsedPrice = Number(customPrice);
    return (
      customName.trim().length > 0 &&
      Number.isFinite(parsedPrice) &&
      parsedPrice > 0
    );
  }, [customName, customPrice]);
  const keyboardBehavior = Platform.OS === 'ios' ? 'padding' : undefined;
  const keyboardOffset = Platform.OS === 'ios' ? 80 : 0;

  useEffect(() => {
    setDiscountInput(discount === 0 ? '' : discount.toString());
  }, [discount]);

  useEffect(() => {
    setTaxInput(taxRate === 0 ? '' : taxRate.toString());
  }, [taxRate]);

  useEffect(() => {
    if (showCamera) {
      setCanScanBarcode(true);
      setScanMode('barcode');
    }
  }, [showCamera]);

  useEffect(() => {
    if (selectedCustomerId) {
      setCustomerMode('saved');
    } else {
      setCustomerMode('walk-in');
    }
  }, [selectedCustomerId]);

  const barcodeTypesForMode = useMemo<BarcodeType[]>(() => {
    if (scanMode === 'qr') return ['qr'];
    if (scanMode === 'all') return [...PRODUCT_SELECTION_BARCODE_TYPES, 'qr'];
    return [...PRODUCT_SELECTION_BARCODE_TYPES];
  }, [scanMode]);

  useEffect(() => {
    setQuickPaymentEnabled(true);
    setShowRandomPurchase(true);
  }, [setQuickPaymentEnabled]);

  useEffect(() => {
    setQuantityInputs((prev) => {
      const next: Record<string, string> = {};
      cart.forEach((item) => {
        const key = getQuantityKey(item.productId, item.variantId ?? null);
        const syncedValue = String(item.quantity);
        next[key] = activeQuantityKey === key ? prev[key] ?? syncedValue : syncedValue;
      });
      return next;
    });
  }, [cart, activeQuantityKey]);

  // Keep cart quantities in sync even if the user doesn't blur the input
  useEffect(() => {
    cart.forEach((item) => {
      const key = getQuantityKey(item.productId, item.variantId ?? null);
      const rawValue = quantityInputs[key];
      if (rawValue == null) return;

      const { parsed } = parseQuantityInput(rawValue);
      if (!parsed) return;

      if (parsed !== item.quantity) {
        updateQuantity(item.productId, item.variantId ?? null, parsed);
      }
    });
  }, [cart, quantityInputs, updateQuantity]);

  useEffect(() => {
    // Removed initial auto-focus to prevent keyboard popping up by default
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = (await db.getSetting(CUSTOM_PRODUCT_NAME_SETTING_KEY)) as
          | string[]
          | null;
        if (mounted && stored && Array.isArray(stored)) {
          setCustomNameSuggestions(stored.slice(0, MAX_CUSTOM_PRODUCT_NAMES));
        }

        // Load recent products
        const recentStored = (await db.getSetting('pos.recentProducts')) as
          | Array<{ productId: number; variantId?: number | null; label: string }>
          | null;
        if (mounted && recentStored && Array.isArray(recentStored)) {
          setRecentProducts(recentStored.slice(0, 8)); // Show max 8 recent items
        }
      } catch (error) {
        console.warn('Failed to load custom product names', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const normalizedSearchQuery = searchQuery.trim();

  useEffect(() => {
    if (suppressSuggestions) {
      setSearchSuggestions([]);
      // Don't reset suppressSuggestions here - let onChangeText handle it
      return;
    }
    if (!normalizedSearchQuery) {
      setSearchSuggestions([]);
      return;
    }

    // Build searchable list (include barcode for direct scan matches)
    const searchableItems: Array<{
      productId: number;
      variantId: number | null;
      label: string;
      searchText: string;
      barcodeText: string;
    }> = [];
    const textQuery = normalizeSearchText(normalizedSearchQuery);
    const barcodeQuery = normalizeBarcodeValue(normalizedSearchQuery);
    const queryForSearch =
      /\d/.test(normalizedSearchQuery) && barcodeQuery ? barcodeQuery : textQuery;

    products.forEach((product) => {
      // Add product
      searchableItems.push({
        productId: product.id,
        variantId: null,
        label: product.name,
        searchText: normalizeSearchText(product.name),
        barcodeText: normalizeBarcodeValue(product.barcode),
      });

      // Add variants
      const variants = getVariantArray(product);
      if (product.hasVariants && variants.length > 0) {
        variants.forEach((variant: any) => {
          const variantLabel = `${product.name} • ${variant.name}`;
          // Normalize all searchable text
          const searchableText = normalizeSearchText([
            product.name,
            variant.name,
            variant.size || '',
            variant.color || '',
            variant.design || '',
          ].filter(Boolean).join(' '));

          searchableItems.push({
            productId: product.id,
            variantId: variant.id,
            label: variantLabel,
            searchText: searchableText,
            barcodeText: normalizeBarcodeValue(variant.barcode),
          });
        });
      }
    });

    const results = fuzzySearch(searchableItems, queryForSearch, {
      keys: [
        { name: 'searchText', weight: 1 },
        { name: 'barcodeText', weight: 2 },
      ],
      threshold: 0.4,
      adaptiveScoring: false, // Don't use adaptive scoring for suggestions
      maxScore: 0.3, // Show more lenient matches
    });

    setSearchSuggestions(results.slice(0, 6).map(r => ({
      productId: r.productId,
      variantId: r.variantId,
      label: r.label,
    })));
  }, [normalizedSearchQuery, products, suppressSuggestions]);

  // Create searchable items with variant information
  const searchableItems = useMemo(() => {
    return products.map((product: any) => {
      const variants = getVariantArray(product);
      // Concatenate all variant names into a searchable string
      const variantTexts = variants
        .map((v: any) => `${v.name} ${v.size || ''} ${v.color || ''} ${v.design || ''}`.trim())
        .join('   '); // Use triple space as separator

      return {
        ...product,
        variants,
        searchText: normalizeSearchText(`${product.name} ${product.category || ''} ${variantTexts}`),
      };
    });
  }, [products]);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return []; // Return empty when no search query

    const normalizedSearchQuery = normalizeSearchText(searchQuery);

    const results = fuzzySearch(searchableItems, normalizedSearchQuery, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'category', weight: 1 },
        { name: 'searchText', weight: 1.5 },
      ],
      threshold: 0.5,  // More lenient threshold for product-level search
      maxScore: 0.5,   // Allow more matches
      adaptiveScoring: false,
    });

    // Filter variants within each product to show only matching ones
    return results.map((product: any) => {
      const variants = getVariantArray(product);
      if (!product.hasVariants || variants.length === 0) {
        return { ...product, variants };
      }

      // Search within variants - use ONLY variant-specific fields, not product name
      const variantSearchableItems = variants.map((v: any) => {
        const variantOnlyText = `${v.name} ${v.size || ''} ${v.color || ''} ${v.design || ''}`;
        return {
          ...v,
          searchText: normalizeSearchText(variantOnlyText),
        };
      });

      // Try to match with the full query first
      let matchingVariants = fuzzySearch(variantSearchableItems, normalizedSearchQuery, {
        keys: [
          { name: 'name', weight: 2 },
          { name: 'searchText', weight: 1.5 },
        ],
        threshold: 0.3,
        maxScore: 0.2,
        adaptiveScoring: false,
      });

      // If no matches, try searching with just the last word (likely the variant identifier)
      if (matchingVariants.length === 0 && normalizedSearchQuery.includes(' ')) {
        const queryWords = normalizedSearchQuery.split(' ');
        const lastWord = queryWords[queryWords.length - 1];
        
        matchingVariants = fuzzySearch(variantSearchableItems, lastWord, {
          keys: [
            { name: 'name', weight: 2 },
            { name: 'searchText', weight: 1.5 },
          ],
          threshold: 0.3,
          maxScore: 0.2,
          adaptiveScoring: false,
        });
      }

      // Show filtered variants only if we found some matches and they're fewer than all variants
      if (matchingVariants.length > 0 && matchingVariants.length < variants.length) {
        return {
          ...product,
          variants: matchingVariants,
        };
      }

      return { ...product, variants };
    });
  }, [searchQuery, searchableItems, products]);

  const persistCustomNames = async (next: string[]) => {
    try {
      await db.setSetting(CUSTOM_PRODUCT_NAME_SETTING_KEY, next);
    } catch (error) {
      console.warn('Failed to save custom product names', error);
    }
  };

  const handleSelectCustomName = (name: string) => {
    setCustomName(name);
    setTimeout(() => {
      customPriceInputRef.current?.focus();
    }, 50);
  };

  const handleAddCustomNameSuggestion = () => {
    const trimmed = newCustomName.trim();
    if (!trimmed) {
      Toast.show({ type: 'info', text1: t('Please enter a name first') });
      return;
    }
    if (
      customNameSuggestions.some((item) => item.toLowerCase() === trimmed.toLowerCase())
    ) {
      Toast.show({ type: 'info', text1: t('This name is already in the list') });
      return;
    }
    if (customNameSuggestions.length >= MAX_CUSTOM_PRODUCT_NAMES) {
      Toast.show({ type: 'info', text1: t('Quick list limit reached') });
      return;
    }
    const next = [...customNameSuggestions, trimmed];
    setCustomNameSuggestions(next);
    setNewCustomName('');
    persistCustomNames(next);
  };

  const handleRemoveCustomName = (name: string) => {
    Alert.alert(
      t('Remove Quick Name'),
      t('Are you sure you want to remove this quick option?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => {
            const next = customNameSuggestions.filter((item) => item !== name);
            setCustomNameSuggestions(next);
            persistCustomNames(next);
          },
        },
      ]
    );
  };

  const renderCustomNameChips = () => {
    if (!showCustomNameChips) {
      return null;
    }
    if (!customNameSuggestions.length) {
      return (
        <Text style={styles.quickNamesHint}>
          {t('Tap Manage to add your frequently used names.')}
        </Text>
      );
    }
    return (
      <View>
        <Text style={styles.quickNamesHint}>
          {t('Tap Manage to add your frequently used names.')}
        </Text>
        <View style={styles.quickNamesGrid}>
          {customNameSuggestions.map((item) => {
            const isActive = customName.trim().toLowerCase() === item.toLowerCase();
            return (
              <TouchableOpacity
                key={`custom-name-${item}`}
                style={[styles.quickNameChip, isActive && styles.quickNameChipActive]}
                onPress={() => handleSelectCustomName(item)}
              >
                <Ionicons
                  name="pricetag-outline"
                  size={14}
                  color={isActive ? '#ffffff' : '#d946ef'}
                />
                <Text
                  style={[
                    styles.quickNameChipText,
                    isActive && styles.quickNameChipTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };
  const getInputQuantityOrCart = (item: CartItem) => {
    const key = getQuantityKey(item.productId, item.variantId ?? null);
    const raw = quantityInputs[key];
    const parsed = raw ? parseQuantityInput(raw).parsed : null;
    return parsed ?? item.quantity;
  };

  const subtotal = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const qty = getInputQuantityOrCart(item);
        return sum + (item.price || 0) * qty;
      }, 0),
    [cart, quantityInputs]
  );

  const discountAmount = Math.min(discount, subtotal);
  const randomPurchaseAmount = Number(randomPurchaseInput) || 0;
  const taxableAmount = Math.max(subtotal + randomPurchaseAmount - discountAmount, 0);
  const taxAmount = Number(((taxableAmount * taxRate) / 100).toFixed(2));
  const totalDue = taxableAmount + taxAmount;
  const itemsCount = useMemo(
    () => cart.reduce((sum, item) => sum + getInputQuantityOrCart(item), 0),
    [cart, quantityInputs]
  );
  const hasExtraOnly = cart.length === 0 && randomPurchaseAmount > 0;
  const saleItemsCount = itemsCount > 0 ? itemsCount : hasExtraOnly ? 1 : 0;
  const canCheckout = totalDue > 0 && (cart.length > 0 || hasExtraOnly);

  const customerOptions = useMemo(
    () =>
      customers.map((customer) => ({
        label: `${customer.name} (${customer.phone})`,
        value: customer.id.toString(),
      })),
    [customers]
  );

  const selectedCustomer = selectedCustomerId
    ? customers.find((customer) => customer.id === selectedCustomerId)
    : undefined;

  const searchActionOptions = useMemo(
    () => [
      {
        value: 'manual' as const,
        title: t('Ask quantity first'),
      },
      {
        value: 'direct' as const,
        title: t('Add instantly'),
      },
    ],
    [t]
  );
  const isInstantAddMode = instantAddMode === 'direct';

  function getQuantityKey(productId: number, variantId: number | null) {
    return `${productId}-${variantId ?? 'base'}`;
  }

  const getResolvedPrice = (product: (typeof products)[number], variant?: any) => {
    const rawPrice = variant?.price ?? product.price ?? 0;
    const parsed = Number(rawPrice);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getResolvedCostPrice = (product: (typeof products)[number], variant?: any) => {
    const rawCostPrice = variant?.costPrice ?? product.costPrice ?? 0;
    const parsed = Number(rawCostPrice);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function getVariantArray(product: (typeof products)[number]) {
    const variants = (product as any)?.variants;
    if (Array.isArray(variants)) {
      return variants;
    }
    if (typeof variants === 'string') {
      try {
        const parsed = JSON.parse(variants);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (error) {
        console.warn('[ProductSelection] Failed to parse variants string', { productId: product.id });
      }
    }
    return [];
  }

  const getAvailableStock = (product: (typeof products)[number], variant?: any) => {
    const stock = variant?.stock ?? product.stock;
    if (stock === null || stock === undefined) {
      return null;
    }
    const parsed = Number(stock);
    return Number.isFinite(parsed) ? parsed : null;
  };

  useEffect(() => {
    navigation.setOptions({
      headerTitle: selectedCustomer ? selectedCustomer.name : t('Walk-in Customer'),
      headerBackTitle: '',
    });
  }, [navigation, selectedCustomer, t]);

  const handleAddProduct = (
    product: (typeof products)[number],
    variant?: any
  ) => {
    try {
      const price = getResolvedPrice(product, variant);
      const costPrice = getResolvedCostPrice(product, variant);
      const missingPrice = variant?.price == null && product.price == null;
      const availableStock = getAvailableStock(product, variant);

      if (missingPrice) {
        Toast.show({
          type: 'error',
          text1: t('Cannot add item'),
          text2: t('Set a price before adding to cart.'),
        });
        return;
      }

      if (availableStock !== null && availableStock <= 0) {
        Toast.show({
          type: 'error',
          text1: t('Out of stock'),
          text2: t('Update stock before selling this item.'),
        });
        return;
      }

      const variantAttributes = variant
        ? ([
            variant.size ? { label: t('Size'), value: variant.size } : null,
            variant.color ? { label: t('Color'), value: variant.color } : null,
            variant.material ? { label: t('Material / Brand'), value: variant.material } : null,
            variant.customAttributeLabel && variant.customAttributeValue
              ? { label: variant.customAttributeLabel, value: variant.customAttributeValue }
              : null,
          ].filter(
            (attr): attr is { label: string; value: string } => Boolean(attr)
          ) as Array<{ label: string; value: string }>)
        : undefined;

      addItem(
        {
          productId: product.id,
          variantId: variant ? variant.id : null,
          name: product.name,
          variantName: variant?.name,
          variantAttributes,
          price,
          costPrice,
        },
        1
      );
    } catch (error) {
      console.error('[ProductSelection] Failed to add product', { product, variant, error });
      Toast.show({
        type: 'error',
        text1: t('Unable to add item'),
        text2: t('Please check this product and try again.'),
      });
      return;
    }

    // Clear search to make room for next search on small screens
    setSearchQuery('');
    setSearchSuggestions([]);
    setSuppressSuggestions(false);

    // Save to recent products
    const recentItem = {
      productId: product.id,
      variantId: variant ? variant.id : null,
      label: variant ? `${product.name} • ${variant.name}` : product.name,
    };
    
    // Add to recent, remove duplicates, keep max 8
    const updatedRecent = [
      recentItem,
      ...recentProducts.filter(
        r => !(r.productId === recentItem.productId && r.variantId === recentItem.variantId)
      ),
    ].slice(0, 8);
    
    setRecentProducts(updatedRecent);
    db.setSetting('pos.recentProducts', updatedRecent).catch(console.warn);

    // Auto-focus search input for next item
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  const tryInstantAddFromIds = (productId: number, variantId?: number | null) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      return false;
    }
    const variants = getVariantArray(product);
    let selectedVariant: any | undefined;
    if (variantId != null) {
      selectedVariant = variants.find((variant: any) => variant.id === variantId);
    } else if (product.hasVariants && variants.length > 0) {
      selectedVariant = variants[0];
    }
    handleAddProduct(product, selectedVariant);
    return true;
  };

  const handleSuggestionSelect = (suggestion: {
    productId: number;
    variantId?: number | null;
    label: string;
  }) => {
    setSuppressSuggestions(true);
    setSearchSuggestions([]);
    if (!isInstantAddMode) {
      setSearchQuery(suggestion.label);
      return;
    }
    const added = tryInstantAddFromIds(suggestion.productId, suggestion.variantId ?? null);
    if (!added) {
      setSearchQuery(suggestion.label);
    }
  };

  // Request camera permission
  const handleCameraScanRequest = async (options?: { priceLookup?: boolean }) => {
    if (options?.priceLookup) {
      setIsPriceLookup(true);
    } else {
      setIsPriceLookup(false);
    }
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

  // Handle barcode scanned from camera
  const handleBarCodeScanned = (data: string) => {
    if (!canScanBarcode) {
      return;
    }
    setCanScanBarcode(false);
    Vibration.vibrate(50);
    if (!multiScanMode) {
      setShowCamera(false);
      setShowBarcodeModal(false);
    }
    setIsPriceLookup(false);
    setBarcodeInput('');

    try {
      console.log('[DEBUG] product selection scan:', data);
      Toast.show({ type: 'info', text1: 'Scanned (product selection)', text2: data });
      const normalizedScan = normalizeBarcodeValue(data);
      if (!normalizedScan) {
        setCanScanBarcode(true);
        return;
      }

      // Try to find product by barcode
      let foundProduct = products.find(
        (p) => normalizeBarcodeValue(p.barcode) === normalizedScan
      );
      let foundVariant = null;

      // If not found in products, search in variants
      if (!foundProduct) {
        for (const product of products) {
          const variants = getVariantArray(product);
          if (!product.hasVariants || variants.length === 0) continue;
          const variant = variants.find(
            (v: any) => normalizeBarcodeValue(v.barcode) === normalizedScan
          );
          if (variant) {
            foundProduct = product;
            foundVariant = variant;
            break;
          }
        }
      }

      // If product found and in instant add mode, add to cart
      if (isPriceLookup && foundProduct) {
        const retail = foundVariant ? foundVariant.price : foundProduct.price ?? 0;
        Toast.show({
          type: 'info',
          text1: foundVariant ? `${foundProduct.name} • ${foundVariant.name}` : foundProduct.name,
          text2: `${t('Retail Price')}: Rs. ${Number(retail || 0).toLocaleString()}`,
        });
      } else if (foundProduct && isInstantAddMode) {
        handleAddProduct(foundProduct, foundVariant);
        Toast.show({
          type: 'success',
          text1: t('Product Added'),
          text2: foundVariant ? `${foundProduct.name} • ${foundVariant.name}` : foundProduct.name,
        });
      } else if (foundProduct) {
        // Manual mode: just set search query
        setSearchQuery(foundVariant ? `${foundProduct.name} • ${foundVariant.name}` : foundProduct.name);
        Toast.show({
          type: 'success',
          text1: t('Barcode Scanned'),
          text2: data,
        });
      } else {
        // Not found: set search query for manual search
        setSearchQuery(data);
        Toast.show({
          type: 'info',
          text1: t('Product not found'),
          text2: t('Search manually or add custom product'),
        });
      }
    } catch (error) {
      console.error('[ProductSelection] Barcode scan error:', error);
      Toast.show({
        type: 'error',
        text1: t('Scan error'),
        text2: t('Please try again'),
      });
    }

    // Re-enable scanning after a short delay when multi-scan is on
    if (multiScanMode) {
      setTimeout(() => setCanScanBarcode(true), SCAN_REENABLE_DELAY_MS);
    }
  };

  // Handle voice search
  const handleVoiceSearch = () => {
    setShowVoiceModal(true);
    setVoiceText('');
    // Start with listening animation
    setIsListening(true);
    
    // Show info about voice recognition
    Toast.show({
      type: 'info',
      text1: t('Voice Input'),
      text2: t('Speak now or type the product name'),
      visibilityTime: 2000,
    });
    
    // Show text input after listening animation (3 seconds)
    setTimeout(() => {
      setIsListening(false);
    }, 3000);
  };

  const handleVoiceSubmit = () => {
    if (voiceText.trim()) {
      setSearchQuery(voiceText.trim());
      setShowVoiceModal(false);
      setVoiceText('');
      Toast.show({
        type: 'success',
        text1: t('Voice Search'),
        text2: voiceText,
      });
    }
  };

  // Auto-add when the search query is exactly a barcode match (helps when typing/pasting/scanning into the search bar)
  useEffect(() => {
    if (!isInstantAddMode) {
      return;
    }
    const code = normalizeBarcodeValue(searchQuery.trim());
    if (!code || code === lastAutoAddBarcodeRef.current) {
      return;
    }

    let foundProduct = products.find((p) => normalizeBarcodeValue(p.barcode) === code);
    let foundVariant: any | null = null;

    if (!foundProduct) {
      for (const product of products) {
        const variants = getVariantArray(product);
        if (!product.hasVariants || variants.length === 0) continue;
        const variant = variants.find((v: any) => normalizeBarcodeValue(v.barcode) === code);
        if (variant) {
          foundProduct = product;
          foundVariant = variant;
          break;
        }
      }
    }

    if (foundProduct) {
      handleAddProduct(foundProduct, foundVariant ?? undefined);
      lastAutoAddBarcodeRef.current = code;
      Toast.show({
        type: 'success',
        text1: t('Product Added'),
        text2: foundVariant ? `${foundProduct.name} • ${foundVariant.name}` : foundProduct.name,
      });
    }
  }, [searchQuery, isInstantAddMode, products, t]);

  const handleClearCart = () => {
    if (cart.length === 0) {
      return;
    }
    resetSale();
    setRecentProducts([]);
    db.setSetting('pos.recentProducts', []).catch(console.warn);
    Toast.show({ type: 'info', text1: t('Cart cleared') });
  };

  type CartItem = (typeof cart)[number];

  const sanitizeQuantityInput = (value: string) =>
    value
      .replace(/,/g, '.') // Support comma decimal separators
      .replace(/[^\d.]/g, '')
      // Keep only the first decimal point
      .replace(/(\..*)\./g, '$1');

  const parseQuantityInput = (value: string) => {
    const sanitized = sanitizeQuantityInput(value);
    const parsed = Number(sanitized);
    return {
      sanitized,
      parsed: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
    };
  };

  const handleStepQuantity = (item: CartItem, delta: number) => {
    const nextQuantity = item.quantity + delta;
    const key = getQuantityKey(item.productId, item.variantId ?? null);
    updateQuantity(item.productId, item.variantId ?? null, nextQuantity);
    setQuantityInputs((prev) => {
      const updated = { ...prev };
      if (nextQuantity > 0) {
        updated[key] = String(nextQuantity);
      } else {
        delete updated[key];
      }
      return updated;
    });
  };

  const handleQuantityInputChange = (key: string, value: string, item: CartItem) => {
    const { sanitized, parsed } = parseQuantityInput(value);
    setQuantityInputs((prev) => ({ ...prev, [key]: sanitized }));

    // Apply quantity as the user types so totals stay in sync without needing blur
    if (parsed && parsed !== item.quantity) {
      updateQuantity(item.productId, item.variantId ?? null, parsed);
    }
  };

  const handleQuantityInputCommit = (item: CartItem, value: string) => {
    const { sanitized, parsed } = parseQuantityInput(value);
    const key = getQuantityKey(item.productId, item.variantId ?? null);

    if (!parsed) {
      Toast.show({ type: 'error', text1: t('Enter a valid quantity') });
      setQuantityInputs((prev) => ({ ...prev, [key]: String(item.quantity) }));
      return;
    }

    updateQuantity(item.productId, item.variantId ?? null, parsed);
    setQuantityInputs((prev) => ({ ...prev, [key]: String(parsed) }));
  };

  const applyQuantityInputsToCart = () => {
    cart.forEach((item) => {
      const key = getQuantityKey(item.productId, item.variantId ?? null);
      const raw = quantityInputs[key];
      const parsed = raw ? parseQuantityInput(raw).parsed : null;
      if (parsed && parsed !== item.quantity) {
        updateQuantity(item.productId, item.variantId ?? null, parsed);
      }
    });
  };

  const handleQuickPayment = async () => {
    if (!canCheckout) {
      Toast.show({ type: 'error', text1: t('Add an item or extra amount to continue') });
      return;
    }
    applyQuantityInputsToCart();
    setIsQuickPaying(true);
    try {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 8);
      const creditAvailable = Math.max(selectedCustomer?.credit ?? 0, 0);
      const creditApplied =
        paymentStatus === 'due' ? Math.min(totalDue, creditAvailable) : 0;
      const remainingBalance = paymentStatus === 'due' ? Math.max(totalDue - creditApplied, 0) : 0;
      const paidForRecord = paymentStatus === 'net' ? totalDue : creditApplied;
      const paymentMethod =
        paymentStatus === 'due'
          ? creditApplied > 0
            ? 'Customer Credit'
            : 'Cash'
          : 'Cash';
      const status = paymentStatus === 'due' && remainingBalance > 0 ? 'Due' : 'Paid';
      const walkInName = walkInCustomerName.trim();
      const customerPayload = selectedCustomer
        ? {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
          }
        : walkInName
        ? {
            name: walkInName,
            type: 'walk-in',
          }
        : undefined;

      const syntheticCart =
        cart.length > 0
          ? cart
          : hasExtraOnly
          ? [
              {
                productId: -1,
                variantId: null,
                name: t('Extra amount'),
                variantName: undefined,
                variantAttributes: null,
                price: randomPurchaseAmount,
                costPrice: 0,
                quantity: 1,
              },
            ]
          : [];

      const saleId = await addSale({
        customer: customerPayload,
        cart: syntheticCart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          name: item.name,
          variantName: item.variantName,
          variantAttributes: item.variantAttributes ?? null,
          price: item.price,
          costPrice: item.costPrice,
          quantity: item.quantity,
        })),
          subtotal,
          taxRate,
          tax: taxAmount,
          total: totalDue,
          creditUsed: creditApplied,
          amountAfterCredit: remainingBalance,
          paidAmount: paidForRecord,
          changeAmount: 0,
          remainingBalance: remainingBalance,
          paymentMethod,
          dueDate: undefined,
          date,
          time,
          status,
          items: saleItemsCount,
          amount: totalDue,
        });

        resetSale();
        setRecentProducts([]);
        db.setSetting('pos.recentProducts', []).catch(console.warn);
        setRandomPurchaseInput('');
        setShowRandomPurchase(false);
        setDiscountInput('');
        setTaxInput('');
        Toast.show({
          type: 'success',
          text1: t('Sale completed'),
          text2: `${t('Amount')}: ${totalDue.toLocaleString()}`,
        });
    } catch (error) {
      console.error('[ProductSelection] Quick payment failed', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsQuickPaying(false);
    }
  };

  const handleProceedToPayment = () => {
    if (!canCheckout) {
      Toast.show({ type: 'error', text1: t('Add an item or extra amount to continue') });
      return;
    }
    if (quickPaymentEnabled) {
      handleQuickPayment();
      return;
    }
    router.push('/modals/payment');
  };

  const handleCompleteSale = async () => {
    if (!canCheckout) {
      Toast.show({ type: 'error', text1: t('Add an item or extra amount to continue') });
      return;
    }
    if (isCompletingSale) {
      return;
    }
    applyQuantityInputsToCart();
    setIsCompletingSale(true);
    try {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 8);
      const creditAvailable = Math.max(selectedCustomer?.credit ?? 0, 0);
      const creditApplied =
        paymentStatus === 'due' ? Math.min(totalDue, creditAvailable) : 0;
      const remainingBalance = paymentStatus === 'due' ? Math.max(totalDue - creditApplied, 0) : 0;
      const paymentMethod =
        paymentStatus === 'due'
          ? creditApplied > 0
            ? 'Customer Credit'
            : 'Cash'
          : 'Cash';
      const status = paymentStatus === 'due' && remainingBalance > 0 ? 'Due' : 'Paid';
      const walkInName = walkInCustomerName.trim();
      const customerPayload = selectedCustomer
        ? {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
          }
        : walkInName
        ? {
            name: walkInName,
            type: 'walk-in',
          }
        : undefined;

      const syntheticCart =
        cart.length > 0
          ? cart
          : hasExtraOnly
          ? [
              {
                productId: -1,
                variantId: null,
                name: t('Extra amount'),
                variantName: undefined,
                variantAttributes: null,
                price: randomPurchaseAmount,
                costPrice: 0,
                quantity: 1,
              },
            ]
          : [];

      const remainingForRecord = remainingBalance;
      const paidForRecord = paymentStatus === 'net' ? totalDue : creditApplied;

      await addSale({
        customer: customerPayload,
        cart: syntheticCart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          name: item.name,
          variantName: item.variantName,
          variantAttributes: item.variantAttributes ?? null,
          price: item.price,
          costPrice: item.costPrice,
          quantity: item.quantity,
        })),
          subtotal,
          taxRate,
          tax: taxAmount,
          total: totalDue,
          creditUsed: creditApplied,
          amountAfterCredit: remainingForRecord,
          paidAmount: paidForRecord,
          changeAmount: 0,
          remainingBalance: remainingForRecord,
          paymentMethod,
          dueDate: undefined,
          date,
          time,
          status,
          items: saleItemsCount,
          amount: totalDue,
        });

        const savedTotal = totalDue;
        const savedItems = saleItemsCount;

      resetSale();
      setQuickPaymentEnabled(false);
      setRandomPurchaseInput('');
        setShowRandomPurchase(false);
      setDiscountInput('');
      setTaxInput('');
      Toast.show({
        type: 'success',
        text1: t('Sale completed'),
        text2: t('Saved {items} items • Rs. {amount}')
          .replace('{items}', String(savedItems))
          .replace('{amount}', savedTotal.toLocaleString()),
      });
    } catch (error) {
      console.error('[ProductSelection] Complete sale failed', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsCompletingSale(false);
    }
  };

  const handleAddCustomProduct = () => {
    const name = customName.trim();
    const parsedPrice = Number(customPrice);
    const parsedQty = Number(customQuantity);
    const trimmedLabel = customFieldLabel.trim();
    const trimmedValue = customFieldValue.trim();

    if (!name) {
      Toast.show({ type: 'error', text1: t('Enter a product name') });
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setCustomPriceError(t('Price must be greater than 0.'));
      customPriceInputRef.current?.focus();
      return;
    }
    setCustomPriceError(null);

    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      Toast.show({ type: 'error', text1: t('Enter a valid quantity') });
      return;
    }

    if ((trimmedLabel && !trimmedValue) || (!trimmedLabel && trimmedValue)) {
      Toast.show({
        type: 'error',
        text1: t('Enter both custom field label and value'),
      });
      return;
    }

    const variantAttributes =
      trimmedLabel && trimmedValue
        ? [
            {
              label: trimmedLabel,
              value: trimmedValue,
            },
          ]
        : undefined;

    addItem(
      {
        productId: Date.now(),
        variantId: null,
        name,
        price: parsedPrice,
        costPrice: parsedPrice,
        variantAttributes,
      },
      parsedQty
    );

    setShowCustomProductModal(false);
    setCustomPriceError(null);
    setCustomName('');
    setCustomPrice('');
    setCustomQuantity('1');
    setCustomFieldLabel('');
    setCustomFieldValue('');
    if (!customNameSuggestions.some((item) => item.toLowerCase() === name.toLowerCase())) {
      const next = [name, ...customNameSuggestions].slice(0, MAX_CUSTOM_PRODUCT_NAMES);
      setCustomNameSuggestions(next);
      persistCustomNames(next);
    }
    Toast.show({ type: 'success', text1: t('Custom product added') });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardOffset}
        enabled={Boolean(keyboardBehavior)}
      >
        <View style={[styles.inner, isWideLayout && styles.innerWide]}>
        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentInner,
            { paddingBottom: Math.max(insets.bottom + 120, 160) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>{t('Products')}</Text>
              <Text style={styles.subSectionLabel}>{t('Search & add products')}</Text>
            </View>
          <TouchableOpacity
            style={styles.advancedButton}
            onPress={() => setIsAdvancedOptionsVisible(true)}
            accessibilityLabel={t('Advanced options')}
          >
            <Ionicons name="options-outline" size={20} color="#2563eb" />
          </TouchableOpacity>
        </View>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
            <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={t('Search products...')}
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              // Reset suppress flag when user manually types
              if (suppressSuggestions) {
                setSuppressSuggestions(false);
              }
            }}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (!isInstantAddMode) {
                return;
              }
              if (filteredProducts.length > 0) {
                const firstProduct = filteredProducts[0];
                const variants = getVariantArray(firstProduct);
                if (firstProduct.hasVariants && variants.length > 0) {
                  handleAddProduct(firstProduct, variants[0]);
                } else {
                  handleAddProduct(firstProduct);
                }
              }
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSearchSuggestions([]);
                setSuppressSuggestions(false);
              }}
              style={styles.searchActionButton}
            >
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
          {/* Barcode Scanner Icon */}
          <TouchableOpacity
            onPress={() => {
              setShowBarcodeModal(true);
              setBarcodeInput('');
              setShowCamera(true);
            }}
            style={styles.searchActionButton}
          >
            <Ionicons name="barcode-outline" size={22} color="#7c3aed" />
          </TouchableOpacity>
          </View>
          <View style={styles.inlineLinkRow}>
            <TouchableOpacity
              style={styles.inlineLink}
              activeOpacity={0.8}
              onPress={() => setShowCustomProductModal(true)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#2563eb" />
              <Text style={styles.inlineLinkText}>{t('Add custom product')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMultiScanMode((prev) => !prev)}
              style={[
                styles.searchActionButton,
                styles.multiScanStandalone,
                multiScanMode && styles.searchActionButtonActive,
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name="repeat"
                size={18}
                color={multiScanMode ? '#2563eb' : '#475569'}
              />
              <Text
                style={[
                  styles.searchActionText,
                  multiScanMode && styles.searchActionTextActive,
                ]}
              >
                {t('Multi-scan')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search suggestions dropdown - right below search input */}
          {searchSuggestions.length > 0 && (
            <View style={styles.suggestionsDropdown}>
              {searchSuggestions.map((suggestion) => (
                <TouchableOpacity
                  key={`${suggestion.productId}-${suggestion.variantId ?? 'base'}`}
                  style={styles.suggestionRow}
                  onPress={() => handleSuggestionSelect(suggestion)}
                >
                  <Ionicons name="search-outline" size={16} color="#9ca3af" />
                  <Text style={styles.suggestionLabel}>{suggestion.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {recentProducts.length > 0 && !searchQuery && (
            <TouchableOpacity
              style={styles.recentHeader}
              onPress={() => setShowRecentDropdown(!showRecentDropdown)}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={16} color="#6b7280" />
              <Text style={styles.recentTitle}>
                {t('Recently Added')} · {itemsCount} {itemsCount === 1 ? t('item') : t('items')}
              </Text>
              <Ionicons
                name={showRecentDropdown ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#6b7280"
              />
            </TouchableOpacity>
          )}

          {recentProducts.length > 0 && !searchQuery && showRecentDropdown && (
            <View style={styles.recentChips}>
              {recentProducts.map((item) => (
                <TouchableOpacity
                  key={`${item.productId}-${item.variantId ?? 'none'}`}
                  style={styles.recentChip}
                  onPress={() => {
                    const product = products.find((p) => p.id === item.productId);
                    if (product) {
                      const variants = getVariantArray(product);
                      if (item.variantId) {
                        const variant = variants.find((v: any) => v.id === item.variantId);
                        if (variant) {
                          handleAddProduct(product, variant);
                        }
                      } else {
                        handleAddProduct(product);
                      }
                    }
                  }}
                >
                  <Ionicons name="add-circle-outline" size={14} color="#059669" />
                  <Text style={styles.recentChipText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {filteredProducts.length > 0 && (
            <View style={styles.resultsContainer}>
              <Text style={styles.resultsTitle}>{t('Search Results')}</Text>
              {filteredProducts.map((product, productIndex) => {
                const productKey = product.id ?? product.barcode ?? product.name ?? productIndex;
                const productStableKey = `product-${productKey}`;
                const variants = getVariantArray(product);
                return (
                  <View key={productStableKey} style={styles.productCard}>
                    <View style={styles.productHeader}>
                      <View>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={styles.productCategory}>{product.category}</Text>
                        </View>
                      {!product.hasVariants && (
                        <View style={styles.productPrice}>
                          <Text style={styles.productPriceValue}>
                            Rs. {getResolvedPrice(product).toLocaleString()}
                          </Text>
                          <Button size="sm" onPress={() => handleAddProduct(product)}>
                            {t('Add Item')}
                          </Button>
                          </View>
                      )}
                    </View>

                    {product.hasVariants && variants.length > 0 && (
                      <View style={styles.variantList}>
                        {variants.map((variant: any, variantIndex: number) => {
                          const variantKey = `${productStableKey}-variant-${
                            variant.id ?? variant.barcode ?? variantIndex
                          }`;
                          const detailTags = [
                            variant.size ? `${t('Size')}: ${variant.size}` : null,
                            variant.color ? `${t('Color')}: ${variant.color}` : null,
                            variant.material ? `${t('Material / Brand')}: ${variant.material}` : null,
                            variant.customAttributeLabel && variant.customAttributeValue
                              ? `${variant.customAttributeLabel}: ${variant.customAttributeValue}`
                              : null,
                          ].filter(Boolean);
                          return (
                            <View key={variantKey} style={styles.variantRow}>
                              <View style={styles.variantDetails}>
                                <Text style={styles.variantName}>{variant.name}</Text>
                                {detailTags.length > 0 && (
                                  <View style={styles.variantMetaChips}>
                                    {detailTags.map((tag, idx) => (
                                      <Text key={`${variantKey}-tag-${idx}`} style={styles.variantMetaChip}>
                                        {tag}
                                      </Text>
                                    ))}
                                  </View>
                                )}
                                {!detailTags.length && variant.design ? (
                                  <Text style={styles.variantMeta}>{variant.design}</Text>
                                ) : null}
                              </View>
                              <View style={styles.variantActions}>
                                <Text style={styles.variantPrice}>
                                  Rs. {getResolvedPrice(product, variant).toLocaleString()}
                                </Text>
                                <Button
                                  size="sm"
                                  onPress={() => handleAddProduct(product, variant)}
                                >
                                  {t('Add Item')}
                                </Button>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          
                
          <View style={styles.sectionSpacing}>
            <View style={styles.cartCard}>
              <View style={styles.cartHeaderRow}>
                <View>
                  <Text style={styles.sectionTitle}>{t('Cart')}</Text>
                  <Text style={styles.subSectionLabel}>
                    {t('Tap items to edit quantity or price.')}
                  </Text>
                </View>
                {cart.length > 0 && (
                  <TouchableOpacity onPress={handleClearCart} style={styles.clearCartTextButton}>
                    <Text style={styles.clearCartText}>{t('Clear Cart')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {cart.length === 0 ? (
                <View style={styles.emptyCartState}>
                  <Ionicons name="cart-outline" size={48} color="#cbd5f5" />
                  <Text style={styles.emptyCartTitle}>{t('Your cart is empty')}</Text>
                  <Text style={styles.emptyCartSubtitle}>
                    {t('Search or scan a product to add it here.')}
                  </Text>
                </View>
              ) : (
                cart.map((item) => {
                  const quantityKey = getQuantityKey(item.productId, item.variantId ?? null);
                  const quantityValue = quantityInputs[quantityKey] ?? String(item.quantity);
                  const displayPrice = Number.isFinite(item.price) ? item.price : 0;
                  const displayQuantity = getInputQuantityOrCart(item);

                  return (
                    <View
                      key={`${item.productId}-${item.variantId ?? 'base'}`}
                      style={styles.cartRow}
                    >
                      <View style={styles.cartInfo}>
                        <View style={styles.cartNameRow}>
                          <TouchableOpacity
                            style={styles.cartRemoveIcon}
                            onPress={() => removeItem(item.productId, item.variantId ?? null)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                          </TouchableOpacity>
                          <Text style={styles.cartName}>
                            {item.name}
                            {item.variantName ? ` • ${item.variantName}` : ''}
                          </Text>
                        </View>
                        {item.variantAttributes && item.variantAttributes.length > 0 && (
                          <View style={styles.cartMetaRow}>
                            {item.variantAttributes.map((attr) => (
                              <Text key={`${item.productId}-${attr.label}`} style={styles.cartMeta}>
                                {attr.label}: {attr.value}
                              </Text>
                            ))}
                          </View>
                        )}
                        <Text style={styles.cartQtyLine}>
                          <Text style={styles.cartQtyPart}>
                            {displayQuantity} x Rs. {displayPrice.toLocaleString()}
                          </Text>
                          <Text style={styles.cartQtyArrow}>  ->  </Text>
                          <Text style={styles.cartQtyTotal}>
                            Rs. {(displayPrice * displayQuantity).toLocaleString()}
                          </Text>
                        </Text>
                      </View>
                      <View style={styles.cartControls}>
                        <View style={styles.quantityControls}>
                          <TouchableOpacity
                            style={styles.quantityButton}
                            onPress={() => handleStepQuantity(item, -1)}
                          >
                            <Ionicons name="remove" size={18} color="#111827" />
                          </TouchableOpacity>
                          <TextInput
                            style={[
                              styles.quantityInput,
                              activeQuantityKey === quantityKey && styles.quantityInputFocused,
                            ]}
                            value={quantityValue}
                            onChangeText={(text) => handleQuantityInputChange(quantityKey, text, item)}
                            onFocus={() => setActiveQuantityKey(quantityKey)}
                            onBlur={() => {
                              setActiveQuantityKey(null);
                              handleQuantityInputCommit(item, quantityValue);
                            }}
                            onSubmitEditing={() => handleQuantityInputCommit(item, quantityValue)}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                          />
                          <TouchableOpacity
                            style={styles.quantityButton}
                            onPress={() => handleStepQuantity(item, 1)}
                          >
                            <Ionicons name="add" size={18} color="#111827" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}

              {isInstantAddMode && (
                <View style={styles.paymentStatusRow}>
                  <TouchableOpacity
                    style={[
                      styles.paymentOption,
                      paymentStatus === 'net' && styles.paymentOptionActive,
                    ]}
                    onPress={() => setPaymentStatus('net')}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={paymentStatus === 'net' ? 'radio-button-on' : 'radio-button-off'}
                      size={16}
                      color={paymentStatus === 'net' ? '#2563eb' : '#94a3b8'}
                    />
                    <Text
                      style={[
                        styles.paymentOptionText,
                        paymentStatus === 'net' && styles.paymentOptionTextActive,
                      ]}
                    >
                      {t('Net')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.paymentOption,
                      paymentStatus === 'due' && styles.paymentOptionActive,
                    ]}
                    onPress={() => setPaymentStatus('due')}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={paymentStatus === 'due' ? 'radio-button-on' : 'radio-button-off'}
                      size={16}
                      color={paymentStatus === 'due' ? '#2563eb' : '#94a3b8'}
                    />
                    <Text
                      style={[
                        styles.paymentOptionText,
                        paymentStatus === 'due' && styles.paymentOptionTextActive,
                      ]}
                    >
                      {t('Due')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.totals}>
                <View style={styles.totalRow}>
                  <View>
                    <Text style={styles.totalLabel}>{t('Subtotal')}</Text>
                    <Text style={styles.totalValue}>Rs. {subtotal.toLocaleString()}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowPricingAdjustments((prev) => !prev)}
                    style={styles.discountLink}
                  >
                    <Text style={styles.discountLinkText}>{t('Discount & tax')}</Text>
                    <Ionicons
                      name={showPricingAdjustments ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="#2563eb"
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, styles.totalDueLabel]}>
                    {t('Total Due')}
                  </Text>
                  <Text style={[styles.totalValue, styles.totalDue]}>
                    Rs. {totalDue.toLocaleString()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.extraAmountLink}
                  onPress={() => setShowRandomPurchase((prev) => !prev)}
                >
                  <Ionicons name="add-outline" size={16} color="#2563eb" />
                  <Text style={styles.extraAmountText}>{t('Add extra amount')}</Text>
                </TouchableOpacity>
                {showRandomPurchase && (
                  <View style={styles.inlineInput}>
                    <TextInput
                      value={randomPurchaseInput}
                      onChangeText={(text) => setRandomPurchaseInput(text.replace(/,/g, '.'))}
                      keyboardType="decimal-pad"
                      placeholder={t('e.g. delivery charges, packaging')}
                      placeholderTextColor="#9ca3af"
                      style={[styles.textField, styles.extraAmountField]}
                    />
                  </View>
                )}
              </View>
          </View>
          <View style={styles.customerSection}>
            <TouchableOpacity
              style={styles.customerAccordion}
              onPress={() => setShowCustomerDetails((prev) => !prev)}
              activeOpacity={0.85}
            >
              <View>
                <Text style={styles.sectionTitle}>{t('Customer')}</Text>
                <Text style={styles.subSectionLabel}>
                  {t('Walk-in customer - change')}
                </Text>
              </View>
              <Ionicons
                name={showCustomerDetails ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#2563eb"
              />
            </TouchableOpacity>
            {showCustomerDetails ? (
              <>
                <View style={styles.customerToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.customerToggleButton,
                      customerMode === 'walk-in' && styles.customerToggleButtonActive,
                    ]}
                    onPress={() => setCustomerMode('walk-in')}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.customerToggleText,
                        customerMode === 'walk-in' && styles.customerToggleTextActive,
                      ]}
                    >
                      {t('Walk-in')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.customerToggleButton,
                      customerMode === 'saved' && styles.customerToggleButtonActive,
                    ]}
                    onPress={() => setCustomerMode('saved')}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.customerToggleText,
                        customerMode === 'saved' && styles.customerToggleTextActive,
                      ]}
                    >
                      {t('Saved customer')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {customerMode === 'walk-in' ? (
                  <Input
                    label={t('Walk-in Customer Name (optional)')}
                    value={walkInCustomerName}
                    onChangeText={setWalkInCustomerName}
                    placeholder={t('Enter name')}
                    editable
                    containerStyle={styles.walkInInput}
                  />
                ) : (
                  <>
                    <Text style={styles.inputLabel}>{t('Select Customer')}</Text>
                    <Select
                      value={selectedCustomerId ? selectedCustomerId.toString() : ''}
                      onValueChange={(value) => {
                        if (!value) {
                          setSelectedCustomerId(null);
                        } else {
                          setSelectedCustomerId(Number(value));
                          setWalkInCustomerName('');
                        }
                      }}
                      options={customerOptions}
                      placeholder={t('Select Customer')}
                      containerStyle={styles.selectContainer}
                    />

                    {selectedCustomer && (
                      <Text style={styles.customerMeta}>
                        {t('Credit Available')}: Rs. {selectedCustomer.credit.toLocaleString()}
                      </Text>
                    )}

                    <TouchableOpacity
                      onPress={() => router.push('/modals/customer-account')}
                      style={styles.addCustomerLink}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.addCustomerText}>{t('Add Customer')}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#2563eb" />
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : null}
          </View>
        </View>
        </ScrollView>
        <View
          style={[
            styles.stickyBar,
            !canCheckout && styles.stickyBarDisabled,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View>
            <Text style={styles.stickyLabel}>{t('Total')}</Text>
            {cart.length > 0 ? (
              <Text style={styles.stickySubLabel}>
                {itemsCount} {itemsCount === 1 ? t('item') : t('items')}
              </Text>
            ) : null}
            <Text style={styles.stickyTotal}>Rs. {totalDue.toLocaleString()}</Text>
          </View>
          <Button
            onPress={handleProceedToPayment}
            loading={isQuickPaying || isCompletingSale}
            disabled={!canCheckout || isQuickPaying || isCompletingSale}
            style={styles.stickyButton}
          >
            {!canCheckout ? t('Add items or amount to continue.') : t('Complete Sale')}
          </Button>
        </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={showCustomProductModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomProductModal(false)}
        onShow={() => {
          const timer = setTimeout(() => customNameInputRef.current?.focus(), 200);
          return () => clearTimeout(timer);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
          style={styles.modalOverlay}
        >
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>{t('Add Custom Product')}</Text>
                  <Text style={styles.modalSubtitle}>
                    {t('Create a one-time product for this sale.')}
                  </Text>
                </View>
                <View style={styles.modalBadge}>
                  <Ionicons name="sparkles" size={14} color="#2563eb" />
                  <Text style={styles.modalBadgeText}>{t('Quick add')}</Text>
                </View>
              </View>
              <Input
                ref={customNameInputRef}
                label={t('Product Name')}
                value={customName}
                onChangeText={(value) => {
                  setCustomName(value);
                }}
                placeholder={t('e.g. Service Charge, Gift Wrap, Packing')}
              />
              <View style={styles.quickNamesHeader}>
                <TouchableOpacity
                  style={styles.quickNamesToggle}
                  onPress={() => setShowCustomNameChips((prev) => !prev)}
                >
                  <Ionicons
                    name={showCustomNameChips ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color="#d946ef"
                  />
                  <Text style={styles.quickNamesTitle}>{t('Quick Suggestions')}</Text>
                  <Text style={styles.quickNamesToggleText}>
                    {showCustomNameChips ? t('Hide') : t('Show')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickNamesManage}
                  onPress={() => setIsManageCustomNamesVisible(true)}
                >
                  <Ionicons name="settings-outline" size={16} color="#2563eb" />
                  <Text style={styles.quickNamesManageText}>{t('Manage')}</Text>
                </TouchableOpacity>
              </View>
              {renderCustomNameChips()}
              <View style={styles.inlineInputs}>
                <Input
                  label={t('Price')}
                  value={customPrice}
                  onChangeText={(value) => {
                    const normalized = value.replace(/,/g, '.');
                    setCustomPrice(normalized);
                    if (customPriceError) {
                      setCustomPriceError(null);
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder={t('Enter price')}
                  error={customPriceError ?? undefined}
                  ref={customPriceInputRef}
                  containerStyle={styles.inlineInput}
                  onBlur={() => {
                    const parsed = Number(customPrice);
                    if (!Number.isFinite(parsed) || parsed <= 0) {
                      setCustomPriceError(t('Price must be greater than 0.'));
                    }
                  }}
                />
                <Input
                  label={t('Quantity')}
                  value={customQuantity}
                  onChangeText={(value) => setCustomQuantity(value.replace(/,/g, '.'))}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  containerStyle={styles.inlineInput}
                />
              </View>
              <View style={styles.customFieldRow}>
                <Input
                  label={t('Extra detail label (optional)')}
                  value={customFieldLabel}
                  onChangeText={setCustomFieldLabel}
                  placeholder={t('e.g., Shade')}
                  containerStyle={styles.customFieldInput}
                />
                <Input
                  label={t('Extra detail value (optional)')}
                  value={customFieldValue}
                  onChangeText={setCustomFieldValue}
                  placeholder={t('e.g., Matte Finish')}
                  containerStyle={styles.customFieldInput}
                />
              </View>

              <View style={styles.modalActions}>
                <Button
                  variant="outline"
                  onPress={() => {
                    setShowCustomProductModal(false);
                    setCustomPriceError(null);
                  }}
                  style={styles.modalActionButton}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  onPress={handleAddCustomProduct}
                  style={styles.modalActionButton}
                  disabled={!isCustomProductValid}
                >
                  {t('Add Item')}
                </Button>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Barcode Scanner Modal */}
      <Modal
        transparent
        visible={showBarcodeModal}
        animationType="fade"
        onRequestClose={() => {
          setShowBarcodeModal(false);
          setShowCamera(false);
        }}
      >
        <View style={styles.barcodeModalOverlay}>
          <View style={styles.barcodeModalContent}>
              {showCamera ? (
                <>
                  <Text style={styles.barcodeModalTitle}>{t('Scan Barcode')}</Text>
                  <Text style={styles.barcodeModalSubtitle}>
                    {t('Align the barcode inside the frame')}
                  </Text>
                  <View style={styles.scanModeRow}>
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
                    <TouchableOpacity
                      style={[styles.multiScanChip, multiScanMode && styles.multiScanChipActive]}
                      onPress={() => setMultiScanMode((prev) => !prev)}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="repeat"
                        size={14}
                        color={multiScanMode ? '#1d4ed8' : '#6b7280'}
                      />
                      <Text
                        style={[
                          styles.multiScanLabel,
                          multiScanMode && styles.multiScanLabelActive,
                        ]}
                      >
                        {t('Multi-scan')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.cameraContainer}>
                    <CameraView
                      style={StyleSheet.absoluteFillObject}
                      facing="back"
                      barcodeScannerSettings={{
                        barcodeTypes: barcodeTypesForMode,
                      }}
                      onBarcodeScanned={(result) => {
                        if (canScanBarcode && result?.data) {
                          handleBarCodeScanned(result.data);
                        }
                      }}
                    />
                    <View style={styles.cameraOverlay}>
                      <View style={styles.scanFrame} />
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.manualToggleButton}
                    onPress={() => setShowCamera(false)}
                  >
                    <Text style={styles.manualToggleText}>{t('Enter manually instead')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.barcodeModalButton, styles.barcodeModalButtonCancel, { marginTop: 16 }]}
                    onPress={() => {
                      setShowCamera(false);
                      setShowBarcodeModal(false);
                      setCanScanBarcode(false);
                    }}
                  >
                    <Text style={styles.barcodeModalButtonText}>{t('Cancel')}</Text>
                  </TouchableOpacity>
                </>
            ) : (
              <>
                <Text style={styles.barcodeModalTitle}>{t('Scan Barcode')}</Text>
                <Text style={styles.barcodeModalSubtitle}>
                  {t('Choose scanning method')}
                </Text>
                
                {/* Camera Scan Button */}
                <TouchableOpacity
                  style={styles.scanMethodButton}
                  onPress={() => handleCameraScanRequest()}
                >
                  <Ionicons name="camera" size={32} color="#2563eb" />
                  <Text style={styles.scanMethodTitle}>{t('Scan with Camera')}</Text>
                  <Text style={styles.scanMethodDesc}>{t('Use device camera to scan barcode')}</Text>
                </TouchableOpacity>

                {/* Manual Input */}
                <View style={styles.manualInputSection}>
                  <Text style={styles.manualInputLabel}>{t('Or enter manually:')}</Text>
                  <TextInput
                    style={styles.barcodeModalInput}
                    value={barcodeInput}
                    onChangeText={setBarcodeInput}
                    placeholder={t('Enter barcode')}
                    keyboardType="default"
                    onSubmitEditing={() => {
                      if (barcodeInput.trim()) {
                        setSearchQuery(barcodeInput.trim());
                        setShowBarcodeModal(false);
                        setBarcodeInput('');
                      }
                    }}
                  />
                </View>

                <View style={styles.barcodeModalButtons}>
                  <TouchableOpacity
                    style={[styles.barcodeModalButton, styles.barcodeModalButtonCancel]}
                    onPress={() => {
                      setShowBarcodeModal(false);
                      setBarcodeInput('');
                    }}
                  >
                    <Text style={styles.barcodeModalButtonText}>{t('Cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.barcodeModalButton, styles.barcodeModalButtonSearch]}
                    onPress={() => {
                      if (barcodeInput.trim()) {
                        setSearchQuery(barcodeInput.trim());
                        setShowBarcodeModal(false);
                        setBarcodeInput('');
                      }
                    }}
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

      {/* Voice Search Modal */}
      <Modal
        transparent
        visible={showVoiceModal}
        animationType="fade"
        onRequestClose={() => {
          setShowVoiceModal(false);
          setIsListening(false);
        }}
      >
        <View style={styles.voiceModalOverlay}>
          <View style={styles.voiceModalContent}>
            <Text style={styles.voiceModalTitle}>{t('Voice Search')}</Text>
            
            {isListening ? (
              <>
                <View style={styles.voiceMicContainer}>
                  <View style={[styles.voicePulse, styles.voicePulse1]} />
                  <View style={[styles.voicePulse, styles.voicePulse2]} />
                  <View style={[styles.voicePulse, styles.voicePulse3]} />
                  <Ionicons name="mic" size={48} color="#10b981" />
                </View>
                <Text style={styles.voiceListeningText}>{t('Listening...')}</Text>
                <Text style={styles.voiceHintText}>{t('Speak the product name')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.voiceModalSubtitle}>
                  {t('Type or speak the product name')}
                </Text>
                <TextInput
                  style={styles.voiceModalInput}
                  value={voiceText}
                  onChangeText={setVoiceText}
                  placeholder={t('E.g., Shell R3, Malaysian Clifton')}
                  autoFocus
                  onSubmitEditing={handleVoiceSubmit}
                />
                <View style={styles.voiceModalButtons}>
                  <TouchableOpacity
                    style={[styles.voiceModalButton, styles.voiceModalButtonCancel]}
                    onPress={() => {
                      setShowVoiceModal(false);
                      setVoiceText('');
                    }}
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
      </Modal>

      <Modal
        transparent
        visible={isAdvancedOptionsVisible}
        animationType="slide"
        onRequestClose={() => setIsAdvancedOptionsVisible(false)}
        >
        <View style={styles.advancedOverlay} pointerEvents="box-none">
          <View style={styles.advancedSheet}>
            <View style={styles.advancedHeader}>
              <View style={styles.advancedHandle} />
              <Text style={styles.advancedTitle}>{t('Advanced options')}</Text>
              <TouchableOpacity onPress={() => setIsAdvancedOptionsVisible(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.advancedOptionTitle}>{t('When tapping a product')}</Text>
            <View style={styles.instantModeOptions}>
              {searchActionOptions.map((option) => {
                const isActive = instantAddMode === option.value;
                const description =
                  option.value === 'direct'
                    ? t('Adds 1 item immediately; edit in cart if needed')
                    : t('Opens quantity so you can set it before adding');
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.instantModeOption, isActive && styles.instantModeOptionActive]}
                    onPress={() => setInstantAddMode(option.value)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={isActive ? 'radio-button-on' : 'radio-button-off'}
                      size={14}
                      color={isActive ? '#2563eb' : '#94a3b8'}
                    />
                    <View>
                      <Text style={styles.instantModeTitle}>{option.title}</Text>
                      <Text style={styles.advancedOptionHelper}>{description}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[
                styles.quickPaymentToggle,
                quickPaymentEnabled && styles.quickPaymentToggleActive,
                styles.quickPaymentRow,
              ]}
              activeOpacity={0.75}
              onPress={() => setQuickPaymentEnabled(!quickPaymentEnabled)}
            >
              <Ionicons
                name={quickPaymentEnabled ? 'checkbox-outline' : 'square-outline'}
                size={16}
                color={quickPaymentEnabled ? '#2563eb' : '#94a3b8'}
              />
              <Text
                style={[
                  styles.quickPaymentText,
                  quickPaymentEnabled && styles.quickPaymentTextActive,
                ]}
              >
                {t('Quick sale (skip details)')}
              </Text>
            </TouchableOpacity>

            {recentProducts.length > 0 && (
              <View style={styles.advancedOptionRow}>
                <View>
                  <Text style={styles.advancedOptionLabel}>{t('Recently added list')}</Text>
                  <Text style={styles.advancedOptionHelper}>
                    {t('Tap to open or clear your recent products.')}
                  </Text>
                </View>
                <View style={styles.advancedOptionActions}>
                  <TouchableOpacity
                    style={styles.advancedPill}
                    onPress={() => {
                      setShowRecentDropdown(true);
                      setIsAdvancedOptionsVisible(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.advancedPillText}>{t('Show')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.advancedPill}
                    onPress={() => {
                      setRecentProducts([]);
                      db.setSetting('pos.recentProducts', []).catch(console.warn);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.advancedPillText}>{t('Clear recent')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={isManageCustomNamesVisible}
        animationType="slide"
        onRequestClose={() => setIsManageCustomNamesVisible(false)}
      >
        <View style={styles.manageOverlay}>
          <View style={styles.manageCard}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>{t('Manage Quick Product Names')}</Text>
              <TouchableOpacity onPress={() => setIsManageCustomNamesVisible(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.manageSubtitle}>
              {t('Add the product names you use most often for one-tap autofill.')}
            </Text>
            <View style={styles.manageAddRow}>
              <Input
                value={newCustomName}
                onChangeText={setNewCustomName}
                placeholder={t('New suggestion name')}
                containerStyle={styles.manageInputContainer}
              />
              <Button style={styles.manageAddButton} onPress={handleAddCustomNameSuggestion}>
                {t('Add')}
              </Button>
            </View>
            <ScrollView style={styles.manageList}>
              {customNameSuggestions.length === 0 ? (
                <Text style={styles.quickNamesHint}>{t('No quick product suggestions yet')}</Text>
              ) : (
                customNameSuggestions.map((item) => (
                  <View key={`manage-${item}`} style={styles.manageItem}>
                    <View style={styles.manageItemLeft}>
                      <Ionicons name="pricetag-outline" size={16} color="#d946ef" />
                      <Text style={styles.manageItemText}>{item}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveCustomName(item)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const CUSTOM_PRODUCT_NAME_SETTING_KEY = 'pos.customProductNames';
const MAX_CUSTOM_PRODUCT_NAMES = 8;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  flex: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
  innerWide: {
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  contentInner: {
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 24,
    marginBottom: 12,
  },
  subSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 6,
  },
  advancedButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    height: 52,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  searchActionButton: {
    padding: 8,
    marginLeft: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f5f7fb',
  },
  searchActionButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  searchActionText: {
    fontSize: 12,
    color: '#475569',
  },
  searchActionTextActive: {
    color: '#2563eb',
    fontWeight: '700',
  },
  multiScanRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  multiScanStandalone: {
    marginLeft: 0,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inlineLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  inlineLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  instantModeContainer: {
    marginTop: 12,
    gap: 4,
  },
  instantModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instantModeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  instantModeOptions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  instantModeOption: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  instantModeOptionActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  instantModeTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  quickPaymentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  quickPaymentToggleActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  quickPaymentText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  quickPaymentTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 150,
    left: 16,
    right: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 20,
  },
  suggestionsDropdown: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  suggestionLabel: {
    fontSize: 14,
    color: '#0f172a',
  },
  customProductButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 16,
  },
  customProductIcon: {
    marginRight: 8,
  },
  customProductText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
  },
  recentSection: {
    marginTop: 16,
    marginBottom: 8,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 4,
  },
  recentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  recentChipsHeader: {
    display: 'none',
  },
  clearRecentButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#fef2f2',
  },
  clearRecentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
    marginLeft: 4,
  },
  recentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  recentChipText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  resultsContainer: {
    marginTop: 24,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emptyCartState: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyCartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptyCartSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  productCategory: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  productPrice: {
    alignItems: 'flex-end',
    gap: 6,
  },
  productPriceValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
  },
  variantList: {
    marginTop: 12,
    gap: 12,
  },
  variantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  variantDetails: {
    flex: 1,
    gap: 4,
  },
  variantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  variantMetaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  variantMetaChip: {
    fontSize: 11,
    color: '#4338ca',
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  variantMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  variantActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  variantPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  sectionSpacing: {
    marginTop: 32,
  },
  cartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    gap: 10,
  },
  emptyCart: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  cartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  cartInfo: {
    flex: 1,
    marginRight: 12,
  },
  cartNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cartRemoveIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecdd3',
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  cartMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  cartMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  cartPrice: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  cartQtyLine: {
    fontSize: 13,
    color: '#1f2937',
    marginTop: 2,
  },
  cartQtyPart: {
    color: '#4b5563',
  },
  cartQtyArrow: {
    color: '#9ca3af',
  },
  cartQtyTotal: {
    color: '#2563eb',
    fontWeight: '700',
  },
  cartControls: {
    alignItems: 'flex-end',
    gap: 8,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  quantityInput: {
    minWidth: 64,
    height: 36,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  quantityInputFocused: {
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  quantityValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  totals: {
    marginTop: 16,
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  totalDueLabel: {
    color: '#2563eb',
    fontWeight: '700',
  },
  totalDue: {
    color: '#2563eb',
    fontWeight: '700',
  },
  discountLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discountLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  paymentStatusRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  paymentOptionActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  paymentOptionText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  paymentOptionTextActive: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  extraAmountLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  extraAmountText: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
  clearCartTextButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  clearCartText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  completeSaleButton: {
    marginTop: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  formRowSingle: {
    marginTop: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  toggleRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  toggleRowMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  extraAmountSection: {
    marginTop: 12,
  },
  halfWidth: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  textField: {
    fontSize: 15,
    color: '#111827',
  },
  extraAmountField: {
    width: '75%',
  },
  inputHelperText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 6,
  },
  selectContainer: {
    marginTop: 6,
  },
  walkInInput: {
    marginBottom: 8,
  },
  customerSection: {
    marginTop: 16,
    gap: 10,
  },
  customerAccordion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  customerToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customerToggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  customerToggleButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  customerToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  customerToggleTextActive: {
    color: '#2563eb',
  },
  customerMeta: {
    fontSize: 13,
    color: '#10b981',
    marginTop: 6,
  },
  addCustomerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
  },
  addCustomerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  pricingToggle: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pricingToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  summaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryActionsFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  summaryButton: {
    flex: 1,
  },
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  stickyBarDisabled: {
    opacity: 0.6,
  },
  stickyLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  stickySubLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  stickyTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  stickyButton: {
    flex: 1,
    marginLeft: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalScrollContent: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 24,
    flexGrow: 0,
  },
  modalCard: {
    width: '94%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
  },
  modalBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  customFieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  customFieldInput: {
    flex: 1,
    marginBottom: 0,
  },
  helperText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalActionButton: {
    flex: 1,
  },
  quickNamesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  quickNamesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickNamesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4c1d95',
  },
  quickNamesToggleText: {
    fontSize: 12,
    color: '#9333ea',
  },
  quickNamesManage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickNamesManageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  quickNamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickNameChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#f0abfc',
    backgroundColor: '#fdf4ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  quickNameChipActive: {
    backgroundColor: '#d946ef',
    borderColor: '#d946ef',
  },
  quickNameChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a21caf',
  },
  quickNameChipTextActive: {
    color: '#ffffff',
  },
  quickNamesHint: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 6,
  },
  manageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  advancedOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  advancedSheet: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    gap: 12,
    marginHorizontal: 12,
    maxHeight: '60%',
  },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  advancedHandle: {
    width: 40,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  advancedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  advancedOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  advancedOptionHelper: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  quickPaymentRow: {
    marginTop: 4,
  },
  advancedOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  advancedOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  advancedOptionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  advancedPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  advancedPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  barcodeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  barcodeModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
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
    marginBottom: 8,
    textAlign: 'center',
  },
  barcodeModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  cameraContainer: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#000000',
  },
  scanModeToggle: {
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  flashToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  scanModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  multiScanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  multiScanChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  multiScanLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  multiScanLabelActive: {
    color: '#1d4ed8',
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#10b981',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scanMethodButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  scanMethodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginTop: 8,
    marginBottom: 4,
  },
  scanMethodDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  manualInputSection: {
    marginTop: 8,
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
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 20,
  },
  barcodeModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  barcodeModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
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
    fontWeight: '600',
    color: '#2563eb',
  },
  voiceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  voiceModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
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
    marginBottom: 20,
    textAlign: 'center',
  },
  voiceModalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  voiceMicContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
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
    marginBottom: 8,
  },
  voiceHintText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  voiceModalInput: {
    borderWidth: 2,
    borderColor: '#10b981',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f0fdf4',
    marginBottom: 20,
    width: '100%',
  },
  voiceModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  voiceModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
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
  manageCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  manageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  manageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  manageSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  manageAddRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  manageInputContainer: {
    flex: 1,
    marginBottom: 0,
  },
  manageAddButton: {
    paddingHorizontal: 16,
  },
  manageList: {
    maxHeight: 260,
  },
  manageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  manageItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageItemText: {
    fontSize: 14,
    color: '#1f2937',
  },
});


