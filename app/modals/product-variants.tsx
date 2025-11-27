import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ScanMode, ScanModeToggle } from '../../components/ui/ScanModeToggle';
import { useLanguage } from '../../contexts/LanguageContext';
import { useData } from '../../contexts/DataContext';
import { db } from '../../lib/database';
import { spacing, radii, textStyles } from '../../theme/tokens';

type DetailField = 'size' | 'design' | 'color' | 'material' | 'barcode';
type VariantFormMode = 'compact' | 'detailed';

interface Variant {
  id: number;
  name: string;
  design?: string;
  size?: string;
  color?: string;
  material?: string;
  customAttributeLabel?: string;
  customAttributeValue?: string;
  price: number;
  stock: number;
  minStock: number;
  barcode?: string;
  costPrice: number;
}

const INITIAL_FORM = {
  name: '',
  design: '',
  size: '',
  color: '',
  material: '',
  customAttributeLabel: '',
  customAttributeValue: '',
  price: '',
  costPrice: '',
  stock: '',
  minStock: '',
  barcode: '',
};
const QUICK_VARIANT_SETTING_KEY = 'inventory.quickVariants';
const MAX_QUICK_VARIANTS = 8;
const QUICK_VARIANT_DETAILS_KEY = 'inventory.quickVariantDetails';
const MAX_DETAIL_CHIPS = 8;
const PRODUCT_VARIANT_BARCODE_TYPES: BarcodeType[] = ['ean13', 'code128', 'upc_a', 'upc_e'];

