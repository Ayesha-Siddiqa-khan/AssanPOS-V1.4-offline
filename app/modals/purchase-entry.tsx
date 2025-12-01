import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Modal, Alert, TextInput, Vibration } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';

import { useLanguage } from '../../contexts/LanguageContext';
import { useData } from '../../contexts/DataContext';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ScanModeToggle, ScanMode } from '../../components/ui/ScanModeToggle';
import { formatDateForDisplay, formatDateForStorage } from '../../lib/date';
import { db } from '../../lib/database';

interface PurchaseDraftItem {
  productId: number;
  variantId: number | null;
  name: string;
  variantName?: string;
  quantity: number;
  costPrice: number;
}

const PAYMENT_OPTIONS = [
  { label: 'Cash', value: 'Cash' },
  { label: 'Bank Transfer', value: 'Bank Transfer' },
  { label: 'Cheque', value: 'Cheque' },
  { label: 'Credit', value: 'Credit' },
];

const QUICK_PRODUCT_SETTING_KEY = 'purchase.quickProducts';
const MAX_QUICK_PRODUCTS = 8;
const PURCHASE_BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'];

export default function PurchaseEntryModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendorId?: string }>();
  const { t } = useLanguage();
  const { vendors, products, addPurchase } = useData();

  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [costPriceInput, setCostPriceInput] = useState('');
  const [quantityPlaceholder, setQuantityPlaceholder] = useState('');
  const [items, setItems] = useState<PurchaseDraftItem[]>([]);
  const [taxRateInput, setTaxRateInput] = useState('');
  const [paidAmountInput, setPaidAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showQuickProducts, setShowQuickProducts] = useState(false);
  const [pinnedProductIds, setPinnedProductIds] = useState<number[]>([]);
  const [isQuickManageVisible, setIsQuickManageVisible] = useState(false);
  const [selectedManageProductId, setSelectedManageProductId] = useState('');
  const [hasLoadedQuickProducts, setHasLoadedQuickProducts] = useState(false);
  const [showTaxFields, setShowTaxFields] = useState(false);
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [canScanBarcode, setCanScanBarcode] = useState(true);
  const skipVariantResetRef = useRef(false);
  const quantityInputRef = useRef<TextInput | null>(null);

  const formattedPurchaseDate = useMemo(
    () => formatDateForDisplay(selectedDate),
    [selectedDate]
  );

  useEffect(() => {
    if (params.vendorId) {
      setSelectedVendorId(String(params.vendorId));
    }
  }, [params.vendorId]);

  const vendorOptions = useMemo(
    () =>
      vendors.map((vendor) => ({
        label: `${vendor.name} (${vendor.phone})`,
        value: vendor.id.toString(),
      })),
    [vendors]
  );

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        label: product.name,
        value: product.id.toString(),
      })),
    [products]
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(selectedProductId)),
    [products, selectedProductId]
  );

  const variantOptions = useMemo(() => {
    if (!selectedProduct || !selectedProduct.hasVariants || !selectedProduct.variants) {
      return [];
    }
    return selectedProduct.variants.map((variant: any) => ({
      label: variant.name,
      value: variant.id.toString(),
    }));
  }, [selectedProduct]);

  useEffect(() => {
    if (skipVariantResetRef.current) {
      skipVariantResetRef.current = false;
      return;
    }
    setSelectedVariantId('');
    if (selectedProduct) {
      const priceValue =
        selectedProduct.hasVariants &&
        selectedProduct.variants &&
        selectedProduct.variants.length > 0
          ? selectedProduct.variants[0].costPrice ?? selectedProduct.variants[0].price ?? null
          : selectedProduct.costPrice ?? null;
      setCostPriceInput(priceValue != null ? String(priceValue) : '');
      setQuantityPlaceholder(t('Enter quantity'));
    } else {
      setCostPriceInput('');
      setQuantityPlaceholder(t('Enter quantity'));
    }
  }, [selectedProduct, t]);

  const savePinnedProducts = async (next: number[]) => {
    try {
      await db.setSetting(QUICK_PRODUCT_SETTING_KEY, next);
    } catch (error) {
      console.warn('Failed to save quick products', error);
    }
  };

  useEffect(() => {
    if (hasLoadedQuickProducts) {
      return;
    }

    const loadPinnedProducts = async () => {
      try {
        const stored = (await db.getSetting(QUICK_PRODUCT_SETTING_KEY)) as number[] | null;
        if (stored && Array.isArray(stored) && stored.length) {
          setPinnedProductIds(stored);
          setHasLoadedQuickProducts(true);
          return;
        }

        if (products.length) {
          const defaults = products.slice(0, MAX_QUICK_PRODUCTS).map((product) => product.id);
          setPinnedProductIds(defaults);
          if (defaults.length) {
            await savePinnedProducts(defaults);
          }
          setHasLoadedQuickProducts(true);
        }
      } catch (error) {
        console.warn('Failed to load quick products', error);
        setHasLoadedQuickProducts(true);
      }
    };

    loadPinnedProducts();
  }, [products, hasLoadedQuickProducts]);

  useEffect(() => {
    if (!hasLoadedQuickProducts) {
      return;
    }

    setPinnedProductIds((current) => {
      const filtered = current.filter((id) => products.some((product) => product.id === id));
      if (filtered.length !== current.length) {
        savePinnedProducts(filtered);
        return filtered;
      }
      return current;
    });
  }, [products, hasLoadedQuickProducts]);

  useEffect(() => {
    if (!isQuickManageVisible) {
      setSelectedManageProductId('');
    }
  }, [isQuickManageVisible]);

  useEffect(() => {
    if (isScannerVisible) {
      setCanScanBarcode(true);
      setScanMode('barcode');
    }
  }, [isScannerVisible]);

  useEffect(() => {
    setQuantityPlaceholder(t('Enter quantity'));
  }, [t]);

  const barcodeTypesForMode = useMemo<BarcodeType[]>(() => {
    if (scanMode === 'qr') {
      return ['qr'];
    }
    if (scanMode === 'barcode') {
      return [...PURCHASE_BARCODE_TYPES];
    }
    return ['qr', ...PURCHASE_BARCODE_TYPES];
  }, [scanMode]);

  const quickProductShortcuts = useMemo(
    () =>
      pinnedProductIds
        .map((id) => products.find((product) => product.id === id))
        .filter((product): product is NonNullable<(typeof products)[number]> => Boolean(product)),
    [pinnedProductIds, products]
  );

  const quickProductOptionsForManage = useMemo(
    () =>
      products
        .filter((product) => !pinnedProductIds.includes(product.id))
        .map((product) => ({
          label: product.name,
          value: product.id.toString(),
        })),
    [products, pinnedProductIds]
  );

  const handleQuickProductSelect = (productId: number) => {
    setSelectedProductId(productId.toString());
  };

  const handleAddQuickProductShortcut = () => {
    if (!selectedManageProductId) {
      Toast.show({ type: 'info', text1: t('Please select a product first') });
      return;
    }

    if (pinnedProductIds.length >= MAX_QUICK_PRODUCTS) {
      Toast.show({ type: 'info', text1: t('Quick list limit reached') });
      return;
    }

    const productId = Number(selectedManageProductId);
    if (pinnedProductIds.includes(productId)) {
      Toast.show({ type: 'info', text1: t('Product already pinned') });
      return;
    }

    const next = [...pinnedProductIds, productId];
    setPinnedProductIds(next);
    savePinnedProducts(next);
    setSelectedManageProductId('');
  };

  const handleRemoveQuickProductShortcut = (productId: number) => {
    Alert.alert(
      t('Remove Quick Product'),
      t('Are you sure you want to remove this product from quick list?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => {
            const next = pinnedProductIds.filter((id) => id !== productId);
            setPinnedProductIds(next);
            savePinnedProducts(next);
          },
        },
      ]
    );
  };

  const ensureScannerPermission = async () => {
    if (cameraPermission?.granted) {
      return true;
    }
    const response = await requestCameraPermission();
    if (!response?.granted) {
      Toast.show({ type: 'info', text1: t('Camera permission required') });
      return false;
    }
    return true;
  };

  const handleOpenProductScanner = async () => {
    const allowed = await ensureScannerPermission();
    if (!allowed) {
      return;
    }
    setCanScanBarcode(true);
    setIsScannerVisible(true);
  };

  const handleCloseProductScanner = () => {
    setIsScannerVisible(false);
  };

  const handleProductBarcodeDetected = (value: string) => {
    if (!canScanBarcode || !value) {
      return;
    }
    Vibration.vibrate(50);
    if (__DEV__) console.log('[DEBUG] purchase entry scan:', value);
    Toast.show({ type: 'info', text1: 'Scanned (purchase entry)', text2: value });
    setCanScanBarcode(false);
    const normalizeBarcode = (input: string | number | null | undefined) =>
      (input == null ? '' : String(input)).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    const trimmed = normalizeBarcode(value);
    if (!trimmed) {
      setTimeout(() => setCanScanBarcode(true), 1500);
      return;
    }

    let productMatch = products.find((product) => normalizeBarcode(product.barcode) === trimmed);
    let variantMatch: any | null = null;

    if (!productMatch) {
      for (const candidate of products) {
        if (candidate.hasVariants && candidate.variants) {
          const candidateVariant = candidate.variants.find(
            (variant: any) => normalizeBarcode(variant.barcode) === trimmed
          );
          if (candidateVariant) {
            productMatch = candidate;
            variantMatch = candidateVariant;
            break;
          }
        }
      }
    }

    if (productMatch) {
      skipVariantResetRef.current = Boolean(variantMatch);
      setSelectedProductId(productMatch.id.toString());
      if (variantMatch) {
        setSelectedVariantId(variantMatch.id.toString());
      } else {
        setSelectedVariantId('');
      }

      // Determine quantity and cost price
      const parsedQty = parseFloat(quantityInput.replace(/[^0-9.]/g, '')) || 0;
      const quantity = parsedQty > 0 ? parsedQty : 1;
      const fallbackCost =
        variantMatch?.costPrice ??
        productMatch.costPrice ??
        variantMatch?.price ??
        productMatch.price ??
        0;
      const parsedCost = parseFloat(costPriceInput.replace(/[^0-9.]/g, '')) || 0;
      const costPrice = parsedCost > 0 ? parsedCost : fallbackCost;

      setIsScannerVisible(false);
      setQuantityInput('');
      setQuantityPlaceholder(
        `${t('Enter quantity')} (${variantMatch ? variantMatch.name : productMatch.name})`
      );
      setCostPriceInput(costPrice ? String(costPrice) : '');
      setTimeout(() => quantityInputRef.current?.focus(), 300);

      Toast.show({
        type: 'success',
        text1: t('Product found'),
        text2: variantMatch
          ? `${productMatch.name} ${'\u2022'} ${variantMatch.name} - ${t('Enter quantity')}`
          : `${productMatch.name} - ${t('Enter quantity')}`,
      });
    } else {
      Toast.show({
        type: 'info',
        text1: t('Product not found'),
        text2: value,
      });
    }

    setTimeout(() => setCanScanBarcode(true), 2000);
  };

  const handleDateChange = (text: string) => {
    // Parse DD/MM/YYYY format
    const parts = text.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const newDate = new Date(year, month, day);
        if (newDate.toString() !== 'Invalid Date') {
          setSelectedDate(newDate);
        }
      }
    }
  };

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + item.quantity * item.costPrice,
        0
      ),
    [items]
  );

  const taxRate = parseFloat(taxRateInput.replace(/[^0-9.]/g, '')) || 0;
  const taxAmount =
    taxRateInput.trim().length === 0 ? 0 : Number(((subtotal * taxRate) / 100).toFixed(2));
  const total = subtotal + taxAmount;
  const paidAmount = parseFloat(paidAmountInput.replace(/[^0-9.]/g, '')) || 0;
  const remainingBalance = Math.max(total - paidAmount, 0);
  const changeDue = Math.max(paidAmount - total, 0);

  const handleAddItem = () => {
    if (!selectedProduct) {
      Toast.show({ type: 'error', text1: t('Select Product') });
      return;
    }

    let variant: any = null;
    if (selectedProduct.hasVariants) {
      if (!selectedVariantId) {
        Toast.show({ type: 'error', text1: t('Select Product') });
        return;
      }
      variant = selectedProduct.variants?.find(
        (v: any) => v.id === Number(selectedVariantId)
      );
      if (!variant) {
        Toast.show({ type: 'error', text1: t('Select Product') });
        return;
      }
    }

    const quantity = parseFloat(quantityInput.replace(/[^0-9.]/g, '')) || 0;
    if (quantity <= 0) {
      Toast.show({ type: 'error', text1: t('Required field') });
      return;
    }

    const fallbackCost =
      variant?.costPrice ??
      selectedProduct.costPrice ??
      variant?.price ??
      selectedProduct.price ??
      0;

    const costPrice =
      parseFloat(costPriceInput.replace(/[^0-9.]/g, '')) || fallbackCost;

    setItems((current) => {
      const index = current.findIndex(
        (item) =>
          item.productId === selectedProduct.id &&
          (item.variantId ?? null) === (variant ? variant.id : null)
      );

      if (index >= 0) {
        const updated = [...current];
        updated[index] = {
          ...updated[index],
          quantity: updated[index].quantity + quantity,
          costPrice,
        };
        return updated;
      }

      return [
        ...current,
        {
          productId: selectedProduct.id,
          variantId: variant ? variant.id : null,
          name: selectedProduct.name,
          variantName: variant?.name,
          quantity,
          costPrice,
        },
      ];
    });

    setQuantityInput('1');
    setCostPriceInput(costPrice.toString());
  };

  const handleRemoveItem = (index: number) => {
    setItems((current) => current.filter((_, idx) => idx !== index));
  };

  const handleSavePurchase = async () => {
    if (!selectedVendorId) {
      Toast.show({ type: 'error', text1: t('Please select a vendor first') });
      return;
    }

    if (items.length === 0) {
      Toast.show({ type: 'error', text1: t('Select at least one item') });
      return;
    }

    const vendor = vendors.find((v) => v.id === Number(selectedVendorId));
    if (!vendor) {
      Toast.show({ type: 'error', text1: t('Please select a vendor first') });
      return;
    }

    const now = new Date();
    const date = formatDateForStorage(selectedDate);
    const time = now.toTimeString().slice(0, 8);

    try {
      setIsSaving(true);
      await addPurchase({
        vendor: {
          id: vendor.id,
          name: vendor.name,
          phone: vendor.phone,
        },
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          costPrice: item.costPrice,
          name: item.name,
          variantName: item.variantName,
        })),
        subtotal,
        taxRate,
        tax: taxAmount,
        total,
        paidAmount,
        remainingBalance,
        // Store the real paid amount; change is derived (paid - total) when displaying receipts
        paymentMethod,
        invoiceNumber: invoiceNumber.trim() || undefined,
        date,
        time,
        status:
          remainingBalance === 0
            ? 'Paid'
            : paidAmount > 0
            ? 'Partially Paid'
            : 'Due',
        note: note.trim() || undefined,
      });
      Toast.show({ type: 'success', text1: t('Purchase recorded successfully') });
      router.back();
    } catch (error) {
      console.error('Failed to record purchase', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('Create Purchase')}</Text>

        <View style={styles.section}>
          <Input
            label={t('Date')}
            value={formattedPurchaseDate}
            onChangeText={handleDateChange}
            placeholder="DD/MM/YYYY"
          />

          <Select
            value={selectedVendorId}
            onValueChange={(value) => setSelectedVendorId(value)}
            options={vendorOptions}
            placeholder={t('Select Vendor')}
            label={t('Vendor')}
          />
          <Button
            variant="ghost"
            onPress={() => router.push('/modals/vendor-account')}
            style={styles.inlineButton}
          >
            {t('Add Vendor')}
          </Button>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Add Item')}</Text>
          <View style={styles.productPickerRow}>
            <Select
              value={selectedProductId}
              onValueChange={(value) => setSelectedProductId(value)}
              options={productOptions}
              placeholder={t('Select Product')}
              label={t('Product')}
              containerStyle={styles.productSelect}
            />
            <TouchableOpacity
              style={[
                styles.scanButton,
                !products.length && styles.scanButtonDisabled,
              ]}
              onPress={handleOpenProductScanner}
              activeOpacity={0.85}
              disabled={!products.length}
            >
              <Ionicons name="scan-outline" size={18} color="#1d4ed8" />
              <Text style={styles.scanButtonText}>{t('Scan')}</Text>
            </TouchableOpacity>
          </View>
          {variantOptions.length > 0 && (
            <Select
              value={selectedVariantId}
              onValueChange={(value) => setSelectedVariantId(value)}
              options={variantOptions}
              placeholder={t('Select Product')}
              label={t('Items')}
            />
          )}
          <View style={styles.quickAddHeader}>
            <TouchableOpacity
              style={styles.quickAddToggle}
              onPress={() =>
                quickProductShortcuts.length && setShowQuickProducts((prev) => !prev)
              }
              activeOpacity={quickProductShortcuts.length ? 0.7 : 1}
            >
              <Ionicons
                name={showQuickProducts ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color="#d946ef"
                style={
                  !quickProductShortcuts.length ? styles.quickAddToggleDisabledIcon : undefined
                }
              />
              <Text style={styles.quickAddTitle}>{t('Quick Add Products')}</Text>
              {quickProductShortcuts.length > 0 && (
                <Text style={styles.quickAddToggleText}>
                  {showQuickProducts ? t('Hide') : t('Show')}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAddManage}
              onPress={() => setIsQuickManageVisible(true)}
            >
              <Ionicons name="settings-outline" size={16} color="#2563eb" />
              <Text style={styles.quickAddManageText}>{t('Manage')}</Text>
            </TouchableOpacity>
          </View>
          {showQuickProducts && quickProductShortcuts.length > 0 ? (
            <View style={styles.quickAddGrid}>
              {quickProductShortcuts.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={[
                    styles.quickAddChip,
                    Number(selectedProductId) === product.id && styles.quickAddChipActive,
                  ]}
                  onPress={() => handleQuickProductSelect(product.id)}
                >
                  <Ionicons
                    name="cube-outline"
                    size={14}
                    color={Number(selectedProductId) === product.id ? '#ffffff' : '#d946ef'}
                  />
                  <Text
                    style={[
                      styles.quickAddChipText,
                      Number(selectedProductId) === product.id && styles.quickAddChipTextActive,
                    ]}
                  >
                    {product.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            showQuickProducts && (
              <View style={styles.quickAddEmpty}>
                <Text style={styles.quickAddEmptyText}>
                  {t('Pin products to access them quickly.')}
                </Text>
              </View>
            )
          )}
          <View style={styles.row}>
            <Input
              ref={quantityInputRef}
              label={t('Quantity')}
              value={quantityInput}
              onChangeText={setQuantityInput}
              keyboardType="numeric"
              containerStyle={styles.rowItem}
              placeholder={quantityPlaceholder || t('Enter quantity')}
            />
            <Input
              label={t('Cost Price')}
              value={costPriceInput}
              onChangeText={setCostPriceInput}
              keyboardType="numeric"
              containerStyle={styles.rowItem}
              placeholder={t('Enter cost price')}
            />
          </View>
          <Button onPress={handleAddItem}>{t('Add Item')}</Button>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={40} color="#9ca3af" />
            <Text style={styles.emptyText}>{t('Select at least one item')}</Text>
          </View>
        ) : (
          <View style={styles.itemsList}>
            {items.map((item, index) => (
              <View key={`${item.productId}-${item.variantId ?? 'base'}-${index}`} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>
                    {item.name}
                    {item.variantName ? ` • ${item.variantName}` : ''}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.quantity} × Rs. {item.costPrice.toLocaleString()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveItem(index)}>
                  <Ionicons name="trash-outline" size={22} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.quickStatsHeader}>
            <Text style={styles.sectionTitle}>{t('Quick Stats')}</Text>
            <TouchableOpacity
              onPress={() => setShowTaxFields((prev) => !prev)}
              style={styles.taxToggle}
              activeOpacity={0.8}
            >
              <Text style={styles.taxToggleText}>
                {showTaxFields ? t('Hide Tax Fields') : t('Add Tax')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('Subtotal')}</Text>
            <Text style={styles.totalValue}>Rs. {subtotal.toLocaleString()}</Text>
          </View>
          {showTaxFields && (
            <View style={styles.row}>
              <Input
                label={t('Tax Rate (%)')}
                value={taxRateInput}
                onChangeText={setTaxRateInput}
                keyboardType="numeric"
                containerStyle={styles.rowItem}
              />
              <Input
              label={t('Tax')}
              value={taxAmount ? taxAmount.toString() : ''}
              editable={false}
              containerStyle={styles.rowItem}
              placeholder="0"
            />
          </View>
          )}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, styles.totalHighlight]}>{t('Total Due')}</Text>
            <Text style={[styles.totalValue, styles.totalHighlight]}>
              Rs. {total.toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Select
            value={paymentMethod}
            onValueChange={(value) => setPaymentMethod(value)}
            options={PAYMENT_OPTIONS}
            label={t('Payment Method')}
          />
          <View style={styles.inputWithButton}>
            <Text style={styles.inputLabel}>{t('Paid Amount')}</Text>
            {total > 0 ? (
              <TouchableOpacity
                style={styles.quickFillButton}
                onPress={() => setPaidAmountInput(total.toString())}
              >
                <Text style={styles.quickFillText}>Rs. {total.toLocaleString()}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Input
            value={paidAmountInput}
            onChangeText={setPaidAmountInput}
            keyboardType="numeric"
            placeholder="0"
          />
          <Input
            label={t('Invoice Number (optional)')}
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
          />
          <Input
            label={t('Note')}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            style={styles.multiline}
            containerStyle={styles.noteContainer}
          />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('Remaining Balance')}</Text>
            <Text style={styles.totalValue}>
              Rs. {remainingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
          {changeDue > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('Change / Credit')}</Text>
              <Text style={[styles.totalValue, { color: '#16a34a' }]}>
                Rs. {changeDue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button
            variant="outline"
            onPress={() => router.back()}
            style={styles.actionButton}
          >
            {t('Cancel')}
          </Button>
          <Button
            onPress={handleSavePurchase}
            loading={isSaving}
            disabled={isSaving}
            style={styles.actionButton}
          >
            {t('Save Purchase')}
          </Button>
        </View>
      </ScrollView>
      <Modal
        transparent
        visible={isScannerVisible}
        animationType="fade"
        onRequestClose={handleCloseProductScanner}
      >
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerCard}>
            <Text style={styles.scannerTitle}>{t('Scan Product Barcode')}</Text>
            <Text style={styles.scannerSubtitle}>
              {t('Align the barcode within the frame to capture it automatically.')}
            </Text>
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
            <View style={styles.scannerCameraWrapper}>
              {cameraPermission?.granted ? (
                <>
                  <CameraView
                    style={styles.scannerCamera}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: barcodeTypesForMode,
                    }}
                    onBarcodeScanned={({ data }) => {
                      if (data) {
                        handleProductBarcodeDetected(data);
                      }
                    }}
                  />
                  <View style={styles.scanFrame} />
                </>
              ) : (
                <View style={styles.scannerPermission}>
                  <Ionicons name="camera-outline" size={40} color="#1d4ed8" />
                  <Text style={styles.scannerPermissionTitle}>{t('Camera permission required')}</Text>
                  <Text style={styles.scannerPermissionText}>
                    {t('Allow access to scan the barcode automatically.')}
                  </Text>
                  <Button style={styles.scannerPermissionButton} onPress={handleOpenProductScanner}>
                    {t('Grant Access')}
                  </Button>
                </View>
              )}
            </View>
            <View style={styles.scannerActions}>
              <Button variant="outline" onPress={handleCloseProductScanner}>
                {t('Cancel')}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        visible={isQuickManageVisible}
        animationType="slide"
        onRequestClose={() => setIsQuickManageVisible(false)}
      >
        <View style={styles.manageOverlay}>
          <View style={styles.manageCard}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>{t('Manage Quick Products')}</Text>
              <TouchableOpacity onPress={() => setIsQuickManageVisible(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Select
              value={selectedManageProductId}
              onValueChange={setSelectedManageProductId}
              options={quickProductOptionsForManage}
              placeholder={t('Select Product')}
              label={t('Choose product to pin')}
            />
            <Button
              style={styles.manageAddButton}
              onPress={handleAddQuickProductShortcut}
              disabled={
                !selectedManageProductId || pinnedProductIds.length >= MAX_QUICK_PRODUCTS
              }
            >
              {pinnedProductIds.length >= MAX_QUICK_PRODUCTS
                ? t('Limit Reached')
                : t('Add to Quick List')}
            </Button>
            <ScrollView style={styles.manageList}>
              {quickProductShortcuts.length === 0 ? (
                <Text style={styles.manageEmptyText}>{t('No quick products yet')}</Text>
              ) : (
                quickProductShortcuts.map((product) => (
                  <View key={product.id} style={styles.manageItem}>
                    <View style={styles.manageItemLeft}>
                      <Ionicons name="cube-outline" size={18} color="#d946ef" />
                      <Text style={styles.manageItemText}>{product.name}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveQuickProductShortcut(product.id)}
                    >
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  dateContainer: {
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  dateField: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateValue: {
    fontSize: 16,
    color: '#111827',
  },
  pickerContainer: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerDoneButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  pickerDoneLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
  },
  inputWithButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  quickFillButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  quickFillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  productPickerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  productSelect: {
    flex: 1,
    marginBottom: 0,
  },
  scanButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
  },
  scanButtonDisabled: {
    opacity: 0.5,
  },
  scanButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  quickAddHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  quickAddToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickAddToggleDisabledIcon: {
    opacity: 0.35,
  },
  quickAddTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  quickAddToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d946ef',
  },
  quickAddManage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickAddManageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  quickAddGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  quickAddChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f0abfc',
    backgroundColor: '#fdf4ff',
  },
  quickAddChipActive: {
    backgroundColor: '#d946ef',
    borderColor: '#d946ef',
  },
  quickAddChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d946ef',
  },
  quickAddChipTextActive: {
    color: '#ffffff',
  },
  quickAddEmpty: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f3e8ff',
    backgroundColor: '#fdf4ff',
  },
  quickAddEmptyText: {
    fontSize: 12,
    color: '#a855f7',
    textAlign: 'center',
  },
  quickStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taxToggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  taxToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  inlineButton: {
    alignSelf: 'flex-start',
  },
  itemsList: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  itemMeta: {
    fontSize: 13,
    color: '#6b7280',
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
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
  totalHighlight: {
    color: '#2563eb',
  },
  multiline: {
    minHeight: 68,
    paddingTop: 12,
    paddingBottom: 12,
    height: undefined,
    textAlignVertical: 'top',
  },
  noteContainer: {
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  manageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  manageCard: {
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
    color: '#0f172a',
  },
  manageAddButton: {
    height: 48,
    justifyContent: 'center',
  },
  manageList: {
    maxHeight: 320,
  },
  manageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  manageItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  manageItemText: {
    fontSize: 14,
    color: '#0f172a',
  },
  manageEmptyText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 12,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.75)',
    justifyContent: 'center',
    padding: 24,
  },
  scannerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scannerSubtitle: {
    fontSize: 13,
    color: '#4b5563',
  },
  scanModeToggle: {
    alignSelf: 'flex-start',
  },
  scannerCameraWrapper: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    height: 280,
    position: 'relative',
  },
  scannerCamera: {
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
    borderRadius: 12,
    backgroundColor: 'rgba(37,99,235,0.05)',
  },
  scannerPermission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#f9fafb',
  },
  scannerPermissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  scannerPermissionText: {
    fontSize: 13,
    color: '#4b5563',
    textAlign: 'center',
  },
  scannerPermissionButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  scannerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
});
