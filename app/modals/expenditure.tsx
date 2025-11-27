import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  Alert,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../contexts/LanguageContext';
import { useData } from '../../contexts/DataContext';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import {
  formatDateForDisplay,
  formatDateForStorage,
} from '../../lib/date';
import { db } from '../../lib/database';

const DEFAULT_EXPENDITURE_CATEGORIES = [
  'Rent',
  'Utilities (Electricity/Water/Gas)',
  'Salaries/Wages',
  'Transportation',
  'Maintenance/Repairs',
  'Shop Supplies',
  'Marketing/Advertising',
  'Miscellaneous',
];

const formatCurrency = (value: number) => `Rs. ${Number(value || 0).toLocaleString()}`;

export default function ExpenditureModal() {
  const router = useRouter();
  const { t } = useLanguage();
  const { addExpenditure } = useData();

  const [categories, setCategories] = useState<string[]>(DEFAULT_EXPENDITURE_CATEGORIES);
  const [category, setCategory] = useState(DEFAULT_EXPENDITURE_CATEGORIES[0]);
  const [amountInput, setAmountInput] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const stored = (await db.getSetting('expense.categories')) as string[] | null;
        if (stored && Array.isArray(stored) && stored.length) {
          setCategories(stored);
          setCategory(stored[0]);
        }
      } catch (error) {
        console.warn('Failed to load categories', error);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    if (categories.length && !categories.includes(category)) {
      setCategory(categories[0]);
    }
  }, [categories, category]);

  const persistCategories = async (next: string[]) => {
    setCategories(next);
    try {
      await db.setSetting('expense.categories', next);
    } catch (error) {
      console.warn('Failed to save categories', error);
    }
  };

  const handleCreateCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.some((cat) => cat.toLowerCase() === trimmed.toLowerCase())) {
      Toast.show({ type: 'info', text1: t('Category already exists') });
      return;
    }
    const next = [...categories, trimmed];
    persistCategories(next);
    setNewCategory('');
    setCategory(trimmed);
  };

  const handleRemoveCategory = (value: string) => {
    if (categories.length === 1) {
      Toast.show({ type: 'info', text1: t('At least one category required') });
      return;
    }

    Alert.alert(
      t('Remove Category'),
      t('Are you sure you want to delete {name}?').replace('{name}', value),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () => {
            const remaining = categories.filter((cat) => cat !== value);
            if (!remaining.length) {
              Toast.show({ type: 'info', text1: t('At least one category required') });
              return;
            }
            persistCategories(remaining);
            if (!remaining.includes(category)) {
              setCategory(remaining[0]);
            }
          },
        },
      ]
    );
  };

  const handleQuickSelect = (value: string) => {
    setCategory(value);
  };

  const formattedDisplayDate = useMemo(
    () => formatDateForDisplay(selectedDate),
    [selectedDate]
  );

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

  const handleSave = async () => {
    const normalized = amountInput.replace(/[^0-9.]/g, '');
    const parsedAmount = parseFloat(normalized);

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(t('Required field'));
      Toast.show({ type: 'error', text1: t('Required field') });
      return;
    }

    const now = new Date();
    const date = formatDateForStorage(selectedDate);
    const time = now.toTimeString().slice(0, 8);

    try {
      setIsSaving(true);
      await addExpenditure({
        category,
        amount: parsedAmount,
        description: description.trim() || category,
        date,
        time,
      });
      Toast.show({ type: 'success', text1: t('Expenditure saved successfully') });
      router.back();
    } catch (err) {
      console.error('Failed to save expenditure', err);
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
        <Text style={styles.title}>{t('Add Expenditure')}</Text>

        <Input
          label={t('Amount')}
          value={amountInput}
          onChangeText={(text) => {
            setAmountInput(text);
            setError(null);
          }}
          keyboardType="numeric"
          placeholder={t('Enter amount')}
          error={error}
        />

        <View style={styles.labelRow}>
          <Ionicons name="pricetag-outline" size={16} color="#c026d3" />
          <Text style={styles.fieldLabel}>{t('Expense Category')}</Text>
        </View>
        <Select
          value={category}
          onValueChange={(value) => value && setCategory(value)}
          options={categories.map((item) => ({
            label: item,
            value: item,
          }))}
          placeholder={t('Select category')}
        />

        <View style={styles.quickAddHeader}>
          <TouchableOpacity
            style={styles.quickAddToggle}
            onPress={() => setShowQuickAdd((prev) => !prev)}
          >
            <Ionicons
              name={showQuickAdd ? 'chevron-down' : 'chevron-forward'}
              size={16}
              color="#c026d3"
            />
            <Text style={styles.quickAddTitle}>{t('Quick Add Category')}</Text>
            <Text style={styles.quickAddToggleText}>
              {showQuickAdd ? t('Hide') : t('Show')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAddManage} onPress={() => setShowManageModal(true)}>
            <Ionicons name="settings-outline" size={16} color="#8b5cf6" />
            <Text style={styles.quickAddManageText}>{t('Manage')}</Text>
          </TouchableOpacity>
        </View>
        {showQuickAdd && (
          <View style={styles.quickAddGrid}>
            {categories.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.quickAddChip, category === item && styles.quickAddChipActive]}
                onPress={() => handleQuickSelect(item)}
              >
                <Ionicons
                  name="wallet-outline"
                  size={14}
                  color={category === item ? '#ffffff' : '#c026d3'}
                />
                <Text
                  style={[
                    styles.quickAddChipText,
                    category === item && styles.quickAddChipTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Input
          label={t('Date')}
          value={formattedDisplayDate}
          onChangeText={handleDateChange}
          placeholder="DD/MM/YYYY"
        />

        <Input
          label={t('Description')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('Optional: add notes, invoice details, etc.')}
          multiline
          numberOfLines={3}
          style={styles.multiline}
        />

        <View style={styles.summaryStrip}>
          <Text style={styles.summaryStripText}>
            {t('You will add')}: {formatCurrency(parseFloat(amountInput.replace(/[^0-9.]/g, '')) || 0)}{' '}
            {t('in')} {category}
          </Text>
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
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving}
            style={styles.actionButton}
          >
            {t('Save Expenditure')}
          </Button>
        </View>

        <Modal
          transparent
          visible={showManageModal}
          animationType="slide"
          onRequestClose={() => setShowManageModal(false)}
        >
          <View style={styles.manageOverlay}>
            <View style={styles.manageCard}>
              <View style={styles.manageHeader}>
                <Text style={styles.manageTitle}>{t('Manage Expense Categories')}</Text>
                <TouchableOpacity onPress={() => setShowManageModal(false)}>
                  <Ionicons name="close" size={22} color="#64748b" />
                </TouchableOpacity>
              </View>
              <View style={styles.manageAddRow}>
                <Input
                  value={newCategory}
                  onChangeText={setNewCategory}
                  placeholder={t('New category name')}
                  containerStyle={styles.manageInputContainer}
                  style={styles.manageInput}
                />
                <Button style={styles.manageAddButton} onPress={handleCreateCategory}>
                  {t('Add')}
                </Button>
              </View>
              <ScrollView style={styles.manageList}>
                {categories.map((item) => (
                  <View key={item} style={styles.manageItem}>
                    <View style={styles.manageItemLeft}>
                      <Ionicons name="wallet-outline" size={18} color="#d946ef" />
                      <Text style={styles.manageItemText}>{item}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveCategory(item)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  dateContainer: {
    marginBottom: 16,
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
    marginBottom: 16,
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
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  actionButton: {
    flex: 1,
  },
  quickAddHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  quickAddToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickAddTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  quickAddToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#c026d3',
  },
  quickAddManage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quickAddManageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  quickAddGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  quickAddChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f0abfc',
    backgroundColor: '#ffffff',
  },
  quickAddChipActive: {
    backgroundColor: '#c026d3',
    borderColor: '#c026d3',
  },
  quickAddChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#c026d3',
  },
  quickAddChipTextActive: {
    color: '#ffffff',
  },
  summaryStrip: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  summaryStripText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
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
  manageAddRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  manageInputContainer: {
    flex: 1,
    marginBottom: 0,
  },
  manageInput: {
    flex: 1,
    minHeight: 48,
    height: 48,
  },
  manageAddButton: {
    height: 48,
    paddingHorizontal: 20,
    justifyContent: 'center',
    flexShrink: 0,
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
});
