import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';

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
  const [barcode, setBarcode] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (variant) {
      setName(variant.name);
      setDesign(variant.design ?? '');
      setSize(variant.size ?? '');
      setColor(variant.color ?? '');
      setMaterial(variant.material ?? '');
      setCustomLabel(variant.customAttributeLabel ?? '');
      setCustomValue(variant.customAttributeValue ?? '');
      setPrice(variant.price != null ? variant.price.toString() : '');
      setCostPrice(variant.costPrice != null ? variant.costPrice.toString() : '');
      setStock(variant.stock != null ? variant.stock.toString() : '');
      setMinStock(variant.minStock != null ? variant.minStock.toString() : '');
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

const validate = () => {
    // Allow saving without strict required fields; clear errors
    setErrors({});
    return true;
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
            price: Number.parseFloat(price),
            costPrice: Number.parseFloat(costPrice),
            stock: Number.parseFloat(stock),
            minStock: Number.parseFloat(minStock),
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

        <Input
          label={t('Barcode (Optional)')}
          value={barcode}
          onChangeText={setBarcode}
          placeholder={t('Enter barcode')}
        />
          </ScrollView>
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
});
