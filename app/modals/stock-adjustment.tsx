import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';

type AdjustmentType = 'add' | 'remove';

export default function StockAdjustmentModal() {
  const router = useRouter();
  const { productId, variantId } = useLocalSearchParams<{
    productId?: string;
    variantId?: string;
  }>();
  const { t } = useLanguage();
  const { getProductById, updateProduct } = useData();

  const product = useMemo(() => {
    const pid = productId ? Number(productId) : NaN;
    return Number.isFinite(pid) ? getProductById(pid) : undefined;
  }, [getProductById, productId]);

  const variant = useMemo(() => {
    if (!product || !product.variants || !variantId) {
      return undefined;
    }
    const vid = Number(variantId);
    return product.variants.find((item) => item.id === vid);
  }, [product, variantId]);

  const [type, setType] = useState<AdjustmentType>('add');
  const [quantity, setQuantity] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const currentStock = product?.hasVariants ? variant?.stock ?? 0 : product?.stock ?? 0;
  const productLabel = useMemo(() => {
    if (!product) {
      return '';
    }
    if (product.hasVariants && variant) {
      return `${product.name} - ${variant.name}`;
    }
    return product.name;
  }, [product, variant]);

  const handleSave = async () => {
    if (!product) {
      router.back();
      return;
    }

    const parsed = Number.parseFloat(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Toast.show({ type: 'error', text1: t('Enter a valid quantity') });
      return;
    }

    try {
      setIsSaving(true);
      const delta = type === 'add' ? parsed : -parsed;

      if (product.hasVariants && variant) {
        const updatedVariants = (product.variants ?? []).map((item) => {
          if (item.id === variant.id) {
            const newStock = Math.max(0, (item.stock ?? 0) + delta);
            return { ...item, stock: newStock };
          }
          return item;
        });

        await updateProduct(product.id, { variants: updatedVariants });
      } else {
        const newStock = Math.max(0, (product.stock ?? 0) + delta);
        await updateProduct(product.id, { stock: newStock });
      }

      Toast.show({
        type: 'success',
        text1:
          type === 'add'
            ? t('Stock added successfully')
            : t('Stock removed successfully'),
      });
      setQuantity('');
    } catch (error) {
      console.error('Failed to adjust stock', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('Adjust Stock')}</Text>

        <View style={styles.infoCard}>
          <Text style={styles.label}>{t('Product')}</Text>
          <Text style={styles.value}>{productLabel || t('Unknown')}</Text>
          <Text style={[styles.label, styles.labelSpacing]}>{t('Current stock')}</Text>
          <Text style={styles.value}>{currentStock}</Text>
        </View>

        <Text style={styles.label}>{t('Adjustment Type')}</Text>
        <View style={styles.typeToggle}>
          <Button
            variant={type === 'add' ? 'secondary' : 'outline'}
            onPress={() => setType('add')}
            style={[
              styles.typeButton,
              type === 'add' ? styles.typeButtonActive : styles.typeButtonInactive,
            ]}
            textStyle={[
              styles.typeButtonText,
              type === 'add' ? styles.typeButtonTextActive : undefined,
            ]}
          >
            {t('Add Stock')}
          </Button>
          <Button
            variant={type === 'remove' ? 'secondary' : 'outline'}
            onPress={() => setType('remove')}
            style={[
              styles.typeButton,
              type === 'remove' ? styles.typeButtonActive : styles.typeButtonInactive,
            ]}
            textStyle={[
              styles.typeButtonText,
              type === 'remove' ? styles.typeButtonTextActive : undefined,
            ]}
          >
            {t('Remove Stock')}
          </Button>
        </View>

        <Input
          label={t('Quantity')}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="numeric"
          placeholder={t('Enter quantity')}
        />

        <Button
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          style={styles.primaryAction}
        >
          {type === 'add' ? t('Add Stock') : t('Remove Stock')}
        </Button>
      </ScrollView>
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
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  labelSpacing: {
    marginTop: 8,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  typeToggle: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: Platform.select({ ios: 12, default: 10 }),
  },
  typeButtonActive: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  typeButtonInactive: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  typeButtonText: {
    fontSize: 14,
  },
  typeButtonTextActive: {
    color: '#166534',
  },
  primaryAction: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
});
