import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';

import { useLanguage } from '../../contexts/LanguageContext';
import { useData } from '../../contexts/DataContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ScanModeToggle, ScanMode } from '../../components/ui/ScanModeToggle';
import { spacing, radii, textStyles } from '../../theme/tokens';

const parseNumber = (value: string) => {
  const normalized = value.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function ProductEntryModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string }>();
  const productId = params.productId ? Number(params.productId) : null;
  const isEditing = Number.isFinite(productId);

  const { t } = useLanguage();
  const { products, addProduct, updateProduct } = useData();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const product = useMemo(
    () => (productId ? products.find((item) => item.id === productId) : null),
    [productId, products]
  );

  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? 'General');
  const [priceInput, setPriceInput] = useState(
    product?.price !== undefined ? String(product.price) : ''
  );
  const [costPriceInput, setCostPriceInput] = useState(
    product?.costPrice !== undefined ? String(product.costPrice) : ''
  );
  const [stockInput, setStockInput] = useState(
    product?.stock !== undefined ? String(product.stock) : ''
  );
  const [minStockInput, setMinStockInput] = useState(
    product?.minStock !== undefined ? String(product.minStock) : ''
  );
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [unit, setUnit] = useState(product?.unit ?? 'Piece');
  const [hasVariants, setHasVariants] = useState(product?.hasVariants ?? false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showQuickCategories, setShowQuickCategories] = useState(false);
  const [quickProductSuggestions, setQuickProductSuggestions] = useState<string[]>([
    'Miss Rose',
    'Mala',
    'Panel',
  ]);
  const [quickCategories, setQuickCategories] = useState<string[]>(['General', 'Make up', 'Hardware']);
  const [manageSuggestionsVisible, setManageSuggestionsVisible] = useState(false);
  const [manageCategoriesVisible, setManageCategoriesVisible] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [canScanBarcode, setCanScanBarcode] = useState(true);
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setName(product.name ?? '');
      setCategory(product.category ?? 'General');
      setPriceInput(product.price !== undefined ? String(product.price) : '');
      setCostPriceInput(
        product.costPrice !== undefined ? String(product.costPrice) : ''
      );
      setStockInput(product.stock !== undefined ? String(product.stock) : '');
      setMinStockInput(
        product.minStock !== undefined ? String(product.minStock) : ''
      );
      setBarcode(product.barcode ?? '');
      setUnit(product.unit ?? '');
    }
  }, [product]);

  const validate = () => {
    // No required fields; allow quick entry without blocking
    setErrors({});
    return true;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    const price = parseNumber(priceInput);
    const costPrice = costPriceInput.trim() ? parseNumber(costPriceInput) : price;
    const stock = stockInput.trim() ? parseNumber(stockInput) : 0;
    const minStock = minStockInput.trim() ? parseNumber(minStockInput) : 0;
    const payload = {
      name: name.trim() || 'Untitled Product',
      category: category.trim() || 'General',
      hasVariants,
      price,
      costPrice,
      barcode: barcode.trim() || undefined,
      unit: unit.trim() || undefined,
      stock: hasVariants ? product?.stock : stock,
      minStock: hasVariants ? product?.minStock : minStock,
      variants: product?.variants,
    } as const;

    try {
      setIsSaving(true);
      if (isEditing && product) {
        await updateProduct(product.id, payload);
        Toast.show({ type: 'success', text1: t('Product saved successfully') });
        if (hasVariants) {
          router.replace(`/modals/product-variants?productId=${product.id}`);
          return;
        }
        router.back();
      } else {
        const newId = await addProduct({
          ...payload,
          hasVariants,
          stock: hasVariants ? 0 : stock,
          minStock: hasVariants ? 0 : minStock,
          variants: hasVariants ? [] : [],
        });
        Toast.show({ type: 'success', text1: t('Product saved successfully') });
        if (hasVariants) {
          router.replace(`/modals/product-variants?productId=${newId}`);
          return;
        }
        router.back();
      }
    } catch (error) {
      console.error('Failed to save product', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsSaving(false);
    }
  };

  const BARCODE_TYPES: BarcodeType[] = ['ean13', 'code128', 'upc_a', 'upc_e'];
  const barcodeTypesForMode = useMemo<BarcodeType[]>(() => {
    if (scanMode === 'qr') return ['qr'];
    if (scanMode === 'all') return [...BARCODE_TYPES, 'qr'];
    return [...BARCODE_TYPES];
  }, [scanMode]);

  const handleOpenScanner = async () => {
    setScanMode('barcode');
    const granted = cameraPermission?.granted
      ? true
      : (await requestCameraPermission())?.granted;
    if (!granted) {
      Toast.show({ type: 'info', text1: t('Camera permission required') });
      return;
    }
    setCanScanBarcode(true);
    setShowScanner(true);
  };

  const handleBarcodeScanned = (data: string) => {
    if (!canScanBarcode || !data) return;
    setCanScanBarcode(false);
    Vibration.vibrate(50);
    console.log('[DEBUG] add product scan:', data);
    Toast.show({ type: 'info', text1: 'Scanned (add product)', text2: data });
    setBarcode(data);
    setShowScanner(false);
    Toast.show({ type: 'success', text1: t('Barcode captured'), text2: data });
    setTimeout(() => setCanScanBarcode(true), 1500);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 120}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Product details')}</Text>
            <Text style={styles.cardSubtitle}>
              {t('Basic info used in sales and reports.')}
            </Text>
            <Input
              label={t('Product Name')}
              value={name}
              onChangeText={setName}
              placeholder={t('e.g., Malaysian Panel, Door Lock')}
              error={errors.name}
            />

            <TouchableOpacity
              style={styles.disclosureRow}
              onPress={() => setShowSuggestions((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View style={styles.disclosureLeft}>
                <Text style={styles.disclosureTitle}>{t('Quick Product Suggestions')}</Text>
                <Text style={styles.disclosureLink}>{showSuggestions ? t('Hide') : t('Show')}</Text>
              </View>
              <TouchableOpacity onPress={() => setManageSuggestionsVisible(true)}>
                <Text style={styles.disclosureLink}>{t('Manage')}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
            {showSuggestions && (
              <>
                <View style={styles.suggestionChips}>
                  {quickProductSuggestions.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={styles.suggestionChip}
                      onPress={() => setName(item)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="pricetag-outline" size={14} color="#a855f7" />
                      <Text style={styles.suggestionChipText}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowCategoryPicker(true)}
              style={styles.selectField}
            >
              <Text style={styles.selectLabel}>{t('Category')} *</Text>
              <View style={styles.selectBox}>
                <Text style={[styles.selectValue, !category && styles.selectPlaceholder]}>
                  {category || t('Select Category')}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#6b7280" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.disclosureRow}
              onPress={() => setShowQuickCategories((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View style={styles.disclosureLeft}>
                <Text style={styles.disclosureTitle}>{t('Quick Categories')}</Text>
                <Text style={styles.disclosureLink}>{showQuickCategories ? t('Hide') : t('Show')}</Text>
              </View>
              <TouchableOpacity onPress={() => setManageCategoriesVisible(true)}>
                <Text style={styles.disclosureLink}>{t('Manage')}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
            {showQuickCategories && (
              <>
                <View style={styles.suggestionChips}>
                  {quickCategories.map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={styles.categoryChip}
                      onPress={() => setCategory(item)}
                      activeOpacity={0.8}
                >
                  <Ionicons name="albums-outline" size={14} color="#9333ea" />
                  <Text style={styles.categoryChipText}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.variantCard, hasVariants && styles.variantCardActive]}
              onPress={() => setHasVariants((prev) => !prev)}
              activeOpacity={0.9}
            >
              <View style={[styles.checkbox, hasVariants && styles.checkboxChecked]}>
                {hasVariants && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('This product has variants (e.g., different designs, sizes, colors)')}
              </Text>
            </TouchableOpacity>
          </View>

          {hasVariants ? (
            <>
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={18} color="#1d4ed8" />
                <Text style={styles.infoBannerText}>
                  {t('You will add variant pricing and stock in the next step.')}
                </Text>
              </View>
              <View style={styles.singleAction}>
                <Button
                  onPress={handleSave}
                  loading={isSaving}
                  disabled={isSaving}
                  style={styles.singleActionButton}
                >
                  {t('Add Product (Add Variants Next)')}
                </Button>
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('Pricing & stock')}</Text>
              <Text style={styles.cardSubtitle}>
                {t('Prices and quantities for this product.')}
              </Text>
              <View style={styles.twoColumn}>
                <View style={styles.col}>
                  <Input
                    label={t('Selling Price (Rs.)')}
                    value={priceInput}
                    onChangeText={setPriceInput}
                    keyboardType="decimal-pad"
                    error={errors.price}
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label={t('Cost Price (Rs.)')}
                    value={costPriceInput}
                    onChangeText={setCostPriceInput}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.twoColumn}>
                <View style={styles.col}>
                  <Input
                    label={t('Initial Stock')}
                    value={stockInput}
                    onChangeText={setStockInput}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label={t('Min. Stock')}
                    value={minStockInput}
                    onChangeText={setMinStockInput}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.barcodeWrapper}>
                <Input
                  label={t('Barcode (Optional)')}
                  value={barcode}
                  onChangeText={setBarcode}
                  autoCapitalize="none"
                  placeholder={t('Enter barcode')}
                  style={styles.barcodeInput}
                />
                <TouchableOpacity
                  style={styles.barcodeIconButton}
                  activeOpacity={0.8}
                  onPress={handleOpenScanner}
                >
                  <Ionicons name="barcode-outline" size={18} color="#2563eb" />
                </TouchableOpacity>
              </View>

              <View style={styles.unitWrapper}>
                <Input
                  label={t('Unit (Optional)')}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder={t('Piece')}
                />
                <Ionicons name="chevron-down" size={16} color="#6b7280" style={styles.unitIcon} />
              </View>

              <View style={styles.actions}>
                <Button variant="outline" onPress={() => router.back()} style={styles.actionButton}>
                  {t('Cancel')}
                </Button>
                <Button
                  onPress={handleSave}
                  loading={isSaving}
                  disabled={isSaving}
                  style={styles.actionButton}
                >
                  {isEditing ? t('Save Changes') : t('Add Product')}
                </Button>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        transparent
        visible={showScanner}
        animationType="fade"
        onRequestClose={() => setShowScanner(false)}
      >
        <View style={styles.scannerOverlay}>
          <View style={styles.scannerCard}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>{t('Scan Barcode')}</Text>
              <TouchableOpacity style={styles.scannerClose} onPress={() => setShowScanner(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>
            <Text style={styles.scannerSubtitle}>{t('Align the barcode inside the frame')}</Text>
            {!cameraPermission?.granted ? (
              <View style={styles.scannerCenter}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.scannerText}>{t('Preparing camera...')}</Text>
              </View>
            ) : (
              <View style={styles.scannerCameraWrapper}>
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
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: barcodeTypesForMode }}
                  onBarcodeScanned={(result) => {
                    if (result?.data) {
                      handleBarcodeScanned(result.data);
                    }
                  }}
                />
                <View style={styles.cameraOverlay}>
                  <View style={styles.scanFrame} />
                </View>
              </View>
            )}
            <TouchableOpacity
              style={[styles.scannerButton, styles.scannerCancel]}
              onPress={() => setShowScanner(false)}
            >
              <Text style={styles.scannerButtonText}>{t('Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        visible={manageSuggestionsVisible}
        animationType="fade"
        onRequestClose={() => setManageSuggestionsVisible(false)}
      >
        <View style={styles.manageOverlay}>
          <View style={styles.manageCard}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>{t('Manage Quick Product Names')}</Text>
              <TouchableOpacity onPress={() => setManageSuggestionsVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <Text style={styles.manageSubtitle}>
              {t('Add the product names you use most often for one-tap autofill.')}
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {quickProductSuggestions.map((item) => (
                <View key={item} style={styles.manageListItem}>
                  <View style={styles.manageListLeft}>
                    <Ionicons name="pricetag-outline" size={16} color="#a855f7" />
                    <Text style={styles.manageListText}>{item}</Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={10}
                    onPress={() =>
                      setQuickProductSuggestions((prev) => prev.filter((x) => x !== item))
                    }
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        visible={manageCategoriesVisible}
        animationType="fade"
        onRequestClose={() => setManageCategoriesVisible(false)}
      >
        <View style={styles.manageOverlay}>
          <View style={styles.manageCard}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>{t('Manage Quick Categories')}</Text>
              <TouchableOpacity onPress={() => setManageCategoriesVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <Text style={styles.manageSubtitle}>
              {t('Add categories you use often for quick selection.')}
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {quickCategories.map((item) => (
                <View key={item} style={styles.manageListItem}>
                  <View style={styles.manageListLeft}>
                    <Ionicons name="albums-outline" size={16} color="#9333ea" />
                    <Text style={styles.manageListText}>{item}</Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={10}
                    onPress={() => setQuickCategories((prev) => prev.filter((x) => x !== item))}
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        visible={showCategoryPicker}
        animationType="fade"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <View style={styles.manageOverlay}>
          <View style={styles.manageCard}>
            <View style={styles.manageHeader}>
              <Text style={styles.manageTitle}>{t('Select Category')}</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 250 }}>
              {quickCategories.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.manageListItem}
                  onPress={() => {
                    setCategory(item);
                    setShowCategoryPicker(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.manageListLeft}>
                    <Ionicons name="albums-outline" size={16} color="#9333ea" />
                    <Text style={styles.manageListText}>{item}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.manageRow}>
              <Input
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder={t('Add new category')}
                containerStyle={styles.manageInputContainer}
              />
              <Button
                onPress={() => {
                  const trimmed = newCategoryName.trim();
                  if (!trimmed) return;
                  if (!quickCategories.includes(trimmed)) {
                    setQuickCategories((prev) => [...prev, trimmed]);
                  }
                  setCategory(trimmed);
                  setNewCategoryName('');
                  setShowCategoryPicker(false);
                }}
                disabled={!newCategoryName.trim()}
                style={styles.manageAddButton}
              >
                {t('Add')}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  requiredNote: {
    ...textStyles.helper,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    ...textStyles.sectionTitle,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    ...textStyles.sectionSubtitle,
    marginBottom: spacing.sm,
  },
  disclosureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  disclosureLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  disclosureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  disclosureLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b21a8',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#2563eb',
  },
  checkboxMark: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
  variantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  variantCardActive: {
    backgroundColor: '#e5edff',
    borderColor: '#bfdbfe',
  },
  twoColumn: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  col: {
    flex: 1,
  },
  selectField: {
    marginBottom: spacing.sm,
  },
  selectLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: spacing.sm,
  },
  selectBox: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    fontSize: 16,
    color: '#111827',
  },
  selectPlaceholder: {
    color: '#9ca3af',
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  suggestionChipText: {
    color: '#6b21a8',
    fontWeight: '700',
    fontSize: 13,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  categoryChipText: {
    color: '#5b21b6',
    fontWeight: '700',
    fontSize: 13,
  },
  unitWrapper: {
    position: 'relative',
  },
  unitIcon: {
    position: 'absolute',
    right: spacing.md,
    top: 42,
  },
  barcodeWrapper: {
    position: 'relative',
  },
  barcodeInput: {
    paddingRight: 48,
  },
  barcodeIconButton: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    width: 32,
    height: 32,
    borderRadius: radii.lg,
    backgroundColor: '#e0ecff',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -16 }],
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  scannerCard: {
    width: '92%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  scannerClose: {
    position: 'absolute',
    right: 0,
    top: -2,
  },
  scannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  scannerSubtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  scannerCenter: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  scannerText: {
    fontSize: 14,
    color: '#475569',
  },
  scannerCameraWrapper: {
    height: 260,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginTop: spacing.xs,
  },
  scanModeToggle: {
    alignSelf: 'center',
    marginBottom: spacing.sm,
    zIndex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject as object,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 220,
    height: 140,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: radii.md,
    backgroundColor: 'rgba(37,99,235,0.05)',
    borderStyle: 'solid',
  },
  scannerButton: {
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: '#eef2ff',
  },
  scannerCancel: {
    backgroundColor: '#eef2ff',
  },
  scannerButtonText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 15,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#e5edff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: spacing.md,
  },
  infoBannerText: {
    flex: 1,
    color: '#1d4ed8',
    fontSize: 14,
  },
  singleAction: {
    marginTop: 12,
  },
  singleActionButton: {
    width: '100%',
  },
  manageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  manageCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  manageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  manageSubtitle: {
    fontSize: 14,
    color: '#475569',
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  manageInputContainer: {
    flex: 1,
    marginBottom: 0,
  },
  manageAddButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  manageListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  manageListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  manageListText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
});
