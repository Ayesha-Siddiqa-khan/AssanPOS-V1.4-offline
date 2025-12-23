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
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useData } from '../../contexts/DataContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export default function VendorAccountModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendorId?: string }>();
  const vendorId = params.vendorId ? Number(params.vendorId) : null;
  const isEditing = Number.isFinite(vendorId);

  const { t } = useLanguage();
  const { vendors, addVendor, updateVendor } = useData();

  const vendor = useMemo(
    () => vendors.find((v) => v.id === vendorId),
    [vendors, vendorId]
  );

  const [name, setName] = useState(vendor?.name ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [email, setEmail] = useState(vendor?.email ?? '');
  const [company, setCompany] = useState(vendor?.company ?? '');
  const [address, setAddress] = useState(vendor?.address ?? '');
  const [note, setNote] = useState(vendor?.note ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(vendor?.imageUri ?? null);

  useEffect(() => {
    if (vendor) {
      setName(vendor.name);
      setPhone(vendor.phone);
      setEmail(vendor.email ?? '');
      setCompany(vendor.company ?? '');
      setAddress(vendor.address ?? '');
      setNote(vendor.note ?? '');
      setImageUri(vendor.imageUri ?? null);
    } else {
      setImageUri(null);
    }
  }, [vendor]);

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

  const validate = () => {
    const currentErrors: typeof errors = {};
    if (!name.trim()) {
      currentErrors.name = t('Required field');
    }
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      currentErrors.phone = t('Required field');
    } else if (!/^\d{11}$/.test(trimmedPhone)) {
      currentErrors.phone = t('Invalid phone number');
    }
    setErrors(currentErrors);
    return Object.keys(currentErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      company: company.trim() || undefined,
      address: address.trim() || undefined,
      note: note.trim() || undefined,
      totalPurchases: vendor?.totalPurchases ?? 0,
      lastPurchase: vendor?.lastPurchase,
      payable: vendor?.payable ?? 0,
      imageUri: imageUri || undefined,
    };

    try {
      setIsSaving(true);
      if (isEditing && vendor) {
        await updateVendor(vendor.id, payload);
      } else {
        await addVendor({
          ...payload,
          totalPurchases: 0,
          lastPurchase: undefined,
          payable: 0,
        });
      }
      Toast.show({ type: 'success', text1: t('Vendor saved successfully') });
      router.back();
    } catch (error) {
      console.error('Failed to save vendor', error);
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 120}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {isEditing ? t('Edit Vendor') : t('Add Vendor')}
          </Text>

          {/* Vendor Image Section */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 8 }} />
            ) : (
              <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#e5e7eb', marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
                {/* You can use an icon here if you want */}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button style={{ flex: 1 }} onPress={pickImage}>{t('Pick Image')}</Button>
              <Button style={{ flex: 1 }} onPress={takePhoto}>{t('Take Photo')}</Button>
            </View>
          </View>

          <Input
            label={t('Name')}
            value={name}
            onChangeText={setName}
            error={errors.name}
          />

          <Input
            label={t('Phone Number')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            error={errors.phone}
          />

          <Input
            label={t('Email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />

          <Input
            label={t('Company')}
            value={company}
            onChangeText={setCompany}
          />

          <Input
            label={t('Address')}
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={3}
            style={styles.multiline}
          />

          <Input
            label={t('Note')}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            style={styles.multiline}
          />

          <View style={styles.actions}>
            <Button
              variant="outline"
              onPress={() => router.back()}
              style={styles.actionButton}
            >
              {t('Cancel')}
            </Button>
            <Button
              onPress={handleSave}
              loading={isSaving}
              disabled={isSaving}
              style={styles.actionButton}
            >
              {isEditing ? t('Save Changes') : t('Add Vendor')}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    padding: 16,
    paddingBottom: 120,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
});
