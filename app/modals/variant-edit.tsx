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
  Vibration,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ScanModeToggle, type ScanMode } from '../../components/ui/ScanModeToggle';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';

const VARIANT_BARCODE_TYPES: BarcodeType[] = ['ean13', 'code128', 'upc_a', 'upc_e'];

export default function VariantEditModal() {
  const insets = useSafeAreaInsets();
  const { productId, variantId } = useLocalSearchParams<{
    productId?: string;
    variantId?: string;
  }>();
  const router = useRouter();
  const { t } = useLanguage();
  const { getProductById, updateProduct } = useData();

  const product = useMemo(() => {
    const pid = productId ? Number(productId) : NaN;
    return Number.isFinite(pid) ? getProductById(pid) : undefined;
  }, [productId, getProductById]);

  const variant = useMemo(() => {
    if (!product || !variantId || !product.variants) {
      return undefined;
    }
    const vid = Number(variantId);
    return product.variants.find((item) => item.id === vid);
  }, [product, variantId]);

  const [name, setName] = useState('');
  const [design, setDesign] = useState('');
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [material, setMaterial] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('');
  const [unit, setUnit] = useState('');
  const [barcode, setBarcode] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [canScanBarcode, setCanScanBarcode] = useState(true);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanMode, setScanMode] = useState<ScanMode>('barcode');

  const barcodeTypes = useMemo<BarcodeType[]>(() => {
    if (scanMode === 'qr') {
      return ['qr'];
    }
    if (scanMode === 'all') {
      return [...VARIANT_BARCODE_TYPES, 'qr'];
    }
    return [...VARIANT_BARCODE_TYPES];
  }, [scanMode]);

  useEffect(() => {
    if (variant) {
      setName(variant.name);
      setDesign(variant.design ?? '');
      setSize(variant.size ?? '');
      setColor(variant.color ?? '');
      setMaterial(variant.material ?? '');
      setCustomLabel(variant.customAttributeLabel ?? '');
      setCustomValue(variant.customAttributeValue ?? '');
      setPrice(variant.price != null ? (variant.price === 0 ? '' : variant.price.toString()) : '');
      setCostPrice(
        variant.costPrice != null ? (variant.costPrice === 0 ? '' : variant.costPrice.toString()) : ''
      );
      setStock(variant.stock != null ? (variant.stock === 0 ? '' : variant.stock.toString()) : '');
      setMinStock(
        variant.minStock != null ? (variant.minStock === 0 ? '' : variant.minStock.toString()) : ''
      );
      setUnit(variant.unit ?? '');
      setBarcode(variant.barcode ?? '');
    }
  }, [variant]);

  if (!product || !variant) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.missingState}>
          <Text style={styles.missingTitle}>{t('Variant not found')}</Text>
          <Button onPress={() => router.back()} style={styles.missingButton}>
            {t('Done')}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const handleOpenScanner = async () => {
    setScanMode('barcode');
    setCanScanBarcode(true);
    setIsScannerVisible(true);
    if (!cameraPermission?.granted) {
      const response = await requestCameraPermission();
      if (!response?.granted) {
        Toast.show({ type: 'info', text1: t('Camera permission required') });
      }
    }
  };

  const handleCloseScanner = () => {
    setIsScannerVisible(false);
    setCanScanBarcode(true);
  };

  const handleBarcodeDetected = (value: string) => {
    if (!value || !canScanBarcode) {
      return;
    }
    setCanScanBarcode(false);
    Vibration.vibrate(50);
    setBarcode(value.trim());
    Toast.show({ type: 'success', text1: t('Barcode captured'), text2: value.trim() });
    setIsScannerVisible(false);
    setTimeout(() => setCanScanBarcode(true), 1200);
  };

  const validate = () => {
    // Allow saving without strict required fields; clear errors
    setErrors({});
    return true;
  };

  const parseNumberOrZero = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const handleSave = async () => {
    if (!product || !variant) {
      return;
    }

    if (!validate()) {
      return;
    }

    try {
      setIsSaving(true);

      const updatedVariants = (product.variants ?? []).map((item) => {
        if (item.id === variant.id) {
          return {
            ...item,
            name: name.trim(),
            design: design.trim() || undefined,
            size: size.trim() || undefined,
            color: color.trim() || undefined,
            material: material.trim() || undefined,
            customAttributeLabel: customLabel.trim() || undefined,
            customAttributeValue: customValue.trim() || undefined,
            price: parseNumberOrZero(price),
            costPrice: parseNumberOrZero(costPrice),
            stock: parseNumberOrZero(stock),
            minStock: parseNumberOrZero(minStock),
            unit: unit.trim() || undefined,
            barcode: barcode.trim() || undefined,
          };
        }
        return item;
      });

      await updateProduct(product.id, { variants: updatedVariants });
      Toast.show({ type: 'success', text1: t('Variant updated successfully') });
      router.back();
    } catch (error) {
      console.error('Failed to update variant', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <View style={styles.flex}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Platform.select({ ios: 24, default: 16 }) },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t('Edit Variant')}</Text>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>{t('Product')}:</Text>
              <Text style={styles.infoValue}>{product.name}</Text>
            </View>

        <Input
          label={t('Variant Name')}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setErrors((prev) => ({ ...prev, name: null }));
          }}
          placeholder={t('Variant Name')}
          error={errors.name ?? undefined}
        />

        <View style={styles.row}>
          <Input
            label={t('Selling Price (Rs.)')}
            value={price}
          onChangeText={(text) => {
            setPrice(text);
            setErrors((prev) => ({ ...prev, price: null }));
          }}
          keyboardType="numeric"
          placeholder="0"
          error={errors.price ?? undefined}
          containerStyle={styles.flexItem}
        />
        <Input
          label={t('Cost Price (Rs.)')}
            value={costPrice}
          onChangeText={(text) => {
            setCostPrice(text);
            setErrors((prev) => ({ ...prev, costPrice: null }));
          }}
          keyboardType="numeric"
          placeholder="0"
          error={errors.costPrice ?? undefined}
          containerStyle={styles.flexItem}
        />
      </View>

        <View style={styles.row}>
          <Input
            label={t('Stock')}
            value={stock}
          onChangeText={(text) => {
            setStock(text);
            setErrors((prev) => ({ ...prev, stock: null }));
          }}
          keyboardType="numeric"
          placeholder="0"
          error={errors.stock ?? undefined}
          containerStyle={styles.flexItem}
        />
        <Input
          label={t('Min. Stock')}
            value={minStock}
          onChangeText={(text) => {
            setMinStock(text);
            setErrors((prev) => ({ ...prev, minStock: null }));
          }}
          keyboardType="numeric"
          placeholder="0"
          error={errors.minStock ?? undefined}
          containerStyle={styles.flexItem}
        />
      </View>

        <Input
          label={t('Design / Model (Optional)')}
          value={design}
          onChangeText={setDesign}
          placeholder={t('Design / Model (Optional)')}
        />

        <Input label={t('Size')} value={size} onChangeText={setSize} />

        <View style={styles.row}>
          <Input
            label={t('Color')}
            value={color}
            onChangeText={setColor}
            containerStyle={styles.flexItem}
          />
          <Input
            label={t('Material / Brand (Optional)')}
            value={material}
            onChangeText={setMaterial}
            containerStyle={styles.flexItem}
            placeholder={t('Material / Brand (Optional)')}
          />
        </View>

        <View style={styles.row}>
          <Input
            label={t('Custom Field Label (Optional)')}
            value={customLabel}
            onChangeText={setCustomLabel}
            containerStyle={styles.flexItem}
            placeholder={t('e.g., Shade')}
          />
          <Input
            label={t('Custom Field Value (Optional)')}
            value={customValue}
            onChangeText={setCustomValue}
            containerStyle={styles.flexItem}
            placeholder={t('e.g., Matte Finish')}
          />
        </View>

        <View style={styles.barcodeWrapper}>
          <Input
            label={t('Barcode (Optional)')}
            value={barcode}
            onChangeText={setBarcode}
            placeholder={t('Enter barcode')}
            style={styles.barcodeInput}
          />
          <TouchableOpacity
            style={styles.barcodeScanButton}
            activeOpacity={0.85}
            onPress={handleOpenScanner}
          >
            <Ionicons name="barcode-outline" size={20} color="#2563eb" />
          </TouchableOpacity>
        </View>

        <Input
          label={t('Unit (Optional)')}
          value={unit}
          onChangeText={setUnit}
          placeholder={t('Unit')}
        />
          </ScrollView>
          <Modal
            transparent
            visible={isScannerVisible}
            animationType="fade"
            onRequestClose={handleCloseScanner}
          >
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerCard}>
                <View style={styles.scannerHeader}>
                  <Text style={styles.scannerTitle}>{t('Scan Barcode')}</Text>
                  <TouchableOpacity
                    onPress={handleCloseScanner}
                    hitSlop={12}
                    style={styles.scannerClose}
                  >
                    <Ionicons name="close" size={22} color="#475569" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.scannerSubtitle}>
                  {t('Align the barcode inside the frame')}
                </Text>
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
                  {cameraPermission?.granted ? (
                    <CameraView
                      style={styles.scannerCamera}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes }}
                      onBarcodeScanned={({ data }) => {
                        if (data) {
                          handleBarcodeDetected(data);
                        }
                      }}
                    />
                  ) : (
                    <View style={styles.scannerPermission}>
                      <Ionicons name="camera-outline" size={48} color="#94a3b8" />
                      <Text style={styles.scannerPermissionTitle}>
                        {t('Camera access needed')}
                      </Text>
                      <Text style={styles.scannerPermissionText}>
                        {t('Allow access to scan the barcode automatically.')}
                      </Text>
                      <Button
                        style={styles.scannerPermissionButton}
                        onPress={requestCameraPermission}
                      >
                        {t('Allow Camera')}
                      </Button>
                    </View>
                  )}
                  <View style={styles.scannerFrame} />
                </View>
                <TouchableOpacity
                  style={styles.scannerCancel}
                  onPress={handleCloseScanner}
                  activeOpacity={0.9}
                >
                  <Text style={styles.scannerCancelText}>{t('Cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <Button
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
              style={styles.primaryAction}
            >
              {t('Update Variant')}
            </Button>
          </View>
        </View>
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
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  titleRow: {
    paddingBottom: 4,
  },
  infoCard: {
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: '#4c1d95',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flexItem: {
    flex: 1,
    marginBottom: 0,
  },
  primaryAction: {
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  footer: {
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  missingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  missingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  missingButton: {
    width: '60%',
  },
  barcodeWrapper: {
    position: 'relative',
  },
  barcodeInput: {
    paddingRight: 48,
  },
  barcodeScanButton: {
    position: 'absolute',
    right: 12,
    top: '50%',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e0ecff',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -17 }],
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  scannerCard: {
    width: '92%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
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
  },
  scannerClose: {
    position: 'absolute',
    right: 0,
    top: -2,
  },
  scannerCameraWrapper: {
    height: 260,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    marginTop: 8,
    marginBottom: 8,
  },
  scannerCamera: {
    ...StyleSheet.absoluteFillObject as object,
  },
  scannerFrame: {
    position: 'absolute',
    alignSelf: 'center',
    width: 220,
    height: 140,
    borderWidth: 2,
    borderColor: '#2563eb',
    borderRadius: 12,
    backgroundColor: 'rgba(37,99,235,0.06)',
    top: '50%',
    marginTop: -70,
  },
  scannerPermission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
    backgroundColor: '#f8fafc',
  },
  scannerPermissionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  scannerPermissionText: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
  },
  scannerPermissionButton: {
    marginTop: 8,
    alignSelf: 'center',
  },
  scannerCancel: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
  },
  scannerCancelText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 15,
  },
  scanModeToggle: {
    alignSelf: 'center',
    marginBottom: 8,
    zIndex: 1,
  },
});