export default function ProductVariantsModal() {
  const { productId: productIdParam } = useLocalSearchParams<{ productId?: string }>();
  const productId = productIdParam ? Number(productIdParam) : NaN;

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { products, getProductById, updateProduct } = useData();

  const product = useMemo(
    () => (Number.isFinite(productId) ? getProductById(productId) : undefined),
    [productId, products, getProductById]
  );

  const formScrollRef = useRef<ScrollView | null>(null);
  const variantNameInputRef = useRef<TextInput | null>(null);
  const barcodeInputRef = useRef<TextInput | null>(null);
  const [variants, setVariants] = useState<Variant[]>(product?.variants ?? []);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isSavingVariant, setIsSavingVariant] = useState(false);
  const [showQuickVariants, setShowQuickVariants] = useState(true);
  const [quickVariantSuggestions, setQuickVariantSuggestions] = useState<string[]>([]);
  const [isManageQuickVariantVisible, setIsManageQuickVariantVisible] = useState(false);
  const [newQuickVariant, setNewQuickVariant] = useState('');
  const [hasLoadedQuickVariants, setHasLoadedQuickVariants] = useState(false);
  const [variantFormMode, setVariantFormMode] = useState<VariantFormMode>('compact');
  const [detailChips, setDetailChips] = useState<Record<DetailField, string[]>>({
    size: [],
    design: [],
    color: [],
    material: [],
    barcode: [],
  });
  const [detailVisibility, setDetailVisibility] = useState<Record<DetailField, boolean>>({
    size: true,
    design: true,
    color: true,
    material: true,
    barcode: true,
  });
  const [manageDetailField, setManageDetailField] = useState<DetailField | null>(null);
  const [newDetailChip, setNewDetailChip] = useState('');
  const [isBarcodeScannerVisible, setIsBarcodeScannerVisible] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');
  const [canScanBarcode, setCanScanBarcode] = useState(true);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const detailMeta = useMemo(
    () => ({
      size: {
        quickTitle: t('Quick Size Options'),
        manageTitle: t('Manage Quick Size Options'),
      },
      design: {
        quickTitle: t('Quick Design / Model Options'),
        manageTitle: t('Manage Quick Design / Model Options'),
      },
      color: {
        quickTitle: t('Quick Color Options'),
        manageTitle: t('Manage Quick Color Options'),
      },
      barcode: {
        quickTitle: t('Quick Barcode Options'),
        manageTitle: t('Manage Quick Barcode Options'),
      },
      material: {
        quickTitle: t('Quick Material / Brand Options'),
        manageTitle: t('Manage Quick Material / Brand Options'),
      },
    }),
    [t]
  );
  const variantModeOptions: { value: VariantFormMode; title: string }[] = useMemo(
    () => [
      {
        value: 'compact',
        title: t('Quick Entry'),
      },
      {
        value: 'detailed',
        title: t('Detailed Entry'),
      },
    ],
    [t]
  );
  const isCompactMode = variantFormMode === 'compact';

  useEffect(() => {
    setVariants(product?.variants ?? []);
  }, [product?.variants]);

  useEffect(() => {
    const timer = setTimeout(() => {
      variantNameInputRef.current?.focus();
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  const barcodeTypesForMode = useMemo<BarcodeType[]>(() => {
    if (scanMode === 'qr') return ['qr'];
    if (scanMode === 'all') return [...PRODUCT_VARIANT_BARCODE_TYPES, 'qr'];
    return [...PRODUCT_VARIANT_BARCODE_TYPES];
  }, [scanMode]);

  const saveQuickVariants = async (next: string[]) => {
    try {
      await db.setSetting(QUICK_VARIANT_SETTING_KEY, next);
    } catch (error) {
      console.warn('Failed to save quick variants', error);
    }
  };

  useEffect(() => {
    if (hasLoadedQuickVariants) {
      return;
    }

    const loadQuickVariants = async () => {
      try {
        const stored = (await db.getSetting(QUICK_VARIANT_SETTING_KEY)) as string[] | null;
        if (stored && Array.isArray(stored) && stored.length) {
          setQuickVariantSuggestions(stored.slice(0, MAX_QUICK_VARIANTS));
        } else if (product?.variants?.length) {
          const defaults = Array.from(
            new Set(
              product.variants
                .map((variant) => variant.name?.trim())
                .filter((value): value is string => Boolean(value))
            )
          ).slice(0, MAX_QUICK_VARIANTS);
          if (defaults.length) {
            setQuickVariantSuggestions(defaults);
            await db.setSetting(QUICK_VARIANT_SETTING_KEY, defaults);
          }
        }
      } catch (error) {
        console.warn('Failed to load quick variants', error);
      } finally {
        setHasLoadedQuickVariants(true);
      }
    };

    loadQuickVariants();
  }, [product?.variants, hasLoadedQuickVariants]);

  useEffect(() => {
    let isMounted = true;
    const loadDetailChips = async () => {
      try {
        const stored = (await db.getSetting(QUICK_VARIANT_DETAILS_KEY)) as
          | Record<string, string[]>
          | null;
        if (stored && isMounted) {
          setDetailChips({
            size: stored.size ?? [],
            design: stored.design ?? [],
            color: stored.color ?? [],
            material: stored.material ?? [],
            barcode: stored.barcode ?? [],
          });
        }
      } catch (error) {
        console.warn('Failed to load variant detail chips', error);
      }
    };
    loadDetailChips();
    return () => {
      isMounted = false;
    };
  }, []);

  const persistDetailChips = async (next: Record<string, string[]>) => {
    try {
      await db.setSetting(QUICK_VARIANT_DETAILS_KEY, next);
    } catch (error) {
      console.warn('Failed to persist variant detail chips', error);
    }
  };

  const handleOpenBarcodeScanner = async () => {
    setScanMode('barcode');
    setIsBarcodeScannerVisible(true);
    setCanScanBarcode(true);
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission();
      if (!response?.granted) {
        Toast.show({ type: 'info', text1: t('Camera permission required') });
      }
    }
  };

  const handleCloseBarcodeScanner = () => {
    setIsBarcodeScannerVisible(false);
    setCanScanBarcode(true);
  };

  const handleVariantBarcodeDetected = (value: string) => {
    if (!canScanBarcode || !value) {
      return;
    }
    setCanScanBarcode(false);
    console.log('[DEBUG] add variant scan:', value);
    Toast.show({ type: 'info', text1: 'Scanned (add variant)', text2: value });
    const digitsOnly = value.replace(/\D/g, '');
    setForm((prev) => ({ ...prev, barcode: digitsOnly }));
    Toast.show({ type: 'success', text1: t('Barcode scanned'), text2: digitsOnly });
    setIsBarcodeScannerVisible(false);
    setTimeout(() => barcodeInputRef.current?.focus(), 300);
  };

  const handleQuickVariantSelect = (value: string) => {
    setForm((prev) => ({ ...prev, name: value }));
    setErrors((prev) => ({ ...prev, name: null }));
  };

  const handleAddQuickVariant = () => {
    const trimmed = newQuickVariant.trim();
    if (!trimmed) {
      Toast.show({ type: 'info', text1: t('Please enter a name first') });
      return;
    }
    if (quickVariantSuggestions.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      Toast.show({ type: 'info', text1: t('This name is already in the list') });
      return;
    }
    if (quickVariantSuggestions.length >= MAX_QUICK_VARIANTS) {
      Toast.show({ type: 'info', text1: t('Quick list limit reached') });
      return;
    }
    const next = [...quickVariantSuggestions, trimmed];
    setQuickVariantSuggestions(next);
    setNewQuickVariant('');
    saveQuickVariants(next);
  };

  const handleRemoveQuickVariant = (value: string) => {
    Alert.alert(
      t('Remove Quick Variant'),
      t('Are you sure you want to remove this quick variant?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => {
            const next = quickVariantSuggestions.filter((item) => item !== value);
            setQuickVariantSuggestions(next);
            saveQuickVariants(next);
          },
        },
      ]
    );
  };

  const toggleDetailVisibility = (field: DetailField) => {
    setDetailVisibility((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const openManageDetail = (field: DetailField) => {
    setManageDetailField(field);
    setNewDetailChip('');
  };

  const renderDetailChips = (field: keyof typeof detailChips) => {
    const chips = detailChips[field];
    if (!chips.length) {
      return null;
    }
    const currentValue = form[field];
    return (
      <View style={styles.quickChipGrid}>
        {chips.map((chip) => {
          const isActive = chip.toLowerCase() === (currentValue?.trim().toLowerCase() ?? '');
          return (
            <TouchableOpacity
              key={`${field}-${chip}`}
              style={[styles.quickChip, isActive && styles.quickChipActive]}
              onPress={() => handleChange(field, chip)}
            >
              <Ionicons
                name="sparkles-outline"
                size={14}
                color={isActive ? '#ffffff' : '#d946ef'}
              />
              <Text
                style={[
                  styles.quickChipText,
                  isActive && styles.quickChipTextActive,
                ]}
              >
                {chip}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderBarcodeInput = () => (
    <View style={styles.barcodeInputWrapper}>
      <Input
        ref={barcodeInputRef}
        label={t('Barcode (Optional)')}
        value={form.barcode}
        onChangeText={(text) => handleChange('barcode', text)}
        placeholder={t('Enter barcode')}
        style={styles.barcodeInput}
      />
      <TouchableOpacity
        style={styles.barcodeScanButton}
        onPress={handleOpenBarcodeScanner}
        activeOpacity={0.85}
      >
        <Ionicons name="barcode-outline" size={20} color="#2563eb" />
      </TouchableOpacity>
    </View>
  );

  const handleAddDetailChip = () => {
    if (!manageDetailField) {
      return;
    }
    const trimmed = newDetailChip.trim();
    if (!trimmed) {
      Toast.show({ type: 'info', text1: t('Please enter a name first') });
      return;
    }
    if (
      detailChips[manageDetailField].some((chip) => chip.toLowerCase() === trimmed.toLowerCase())
    ) {
      Toast.show({ type: 'info', text1: t('This name is already in the list') });
      return;
    }
    if (detailChips[manageDetailField].length >= MAX_DETAIL_CHIPS) {
      Toast.show({ type: 'info', text1: t('Quick list limit reached') });
      return;
    }
    setDetailChips((prev) => {
      const next = {
        ...prev,
        [manageDetailField]: [...prev[manageDetailField], trimmed],
      };
      persistDetailChips(next);
      return next;
    });
    setNewDetailChip('');
  };

  const handleRemoveDetailChip = (chip: string) => {
    if (!manageDetailField) {
      return;
    }
    Alert.alert(
      t('Remove Quick Option'),
      t('Are you sure you want to remove this quick option?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => {
            setDetailChips((prev) => {
              const next = {
                ...prev,
                [manageDetailField]: prev[manageDetailField].filter((item) => item !== chip),
              };
              persistDetailChips(next);
              return next;
            });
          },
        },
      ]
    );
  };

  const handleChange = (key: keyof typeof INITIAL_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validate = () => {
    const currentErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      currentErrors.name = t('Required field');
    }

    const priceValue = Number.parseFloat(form.price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      currentErrors.price = t('Required field');
    }

    const costValue = Number.parseFloat(form.costPrice);
    if (!Number.isFinite(costValue) || costValue <= 0) {
      currentErrors.costPrice = t('Required field');
    }

    const stockValue = Number.parseFloat(form.stock);
    if (!Number.isFinite(stockValue) || stockValue < 0) {
      currentErrors.stock = t('Required field');
    }

    const minStockValue = Number.parseFloat(form.minStock);
    if (!Number.isFinite(minStockValue) || minStockValue < 0) {
      currentErrors.minStock = t('Required field');
    }

    setErrors(currentErrors);
    return Object.keys(currentErrors).length === 0;
  };

  const handleAddVariant = async () => {
    if (!product || !validate()) {
      return;
    }

    const newVariant: Variant = {
      id: Date.now(),
      name: form.name.trim(),
      design: form.design.trim() || undefined,
      size: form.size.trim() || undefined,
      color: form.color.trim() || undefined,
      material: form.material.trim() || undefined,
      customAttributeLabel: form.customAttributeLabel.trim() || undefined,
      customAttributeValue: form.customAttributeValue.trim() || undefined,
      price: Number.parseFloat(form.price),
      costPrice: Number.parseFloat(form.costPrice),
      stock: Number.parseFloat(form.stock),
      minStock: Number.parseFloat(form.minStock),
      barcode: form.barcode.trim() || undefined,
    };

    const updatedVariants = [...variants, newVariant];

    try {
      setIsSavingVariant(true);
      await updateProduct(product.id, {
        variants: updatedVariants,
        hasVariants: true,
      });
      setVariants(updatedVariants);
      setForm(INITIAL_FORM);
      Toast.show({ type: 'success', text1: t('Variant saved successfully') });
    } catch (error) {
      console.error('Failed to add variant', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsSavingVariant(false);
    }
  };

  const handleDuplicateVariant = (variant: Variant) => {
    setForm({
      name: variant.name,
      design: variant.design ?? '',
      size: variant.size ?? '',
      color: variant.color ?? '',
      material: variant.material ?? '',
      customAttributeLabel: variant.customAttributeLabel ?? '',
      customAttributeValue: variant.customAttributeValue ?? '',
      price: variant.price.toString(),
      costPrice: variant.costPrice.toString(),
      stock: variant.stock.toString(),
      minStock: variant.minStock.toString(),
      barcode: variant.barcode ?? '',
    });
    setErrors({});
    setTimeout(() => {
      formScrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 0);
    Toast.show({
      type: 'info',
      text1: t('Variant details copied'),
      text2: t('Adjust any field and tap Add Variant to save.'),
    });
  };

  const handleRemoveVariant = async (variantId: number) => {
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
            const updatedVariants = variants.filter((variant) => variant.id !== variantId);
            try {
              await updateProduct(product.id, {
                variants: updatedVariants,
                hasVariants: true,
              });
              setVariants(updatedVariants);
              Toast.show({ type: 'success', text1: t('Variant removed successfully') });
            } catch (error) {
              console.error('Failed to remove variant', error);
              Toast.show({ type: 'error', text1: t('Something went wrong') });
            }
          },
        },
      ]
    );
  };

  if (!Number.isFinite(productId) || !product) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.missingContainer}>
          <Text style={styles.missingTitle}>{t('Product not found')}</Text>
          <Button onPress={() => router.back()} style={styles.missingButton}>
            {t('Done')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          ref={formScrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom + 140, 180) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{product.name}</Text>
            <Text style={styles.subtitle}>{product.category}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Add Variant')}</Text>
            <View style={styles.modeToggleContainer}>
              <Text style={styles.modeToggleLabel}>{t('Entry Mode')}</Text>
              <View style={styles.modeOptions}>
                {variantModeOptions.map((option) => {
                  const isActive = option.value === variantFormMode;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.modeOption, isActive && styles.modeOptionActive]}
                      onPress={() => setVariantFormMode(option.value)}
                      activeOpacity={0.9}
                    >
                      <Ionicons
                        name={isActive ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={isActive ? '#7c3aed' : '#94a3b8'}
                      />
                      <Text style={styles.modeOptionTitle}>{option.title}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Input
              ref={variantNameInputRef}
              label={`${t('Variant Name')} *`}
              value={form.name}
              onChangeText={(text) => handleChange('name', text)}
              placeholder={t('Variant Name')}
              error={errors.name}
            />
            <View style={styles.quickHeader}>
              <TouchableOpacity
                style={styles.quickToggle}
                activeOpacity={0.8}
                onPress={() => setShowQuickVariants((prev) => !prev)}
              >
                <Ionicons
                  name={showQuickVariants ? 'chevron-down' : 'chevron-forward'}
                  size={16}
                  color="#d946ef"
                />
                <Text style={styles.quickTitle}>{t('Quick Variant Suggestions')}</Text>
                <Text style={styles.quickToggleText}>
                  {showQuickVariants ? t('Hide') : t('Show')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickManage}
                onPress={() => setIsManageQuickVariantVisible(true)}
              >
                <Ionicons name="settings-outline" size={16} color="#2563eb" />
                <Text style={styles.quickManageText}>{t('Manage')}</Text>
              </TouchableOpacity>
            </View>
            {showQuickVariants && (
              <>
                {quickVariantSuggestions.length > 0 && (
                  <View style={styles.quickChipGrid}>
                    {quickVariantSuggestions.map((item) => {
                      const isActive = item.toLowerCase() === form.name.trim().toLowerCase();
                      return (
                        <TouchableOpacity
                          key={`quick-variant-${item}`}
                          style={[styles.quickChip, isActive && styles.quickChipActive]}
                          onPress={() => handleQuickVariantSelect(item)}
                        >
                          <Ionicons
                            name="pricetag-outline"
                            size={14}
                            color={isActive ? '#ffffff' : '#d946ef'}
                          />
                          <Text
                            style={[
                              styles.quickChipText,
                              isActive && styles.quickChipTextActive,
                            ]}
                          >
                            {item}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <View style={styles.row}>
              <Input
                label={`${t('Selling Price (Rs.)')} *`}
                value={form.price}
                onChangeText={(text) => handleChange('price', text)}
                keyboardType="numeric"
                placeholder="0"
                error={errors.price}
                containerStyle={styles.flexItem}
              />
              <Input
                label={`${t('Cost Price (Rs.)')} *`}
                value={form.costPrice}
                onChangeText={(text) => handleChange('costPrice', text)}
                keyboardType="numeric"
                placeholder="0"
                error={errors.costPrice}
                containerStyle={styles.flexItem}
              />
            </View>

            <View style={styles.row}>
              <Input
                label={`${t('Stock')} *`}
                value={form.stock}
                onChangeText={(text) => handleChange('stock', text)}
                keyboardType="numeric"
                placeholder="0"
                error={errors.stock}
                containerStyle={styles.flexItem}
              />
              <Input
                label={`${t('Min. Stock')} *`}
                value={form.minStock}
                onChangeText={(text) => handleChange('minStock', text)}
                keyboardType="numeric"
                placeholder="0"
                error={errors.minStock}
                containerStyle={styles.flexItem}
              />
            </View>

            {isCompactMode && renderBarcodeInput()}

            {!isCompactMode && (
              <>
                <Input
                  label={t('Size (Optional)')}
                  value={form.size}
                  onChangeText={(text) => handleChange('size', text)}
                  placeholder={t('Size (Optional)')}
                />
                <View style={styles.quickHeader}>
                  <TouchableOpacity
                    style={styles.quickToggle}
                    onPress={() => toggleDetailVisibility('size')}
                  >
                    <Ionicons
                      name={detailVisibility.size ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color="#d946ef"
                    />
                    <Text style={styles.quickTitle}>{detailMeta.size.quickTitle}</Text>
                    <Text style={styles.quickToggleText}>
                      {detailVisibility.size ? t('Hide') : t('Show')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickManage}
                    onPress={() => openManageDetail('size')}
                  >
                    <Ionicons name="settings-outline" size={16} color="#2563eb" />
                    <Text style={styles.quickManageText}>{t('Manage')}</Text>
                  </TouchableOpacity>
                </View>
                {detailVisibility.size && renderDetailChips('size')}

                <Input
                  label={t('Design / Model (Optional)')}
                  value={form.design}
                  onChangeText={(text) => handleChange('design', text)}
                  placeholder={t('Design / Model (Optional)')}
                />
                <View style={styles.quickHeader}>
                  <TouchableOpacity
                    style={styles.quickToggle}
                    onPress={() => toggleDetailVisibility('design')}
                  >
                    <Ionicons
                      name={detailVisibility.design ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color="#d946ef"
                    />
                    <Text style={styles.quickTitle}>{detailMeta.design.quickTitle}</Text>
                    <Text style={styles.quickToggleText}>
                      {detailVisibility.design ? t('Hide') : t('Show')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickManage}
                    onPress={() => openManageDetail('design')}
                  >
                    <Ionicons name="settings-outline" size={16} color="#2563eb" />
                    <Text style={styles.quickManageText}>{t('Manage')}</Text>
                  </TouchableOpacity>
                </View>
                {detailVisibility.design && renderDetailChips('design')}

                <Input
                  label={t('Color (Optional)')}
                  value={form.color}
                  onChangeText={(text) => handleChange('color', text)}
                  placeholder={t('Color (Optional)')}
                />
                <View style={styles.quickHeader}>
                  <TouchableOpacity
                    style={styles.quickToggle}
                    onPress={() => toggleDetailVisibility('color')}
                  >
                    <Ionicons
                      name={detailVisibility.color ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color="#d946ef"
                    />
                    <Text style={styles.quickTitle}>{detailMeta.color.quickTitle}</Text>
                    <Text style={styles.quickToggleText}>
                      {detailVisibility.color ? t('Hide') : t('Show')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickManage}
                    onPress={() => openManageDetail('color')}
                  >
                    <Ionicons name="settings-outline" size={16} color="#2563eb" />
                    <Text style={styles.quickManageText}>{t('Manage')}</Text>
                  </TouchableOpacity>
                </View>
                {detailVisibility.color && renderDetailChips('color')}
              </>
            )}

            {isCompactMode ? (
              <TouchableOpacity
                style={styles.compactInfoCard}
                activeOpacity={0.85}
                onPress={() => setVariantFormMode('detailed')}
              >
                <Ionicons name="information-circle-outline" size={20} color="#7c3aed" />
                <Text style={styles.compactInfoTitle}>{t('Optional fields hidden')}</Text>
              </TouchableOpacity>
            ) : (
              <>
                {renderBarcodeInput()}
                <View style={styles.quickHeader}>
                  <TouchableOpacity
                    style={styles.quickToggle}
                    onPress={() => toggleDetailVisibility('barcode')}
                  >
                    <Ionicons
                      name={detailVisibility.barcode ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color="#d946ef"
                    />
                    <Text style={styles.quickTitle}>{detailMeta.barcode.quickTitle}</Text>
                    <Text style={styles.quickToggleText}>
                      {detailVisibility.barcode ? t('Hide') : t('Show')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickManage}
                    onPress={() => openManageDetail('barcode')}
                  >
                    <Ionicons name="settings-outline" size={16} color="#2563eb" />
                    <Text style={styles.quickManageText}>{t('Manage')}</Text>
                  </TouchableOpacity>
                </View>
                {detailVisibility.barcode && renderDetailChips('barcode')}

                <Input
                  label={t('Material / Brand (Optional)')}
                  value={form.material}
                  onChangeText={(text) => handleChange('material', text)}
                  placeholder={t('Material / Brand (Optional)')}
                />
                <View style={styles.quickHeader}>
                  <TouchableOpacity
                    style={styles.quickToggle}
                    onPress={() => toggleDetailVisibility('material')}
                  >
                    <Ionicons
                      name={detailVisibility.material ? 'chevron-down' : 'chevron-forward'}
                      size={16}
                      color="#d946ef"
                    />
                    <Text style={styles.quickTitle}>{detailMeta.material.quickTitle}</Text>
                    <Text style={styles.quickToggleText}>
                      {detailVisibility.material ? t('Hide') : t('Show')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.quickManage}
                    onPress={() => openManageDetail('material')}
                  >
                    <Ionicons name="settings-outline" size={16} color="#2563eb" />
                    <Text style={styles.quickManageText}>{t('Manage')}</Text>
                  </TouchableOpacity>
                </View>
                {detailVisibility.material && renderDetailChips('material')}

                <Input
                  label={t('Custom Field Label (Optional)')}
                  value={form.customAttributeLabel}
                  onChangeText={(text) => handleChange('customAttributeLabel', text)}
                  placeholder={t('e.g., Shade')}
                />
                <Input
                  label={t('Custom Field Value (Optional)')}
                  value={form.customAttributeValue}
                  onChangeText={(text) => handleChange('customAttributeValue', text)}
                  placeholder={t('e.g., Matte Finish')}
                />
              </>
            )}

            <Button
              onPress={handleAddVariant}
              loading={isSavingVariant}
              disabled={isSavingVariant}
            >
              {t('Add Variant')}
            </Button>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Variants')}</Text>

            {variants.length === 0 ? (
              <Text style={styles.emptyState}>{t('No variants yet')}</Text>
            ) : (
              variants.map((variant) => (
                <View key={variant.id} style={styles.variantCard}>
                  <View style={styles.variantInfo}>
                    <Text style={styles.variantName}>{variant.name}</Text>
                    <Text style={styles.variantMeta}>
                      {t('Price')}: Rs. {variant.price.toFixed(0)} • {t('Stock')}:{' '}
                      {variant.stock.toString()}
                    </Text>
                    <Text style={styles.variantMeta}>
                      {t('Cost Price (Rs.)')}: Rs. {variant.costPrice.toFixed(0)}
                    </Text>
                    {variant.barcode && (
                      <Text style={styles.variantMeta}>
                        {t('Barcode (Optional)')}: {variant.barcode}
                      </Text>
                    )}
                    {variant.customAttributeLabel && variant.customAttributeValue && (
                      <Text style={styles.variantMeta}>
                        {`${variant.customAttributeLabel}: ${variant.customAttributeValue}`}
                      </Text>
                    )}
                  </View>
                  <View style={styles.variantActions}>
                    <TouchableOpacity
                      style={styles.variantDuplicate}
                      onPress={() => handleDuplicateVariant(variant)}
                    >
                      <Ionicons name="copy-outline" size={16} color="#2563eb" />
                      <Text style={styles.variantDuplicateText}>{t('Duplicate')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.variantDelete}
                      onPress={() => handleRemoveVariant(variant.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
        <View
          style={[
            styles.actions,
            {
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom + 72, 96),
              backgroundColor: '#ffffff',
            },
          ]}
        >
          <Button variant="outline" onPress={() => router.back()} style={styles.flexButton}>
            {t('Done')}
          </Button>
        </View>
        <Modal
          transparent
          visible={isManageQuickVariantVisible}
          animationType="slide"
          onRequestClose={() => setIsManageQuickVariantVisible(false)}
        >
          <View style={styles.manageOverlay}>
            <View style={styles.manageCard}>
              <View style={styles.manageHeader}>
                <Text style={styles.manageTitle}>{t('Manage Quick Variants')}</Text>
                <TouchableOpacity onPress={() => setIsManageQuickVariantVisible(false)}>
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
              <Text style={styles.manageSubtitle}>
                {t('Add the variant names you use most often for one-tap autofill.')}
              </Text>
              <View style={styles.manageAddRow}>
                <Input
                  value={newQuickVariant}
                  onChangeText={setNewQuickVariant}
                  placeholder={t('Variant Name')}
                  containerStyle={styles.manageInputContainer}
                />
                <Button
                  style={styles.manageAddButton}
                  onPress={handleAddQuickVariant}
                  disabled={!newQuickVariant.trim()}
                >
                  {t('Add')}
                </Button>
              </View>
              {quickVariantSuggestions.length > 0 && (
                <ScrollView style={styles.manageList}>
                  {quickVariantSuggestions.map((item) => (
                    <View key={`manage-variant-${item}`} style={styles.manageItem}>
                      <View style={styles.manageItemLeft}>
                        <Ionicons name="pricetag-outline" size={16} color="#d946ef" />
                        <Text style={styles.manageItemText}>{item}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveQuickVariant(item)}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
        <Modal
          transparent
          visible={manageDetailField !== null}
          animationType="slide"
          onRequestClose={() => setManageDetailField(null)}
        >
          {manageDetailField && (
            <View style={styles.manageOverlay}>
              <View style={styles.manageCard}>
                <View style={styles.manageHeader}>
                  <Text style={styles.manageTitle}>
                    {detailMeta[manageDetailField].manageTitle}
                  </Text>
                  <TouchableOpacity onPress={() => setManageDetailField(null)}>
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.manageSubtitle}>
                  {t('Add the values you use most often for one-tap autofill.')}
                </Text>
                <View style={styles.manageAddRow}>
                  <Input
                    value={newDetailChip}
                    onChangeText={setNewDetailChip}
                    placeholder={t('New option value')}
                    containerStyle={styles.manageInputContainer}
                  />
                  <Button
                    style={styles.manageAddButton}
                    onPress={handleAddDetailChip}
                    disabled={!newDetailChip.trim()}
                  >
                    {t('Add')}
                  </Button>
                </View>
                {detailChips[manageDetailField].length > 0 && (
                  <ScrollView style={styles.manageList}>
                    {detailChips[manageDetailField].map((item) => (
                      <View key={`detail-${manageDetailField}-${item}`} style={styles.manageItem}>
                        <View style={styles.manageItemLeft}>
                          <Ionicons name="sparkles-outline" size={16} color="#d946ef" />
                          <Text style={styles.manageItemText}>{item}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleRemoveDetailChip(item)}>
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>
          )}
        </Modal>
        <Modal
          transparent
          visible={isBarcodeScannerVisible}
          animationType="fade"
          onRequestClose={handleCloseBarcodeScanner}
        >
          <View style={styles.barcodeScannerOverlay}>
            <View style={styles.barcodeScannerCard}>
              <View style={styles.barcodeScannerHeader}>
                <Text style={styles.barcodeScannerTitle}>{t('Scan Variant Barcode')}</Text>
                <TouchableOpacity
                  onPress={handleCloseBarcodeScanner}
                  hitSlop={12}
                  style={styles.barcodeScannerClose}
                >
                  <Ionicons name="close" size={22} color="#475569" />
                </TouchableOpacity>
              </View>
              <Text style={styles.barcodeScannerSubtitle}>
                {t('Align the barcode inside the frame')}
              </Text>
              <View style={styles.barcodeScannerCameraWrapper}>
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
                {cameraPermission?.granted ? (
                  <CameraView
                    style={styles.barcodeScannerCamera}
                    facing="back"
                    barcodeScannerSettings={{
                      barcodeTypes: barcodeTypesForMode,
                    }}
                    onBarcodeScanned={({ data }) => {
                      if (data) {
                        handleVariantBarcodeDetected(data);
                      }
                    }}
                  />
                ) : (
                  <View style={styles.barcodeScannerPermission}>
                    <Ionicons name="camera-outline" size={48} color="#94a3b8" />
                    <Text style={styles.barcodeScannerPermissionTitle}>
                      {t('Camera access needed')}
                    </Text>
                    <Text style={styles.barcodeScannerPermissionText}>
                      {t('Allow access to scan the barcode automatically.')}
                    </Text>
                    <Button
                      style={styles.barcodeScannerPermissionButton}
                      onPress={requestCameraPermission}
                    >
                      {t('Allow Camera')}
                    </Button>
                  </View>
                )}
                <View style={styles.barcodeScannerFrame} />
              </View>
              <TouchableOpacity
                style={styles.barcodeScannerCancel}
                onPress={handleCloseBarcodeScanner}
                activeOpacity={0.9}
              >
                <Text style={styles.barcodeScannerCancelText}>{t('Cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: 4,
  },
  title: {
    ...textStyles.screenTitle,
  },
  subtitle: {
    ...textStyles.sectionSubtitle,
  },
  modeToggleContainer: {
    marginTop: 8,
    marginBottom: 12,
    gap: 8,
  },
  modeToggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4c1d95',
  },
  modeOptions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
  },
  modeOptionActive: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  modeOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  quickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  quickToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4c1d95',
  },
  quickToggleText: {
    fontSize: 13,
    color: '#9333ea',
  },
  quickManage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickManageText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  compactInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
  },
  compactInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4c1d95',
  },
  quickChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f0abfc',
    backgroundColor: '#fdf4ff',
  },
  quickChipActive: {
    backgroundColor: '#d946ef',
    borderColor: '#d946ef',
  },
  quickChipText: {
    fontSize: 13,
    color: '#a21caf',
    fontWeight: '600',
  },
  quickChipTextActive: {
    color: '#ffffff',
  },
  section: {
    borderRadius: radii.lg,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    ...textStyles.sectionTitle,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flexItem: {
    flex: 1,
    marginBottom: 0,
  },
  emptyState: {
    fontSize: 14,
    color: '#6b7280',
  },
  variantCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#eef2ff',
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  variantInfo: {
    flex: 1,
    gap: 4,
  },
  variantName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e3a8a',
  },
  variantMeta: {
    fontSize: 13,
    color: '#1f2937',
  },
  variantActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  variantDuplicate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
  },
  variantDuplicateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  variantDelete: {
    padding: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  flexButton: {
    flex: 1,
  },
  manageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  manageCard: {
    backgroundColor: '#ffffff',
    width: '100%',
    maxWidth: 420,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.lg,
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
    alignItems: 'center',
    gap: spacing.md,
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
    gap: 10,
  },
  manageItemText: {
    fontSize: 14,
    color: '#1f2937',
  },
  barcodeInputWrapper: {
    marginBottom: 16,
  },
  barcodeInput: {
    paddingRight: 50,
  },
  barcodeScanButton: {
    position: 'absolute',
    right: 16,
    top: 36,
    padding: 8,
    borderRadius: 18,
    backgroundColor: '#eef2ff',
  },
  barcodeScannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  barcodeScannerCard: {
    width: '92%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  barcodeScannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  barcodeScannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  barcodeScannerSubtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 4,
  },
  barcodeScannerClose: {
    position: 'absolute',
    right: 0,
    top: -2,
  },
  scanModeToggle: {
    alignSelf: 'flex-start',
  },
  barcodeScannerCameraWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
    backgroundColor: '#000',
    position: 'relative',
  },
  barcodeScannerCamera: {
    height: 260,
    width: '100%',
  },
  barcodeScannerFrame: {
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
  barcodeScannerPermission: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  barcodeScannerPermissionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  barcodeScannerPermissionText: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
  },
  barcodeScannerPermissionButton: {
    marginTop: 8,
  },
  barcodeScannerCancel: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#eef2ff',
  },
  barcodeScannerCancelText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 15,
  },
  missingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: spacing.md,
  },
  missingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  missingButton: {
    width: '60%',
  },
});
