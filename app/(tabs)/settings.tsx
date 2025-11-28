import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage, Language } from '../../contexts/LanguageContext';
import { useShop } from '../../contexts/ShopContext';
import { useData, JazzCashProfitConfig } from '../../contexts/DataContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { db } from '../../lib/database';
import { hashPin, isBiometricAvailable, enableBiometrics, disableBiometrics, getBiometricUserId } from '../../services/authService';
import { synchronizeNow } from '../../services/syncService';
import { spacing, radii, textStyles } from '../../theme/tokens';
import {
  importProductsFromCsv,
  exportDataSnapshot,
  exportInventorySnapshotToDevice,
  getLatestInventoryBackupFromDownloads,
  getLastInventoryBackupMeta,
  promptForDownloadsDirectory,
} from '../../services/importExportService';
import {
  createDatabaseBackup,
  shareBackupToCloud,
  listBackups,
  restoreBackupFromFile,
  registerAutomatedBackups,
  unregisterAutomatedBackups,
  getBackupScheduleSetting,
  saveBackupScheduleSetting,
  deleteAllBackups,
} from '../../services/backupService';
import { formatDateForDisplay } from '../../lib/date';
import AsyncStorage from '@react-native-async-storage/async-storage';

const getDefaultBackupFileName = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `inventory-backup-${y}-${m}-${d}.json`;
};

type User = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  roleId: number;
  isActive: boolean;
  lastLoginAt?: string | null;
};

type Role = {
  id: number;
  name: string;
  permissions: Record<string, boolean>;
};

type InventoryBackupInfo = {
  fileName: string;
  uri: string;
  savedAt: string;
  location: 'downloads' | 'internal';
};

type AutoBackupSetting = {
  enabled: boolean;
  intervalHours: number;
};

const createCurrencyFormatter = () => {
  try {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      maximumFractionDigits: 0,
    });
  } catch (error) {
    console.warn('[Settings] Intl currency formatter unavailable, using fallback', error);
    return {
      format: (value: number | bigint) => {
        const amount = Number(value) || 0;
        return `Rs. ${amount.toLocaleString()}`;
      },
    } as Intl.NumberFormat;
  }
};

const currencyFormatter = createCurrencyFormatter();

const CACHE_SCHEDULE_KEY = 'pos.cacheSchedule';

export default function SettingsScreen() {
  const { user: currentUser, logout, updateUserName } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { profile: shopProfile, saveProfile: saveShopProfile } = useShop();
  const { clearProducts, products: rawProducts, jazzCashProfitSettings, refreshData } = useData();
  const products = rawProducts ?? [];
  
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formRoleId, setFormRoleId] = useState<number>(1);
  const [formActive, setFormActive] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<{ pushed?: string | null; pulled?: string | null }>({
    pushed: null,
    pulled: null,
  });
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isClearingBackups, setIsClearingBackups] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isSharingBackup, setIsSharingBackup] = useState(false);
  const [isSavingBackupToDevice, setIsSavingBackupToDevice] = useState(false);
  const [isBackupOptionsVisible, setIsBackupOptionsVisible] = useState(false);
  const [backupFileName, setBackupFileName] = useState(getDefaultBackupFileName);
  const [lastInventoryBackup, setLastInventoryBackup] = useState<InventoryBackupInfo | null>(null);
  const [isClearingInventory, setIsClearingInventory] = useState(false);
  const [cacheScheduleEnabled, setCacheScheduleEnabled] = useState(false);
  const [cacheIntervalHours, setCacheIntervalHours] = useState<number>(24);
  const [lastCacheClear, setLastCacheClear] = useState<string | null>(null);
  const [isUpdatingCacheSchedule, setIsUpdatingCacheSchedule] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [backupSummary, setBackupSummary] = useState<{ last?: string | null; count: number }>({
    last: null,
    count: 0,
  });
  const [autoBackupSetting, setAutoBackupSetting] = useState<AutoBackupSetting | null>(null);
  const [isLoadingAutoBackup, setIsLoadingAutoBackup] = useState(true);
  const [isUpdatingAutoBackup, setIsUpdatingAutoBackup] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopOwner, setShopOwner] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [isSavingShop, setIsSavingShop] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  
  // Biometric authentication state
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isTogglingBiometric, setIsTogglingBiometric] = useState(false);

  // User management is now done through the admin panel (Supabase)
  // Disable local user management since it uses the old SQLite system
  const canManageUsers = false;
  const isShopDirty =
    shopName !== shopProfile.shopName ||
    shopOwner !== shopProfile.ownerName ||
    shopPhone !== shopProfile.phoneNumber;
  const languageOptions: Array<{ code: Language; label: string }> = [
    { code: 'english', label: 'English' },
  ];
  const autoBackupIntervals = [
    { label: t('Every 12 hours'), value: 12 },
    { label: t('Daily'), value: 24 },
    { label: t('Every 3 days'), value: 72 },
  ];
  const cacheIntervals = [
    { label: t('Daily'), value: 24 },
    { label: t('Every 3 days'), value: 72 },
    { label: t('Weekly'), value: 24 * 7 },
  ];

  useEffect(() => {
    loadData();
    checkBiometricAvailability();
    loadCacheSchedule();
  }, []);

  // Re-check biometric state when user changes (e.g., after login)
  useEffect(() => {
    if (currentUser) {
      checkBiometricAvailability();
    }
  }, [currentUser?.id]);

  useEffect(() => {
    setShopName(shopProfile.shopName);
    setShopOwner(shopProfile.ownerName);
    setShopPhone(shopProfile.phoneNumber);
  }, [shopProfile]);

  const checkBiometricAvailability = async () => {
    try {
      // Check if device has biometric hardware (fingerprint/face ID)
      const LocalAuthentication = require('expo-local-authentication');
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const userId = await getBiometricUserId();
      
      console.log('[Settings] ========== CHECKING BIOMETRIC STATE ==========');
      console.log('[Settings] Biometric hardware:', hasHardware);
      console.log('[Settings] Biometric enrolled:', isEnrolled);
      console.log('[Settings] Saved user ID:', userId);
      console.log('[Settings] Current user ID:', currentUser?.id);
      
      // Biometric is enabled if:
      // 1. Hardware exists
      // 2. User has enrolled fingerprints
      // 3. User ID is saved in SecureStore
      const isEnabled = !!userId && hasHardware && isEnrolled;
      
      console.log('[Settings] Biometric enabled state:', isEnabled);
      console.log('[Settings] ================================================');
      
      // Show as available if hardware exists, even if not enrolled yet
      setBiometricAvailable(hasHardware);
      setBiometricEnabled(isEnabled);
    } catch (error) {
      console.error('Failed to check biometric availability', error);
      setBiometricAvailable(false);
      setBiometricEnabled(false);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        db.listUsers(),
        db.getRoles(),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (error) {
      console.error('Failed to load users/roles', error);
      Toast.show({ type: 'error', text1: t('Failed to load data') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveShopDetails = async () => {
    setIsSavingShop(true);
    const payload = {
      shopName: shopName.trim(),
      ownerName: shopOwner.trim(),
      phoneNumber: shopPhone.trim(),
    };

    try {
      await saveShopProfile(payload);
      Toast.show({ type: 'success', text1: t('Shop details updated') });
    } catch (error) {
      console.error('Failed to save shop details', error);
      Toast.show({ type: 'error', text1: t('Failed to update shop details') });
    } finally {
      setIsSavingShop(false);
    }
  };

  const handleToggleBiometric = async () => {
    if (!currentUser?.id) {
      Toast.show({ type: 'error', text1: t('User not found') });
      return;
    }

    setIsTogglingBiometric(true);
    try {
      if (biometricEnabled) {
        // Disable biometric - use authService to ensure correct keys
        await disableBiometrics(currentUser.id);
        setBiometricEnabled(false);
        Toast.show({ type: 'success', text1: t('Biometric authentication disabled') });
      } else {
        // Check if user has enrolled biometrics (fingerprint/face)
        const LocalAuthentication = require('expo-local-authentication');
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        
        if (!isEnrolled) {
          Toast.show({ 
            type: 'error', 
            text1: t('No biometrics enrolled'),
            text2: t('Please add fingerprint or face ID in device settings first')
          });
          return;
        }
        
        // Enable biometric - use authService to ensure correct keys
        console.log('[Settings] Enabling biometric for user:', currentUser.id);
        await enableBiometrics(currentUser.id);
        await SecureStore.setItemAsync('pos.biometric.hasLoggedIn', 'true');
        setBiometricEnabled(true);
        console.log('[Settings] Biometric enabled successfully');
        Toast.show({ type: 'success', text1: t('Biometric authentication enabled') });
      }
    } catch (error) {
      console.error('Failed to toggle biometric', error);
      Toast.show({ type: 'error', text1: t('Failed to update biometric settings') });
    } finally {
      setIsTogglingBiometric(false);
    }
  };

  const summarizeBackups = (backups: Array<{ createdAt?: string | null }>) => {
    const sorted = [...backups].sort((a, b) => {
      const aTime = a.createdAt ?? '';
      const bTime = b.createdAt ?? '';
      return bTime.localeCompare(aTime);
    });
    return {
      count: backups.length,
      last: sorted.length ? sorted[0].createdAt ?? null : null,
    };
  };

  const describeTimestamp = (value?: string | null) => {
    if (!value) {
      return t('Never');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return t('Never');
    }
    return `${formatDateForDisplay(date)} at ${date.toLocaleTimeString()}`;
  };

  const refreshBackupSummary = async () => {
    const backups = await listBackups();
    setBackupSummary(summarizeBackups(backups));
  };

  const persistCacheSchedule = async (state: {
    enabled: boolean;
    intervalHours: number;
    lastClearedAt: string | null;
  }) => {
    try {
      await AsyncStorage.setItem(CACHE_SCHEDULE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Persist cache schedule failed', error);
    }
  };

  const evaluateCacheSchedule = (enabled: boolean, interval: number, lastClearedAt: string | null) => {
    if (!enabled || !lastClearedAt) {
      return;
    }
    const last = new Date(lastClearedAt).getTime();
    if (Number.isNaN(last)) {
      return;
    }
    const hoursSince = (Date.now() - last) / (1000 * 60 * 60);
    if (hoursSince >= interval) {
      handleClearCache({ silent: true });
    }
  };

  const loadCacheSchedule = async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_SCHEDULE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      const enabled =
        typeof parsed.enabled === 'boolean' ? parsed.enabled : cacheScheduleEnabled;
      const interval =
        typeof parsed.intervalHours === 'number' ? parsed.intervalHours : cacheIntervalHours;
      const last =
        typeof parsed.lastClearedAt === 'string'
          ? parsed.lastClearedAt
          : parsed.lastClearedAt === null
          ? null
          : lastCacheClear;

      setCacheScheduleEnabled(enabled);
      setCacheIntervalHours(interval);
      setLastCacheClear(last ?? null);
      evaluateCacheSchedule(enabled, interval, last ?? null);
    } catch (error) {
      console.error('Load cache schedule failed', error);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await synchronizeNow();
      const syncState = await db.getSyncState('snapshot');
      if (syncState) {
        setLastSync({
          pushed: syncState.lastPushedAt ?? null,
          pulled: syncState.lastPulledAt ?? null,
        });
      }
      Toast.show({ type: 'success', text1: t('Cloud sync complete') });
    } catch (error) {
      console.error('Cloud sync failed', error);
      Toast.show({
        type: 'error',
        text1: t('Cloud sync failed'),
        text2: t('Check your connection and try again'),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportProducts = async (preselectedUri?: string, labelOverride?: string) => {
    setIsImporting(true);
    setIsImportingCsv(true);
    try {
      const result = await importProductsFromCsv(preselectedUri);
      if (!result) {
        Toast.show({ type: 'info', text1: t('No file selected') });
        return;
      }
      await refreshData();
      const fileLabel = labelOverride ?? result.fileName;
      Toast.show({
        type: 'success',
        text1: t('Import complete'),
        text2: [
          t('Imported {count} products').replace('{count}', String(result.imported)),
          fileLabel ? fileLabel : null,
        ]
          .filter(Boolean)
          .join(' • '),
      });
    } catch (error) {
      if ((error as Error)?.message === 'E_SAF_PERMISSION') {
        Toast.show({
          type: 'info',
          text1: t('Download permission not granted'),
          text2: t('Please select a folder to continue'),
        });
        return;
      }
      if ((error as Error)?.message === 'E_EMPTY_BACKUP') {
        Toast.show({
          type: 'info',
          text1: t('Backup file was empty'),
        });
        return;
      }
      console.error('Import failed', error);
      Toast.show({
        type: 'error',
        text1: t('Import failed'),
        text2: t('Please check your backup file'),
      });
    } finally {
      setIsImporting(false);
      setIsImportingCsv(false);
    }
  };

  const handleExportData = async () => {
    const trimmed = backupFileName.trim();
    if (!trimmed) {
      Toast.show({ type: 'info', text1: t('Enter a file name first') });
      return;
    }
    setIsExporting(true);
    try {
      const fileUri = await exportDataSnapshot(trimmed);
      Toast.show({
        type: 'success',
        text1: t('Export ready'),
        text2: fileUri.split('/').pop() ?? undefined,
      });
      setIsBackupOptionsVisible(false);
    } catch (error) {
      console.error('Export failed', error);
      Toast.show({ type: 'error', text1: t('Export failed') });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveBackupToDevice = async () => {
    const trimmed = backupFileName.trim();
    if (!trimmed) {
      Toast.show({ type: 'info', text1: t('Enter a file name first') });
      return;
    }
    setIsSavingBackupToDevice(true);
    try {
      const result = await exportInventorySnapshotToDevice(trimmed);
      const fileLabel = result.fileName;
      setLastInventoryBackup({
        fileName: result.fileName,
        uri: result.uri,
        savedAt: new Date().toISOString(),
        location: result.location,
      });
      Toast.show({
        type: 'success',
        text1: t('Inventory backup saved to your device'),
        text2:
          result.location === 'downloads'
            ? t('Saved to Downloads as {file}').replace('{file}', fileLabel)
            : t('Saved to app storage as {file}').replace('{file}', fileLabel),
      });
      setIsBackupOptionsVisible(false);
    } catch (error: any) {
      if (error?.message === 'E_SAF_PERMISSION') {
        Toast.show({
          type: 'info',
          text1: t('Download permission not granted'),
          text2: t('Please select a folder to continue'),
        });
      } else {
        console.error('Save backup failed', error);
        Toast.show({ type: 'error', text1: t('Could not save backup') });
      }
    } finally {
      setIsSavingBackupToDevice(false);
    }
  };

  const handleShareInventoryBackupFile = async () => {
    if (!lastInventoryBackup) {
      Toast.show({ type: 'info', text1: t('No inventory backup to share') });
      return;
    }
    try {
      const info = await FileSystem.getInfoAsync(lastInventoryBackup.uri);
      if (!info.exists) {
        Toast.show({
          type: 'error',
          text1: t('Could not share backup file'),
          text2: t('Backup file not found. Please create a new backup.'),
        });
        return;
      }

      let targetUri = lastInventoryBackup.uri;

      // If the URI is SAF content or not directly shareable, copy to cache first
      if (targetUri.startsWith('content://') || !(targetUri.startsWith('file://'))) {
        const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
        const cachePath = `${cacheDir}inventory-backup-share.json`;
        const content = await FileSystem.readAsStringAsync(targetUri, { encoding: 'utf8' });
        await FileSystem.writeAsStringAsync(cachePath, content, { encoding: 'utf8' });
        targetUri = cachePath;
      }

      await Sharing.shareAsync(targetUri, {
        dialogTitle: t('Share inventory backup file'),
        mimeType: 'application/json',
      });
    } catch (error) {
      console.error('Share inventory backup failed', error);
      const message = error instanceof Error ? error.message : t('Something went wrong');
      Toast.show({ type: 'error', text1: t('Could not share backup file'), text2: message });
    }
  };

  const handleToggleAutoBackup = async () => {
    if (!autoBackupSetting || isLoadingAutoBackup || isUpdatingAutoBackup) {
      return;
    }
    setIsUpdatingAutoBackup(true);
    const nextSetting: AutoBackupSetting = {
      enabled: !autoBackupSetting.enabled,
      intervalHours: autoBackupSetting.intervalHours,
    };
    try {
      await saveBackupScheduleSetting(nextSetting);
      if (nextSetting.enabled) {
        await unregisterAutomatedBackups();
        await registerAutomatedBackups(nextSetting.intervalHours);
        Toast.show({ type: 'success', text1: t('Auto backup enabled') });
      } else {
        await unregisterAutomatedBackups();
        Toast.show({ type: 'info', text1: t('Auto backup disabled') });
      }
      setAutoBackupSetting(nextSetting);
    } catch (error) {
      console.error('Toggle auto backup failed', error);
      Toast.show({ type: 'error', text1: t('Could not update auto backup') });
    } finally {
      setIsUpdatingAutoBackup(false);
    }
  };

  const handleChangeAutoBackupInterval = async (hours: number) => {
    if (
      !autoBackupSetting ||
      isLoadingAutoBackup ||
      hours === autoBackupSetting.intervalHours ||
      isUpdatingAutoBackup
    ) {
      return;
    }
    setIsUpdatingAutoBackup(true);
    const nextSetting: AutoBackupSetting = {
      ...autoBackupSetting,
      intervalHours: hours,
    };
    try {
      await saveBackupScheduleSetting(nextSetting);
      if (nextSetting.enabled) {
        await unregisterAutomatedBackups();
        await registerAutomatedBackups(hours);
      }
      setAutoBackupSetting(nextSetting);
      Toast.show({ type: 'success', text1: t('Auto backup interval updated') });
    } catch (error) {
      console.error('Failed to update auto backup interval', error);
      Toast.show({ type: 'error', text1: t('Could not update auto backup') });
    } finally {
      setIsUpdatingAutoBackup(false);
    }
  };

  const supportsDownloadsAccess =
    Platform.OS === 'android' &&
    !!(FileSystem as any).StorageAccessFramework?.requestDirectoryPermissionsAsync;

  const handleGrantDownloadsAccess = async () => {
    try {
      const result = await promptForDownloadsDirectory();
      if (result.granted) {
        Toast.show({
          type: 'success',
          text1: t('Downloads folder linked'),
          text2: t('Backups will now save there automatically.'),
        });
        return;
      }
      if (result.reason === 'unavailable') {
        Toast.show({
          type: 'info',
          text1: t('Storage Access Framework not available'),
          text2: t('This device cannot grant Downloads access. Use Share to move backups.'),
        });
      } else {
        Toast.show({
          type: 'info',
          text1: t('Permission required'),
          text2: t('Select the Downloads folder to save backups there.'),
        });
      }
    } catch (error) {
      console.error('Grant access failed', error);
      const message = String((error as Error)?.message ?? '');
      if (message.includes('E_SAF_UNAVAILABLE')) {
        Toast.show({
          type: 'info',
          text1: t('Storage Access Framework not available'),
          text2: t('This device cannot grant Downloads access. Use Share to move backups.'),
        });
      } else {
        Toast.show({ type: 'error', text1: t('Could not open folder picker') });
      }
    }
  };

  const handleClearInventory = () => {
    if (products.length === 0) {
      Toast.show({ type: 'info', text1: t('Inventory is already empty') });
      return;
    }
    Alert.alert(
      t('Clear Inventory'),
      t('This will delete all products permanently. Continue?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              setIsClearingInventory(true);
              await clearProducts();
              Toast.show({ type: 'success', text1: t('Inventory cleared') });
            } catch (error) {
              console.error('Clear inventory failed', error);
              Toast.show({ type: 'error', text1: t('Failed to clear inventory') });
            } finally {
              setIsClearingInventory(false);
            }
          },
        },
      ]
    );
  };

  const openBackupOptions = () => {
    setBackupFileName(getDefaultBackupFileName());
    setIsBackupOptionsVisible(true);
  };

  const handleRestoreInventoryCardPress = async () => {
    const latest = await getLatestInventoryBackupFromDownloads();
    if (!latest) {
      Toast.show({
        type: 'info',
        text1: t('No saved backups found in Downloads'),
        text2: t('Choose a backup file manually.'),
      });
      await handleImportProducts();
      return;
    }

    Alert.alert(
      t('Restore Inventory Backup'),
      t('Restore {file} from Downloads?').replace('{file}', latest.name),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Choose File'),
          onPress: () => {
            handleImportProducts();
          },
        },
        {
          text: t('Restore from Downloads'),
          onPress: () => {
            handleImportProducts(latest.uri, latest.name);
          },
        },
      ]
    );
  };

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    try {
      const result = await createDatabaseBackup();
      await refreshBackupSummary();
      Toast.show({
        type: 'success',
        text1: t('Backup created'),
        text2:
          (result?.location as string) === 'downloads' && result?.name
            ? `Saved to Downloads (${result.name})`
            : result?.name
            ? `Saved to app storage (${result.name})`
            : undefined,
      });
    } catch (error) {
      console.error('Backup failed', error);
      Toast.show({ type: 'error', text1: t('Backup failed') });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleShareBackup = async () => {
    setIsSharingBackup(true);
    try {
      await shareBackupToCloud();
      Toast.show({ type: 'success', text1: t('Backup shared') });
    } catch (error) {
      console.error('Share backup failed', error);
      Toast.show({ type: 'error', text1: t('Share failed') });
    } finally {
      setIsSharingBackup(false);
    }
  };

  const handleResetDatabase = () => {
    Alert.alert(
      t('Reset Database'),
      t('This will permanently delete all products, customers, sales, and backups. Are you sure?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete All Data'),
          style: 'destructive',
          onPress: async () => {
            try {
              await db.clearAllData();
              Toast.show({ type: 'success', text1: t('Database reset'), text2: t('Restart app to see changes') });
            } catch (error) {
              console.error('Database reset failed', error);
              Toast.show({ type: 'error', text1: t('Reset failed') });
            }
          },
        },
      ]
    );
  };

  const handleClearBackups = async () => {
    setIsClearingBackups(true);
    try {
      await deleteAllBackups();
      await refreshBackupSummary();
      Toast.show({ type: 'success', text1: t('Backups deleted') });
    } catch (error) {
      console.error('Clear backups failed', error);
      Toast.show({ type: 'error', text1: t('Could not delete backups') });
    } finally {
      setIsClearingBackups(false);
    }
  };

  const handleToggleCacheSchedule = async () => {
    const nextEnabled = !cacheScheduleEnabled;
    setIsUpdatingCacheSchedule(true);
    try {
      await persistCacheSchedule({
        enabled: nextEnabled,
        intervalHours: cacheIntervalHours,
        lastClearedAt: lastCacheClear,
      });
      setCacheScheduleEnabled(nextEnabled);
      if (nextEnabled) {
        evaluateCacheSchedule(nextEnabled, cacheIntervalHours, lastCacheClear);
      }
      Toast.show({
        type: 'success',
        text1: nextEnabled ? t('Cache scheduler enabled') : t('Cache scheduler disabled'),
      });
    } catch (error) {
      console.error('Toggle cache schedule failed', error);
      Toast.show({ type: 'error', text1: t('Could not update cache schedule') });
    } finally {
      setIsUpdatingCacheSchedule(false);
    }
  };

  const handleChangeCacheInterval = async (intervalHours: number) => {
    setIsUpdatingCacheSchedule(true);
    try {
      setCacheIntervalHours(intervalHours);
      await persistCacheSchedule({
        enabled: cacheScheduleEnabled,
        intervalHours,
        lastClearedAt: lastCacheClear,
      });
      evaluateCacheSchedule(cacheScheduleEnabled, intervalHours, lastCacheClear);
    } catch (error) {
      console.error('Update cache interval failed', error);
      Toast.show({ type: 'error', text1: t('Could not update cache schedule') });
    } finally {
      setIsUpdatingCacheSchedule(false);
    }
  };

  const handleClearCache = async (options?: { silent?: boolean }) => {
    const silent = options?.silent;
    if (isClearingCache && !silent) {
      return;
    }
    if (!silent) {
      setIsClearingCache(true);
    }
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const items = await FileSystem.readDirectoryAsync(cacheDir);
        await Promise.all(
          items.map((item) =>
            FileSystem.deleteAsync(`${cacheDir}${item}`, {
              idempotent: true,
            })
          )
        );
      }
      const nowIso = new Date().toISOString();
      setLastCacheClear(nowIso);
      await persistCacheSchedule({
        enabled: cacheScheduleEnabled,
        intervalHours: cacheIntervalHours,
        lastClearedAt: nowIso,
      });
      if (!silent) {
        Toast.show({ type: 'success', text1: t('Cache cleared') });
      }
    } catch (error) {
      console.error('Clear cache failed', error);
      if (!silent) {
        Toast.show({ type: 'error', text1: t('Could not clear cache') });
      }
    } finally {
      if (!silent) {
        setIsClearingCache(false);
      }
    }
  };

  const restoreFromLatestLocalBackup = async () => {
    if (isRestoringBackup) {
      return;
    }
    setIsRestoringBackup(true);
    try {
      const backups = await listBackups();
      if (!backups.length) {
        Toast.show({ type: 'info', text1: t('No local backups found') });
        return;
      }
      backups.sort((a, b) => (a.createdAt && b.createdAt ? (a.createdAt > b.createdAt ? -1 : 1) : 0));

      const latest = backups[0];
      await restoreBackupFromFile(latest.uri);
      Toast.show({
        type: 'success',
        text1: t('Backup restored'),
        text2: t('Restart the app to see changes.'),
      });
    } catch (error) {
      console.error('Restore local backup failed', error);
      const message = error instanceof Error ? error.message : t('Something went wrong');
      Toast.show({ type: 'error', text1: t('Restore failed'), text2: message });
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const restoreBackupFromPicker = async () => {
    try {
      const picker = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (picker.canceled) {
        return;
      }
      const asset =
        picker.assets?.[0] ||
        ((picker as any).type === 'success'
          ? { uri: (picker as any).uri, name: (picker as any).name }
          : null);
      if (!asset?.uri) {
        Toast.show({ type: 'error', text1: t('No file selected') });
        return;
      }
      const normalizedName = (asset.name ?? '').toLowerCase();
      if (normalizedName && !normalizedName.endsWith('.db')) {
        Toast.show({
          type: 'error',
          text1: t('Please select a .db backup file'),
        });
        return;
      }
      await restoreBackupFromFile(asset.uri);
      Toast.show({ type: 'success', text1: t('Backup restored'), text2: t('Restart the app to see changes.') });
    } catch (error) {
      console.error('Restore from picker failed', error);
      Toast.show({ type: 'error', text1: t('Restore failed') });
    }
  };

  const handleRestoreBackup = () => {
    Alert.alert(
      t('Restore Backup'),
      t('Choose how you want to restore your database.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Pick Backup File'),
          onPress: restoreBackupFromPicker,
        },
        {
          text: t('Latest Local Backup'),
          onPress: restoreFromLatestLocalBackup,
        },
      ]
    );
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const syncState = await db.getSyncState('snapshot');
        if (active && syncState) {
          setLastSync({
            pushed: syncState.lastPushedAt ?? null,
            pulled: syncState.lastPulledAt ?? null,
          });
        }
        const backups = await listBackups();
        if (active) {
          setBackupSummary(summarizeBackups(backups));
        }
        const lastBackup = await getLastInventoryBackupMeta();
        if (active) {
          setLastInventoryBackup(
            lastBackup
              ? {
                  fileName: lastBackup.fileName,
                  savedAt: lastBackup.savedAt,
                  location: lastBackup.location,
                  uri: lastBackup.uri,
                }
              : null
          );
        }
        const schedule = await getBackupScheduleSetting();
        if (active) {
          setAutoBackupSetting(schedule);
        }
      } catch (error) {
        console.warn('Failed to load maintenance metadata', error);
      } finally {
        if (active) {
          setIsLoadingAutoBackup(false);
        }
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const openAddUserModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormPin('');
    setFormRoleId(roles[0]?.id || 1);
    setFormActive(true);
    setModalVisible(true);
    setShowPin(false);
  };

  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email || '');
    setFormPhone(user.phone || '');
    setFormPin(''); // Don't show existing PIN
    setFormRoleId(user.roleId);
    setFormActive(user.isActive);
    setModalVisible(true);
    setShowPin(false);
  };

  const handleSaveUser = async () => {
    if (!formName.trim()) {
      Toast.show({ type: 'error', text1: t('Name is required') });
      return;
    }

    if (!editingUser && !formPin.trim()) {
      Toast.show({ type: 'error', text1: t('PIN is required for new users') });
      return;
    }

    if (formPin && formPin.length < 4) {
      Toast.show({ type: 'error', text1: t('PIN must be at least 4 digits') });
      return;
    }

    try {
      if (editingUser) {
        // Update existing user
        const updates: any = {
          name: formName.trim(),
          email: formEmail.trim() || undefined,
          phone: formPhone.trim() || undefined,
          roleId: formRoleId,
          isActive: formActive,
        };

        // Only update PIN if a new one is provided
        if (formPin.trim()) {
          updates.pinHash = await hashPin(formPin.trim());
        }

        await db.updateUser(editingUser.id, updates);
        Toast.show({ type: 'success', text1: t('User updated successfully') });
      } else {
        // Create new user
        const pinHash = await hashPin(formPin.trim());
        await db.createUser({
          name: formName.trim(),
          email: formEmail.trim() || undefined,
          phone: formPhone.trim() || undefined,
          pinHash,
          biometricEnabled: false,
          roleId: formRoleId,
        });
        Toast.show({ type: 'success', text1: t('User created successfully') });
      }

      setModalVisible(false);
      loadData();
    } catch (error) {
      console.error('Failed to save user', error);
      Toast.show({ type: 'error', text1: t('Failed to save user') });
    }
  };

  const isCurrentAuthUser = (userId: number) =>
    currentUser ? String(currentUser.id) === String(userId) : false;

  const handleDeleteUser = (user: User) => {
    if (isCurrentAuthUser(user.id)) {
      Toast.show({ type: 'error', text1: t('Cannot delete your own account') });
      return;
    }

    Alert.alert(
      t('Delete User'),
      t('Are you sure you want to delete this user? This action cannot be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft delete by setting isActive to false
              await db.updateUser(user.id, { isActive: false });
              Toast.show({ type: 'success', text1: t('User deleted') });
              loadData();
            } catch (error) {
              console.error('Failed to delete user', error);
              Toast.show({ type: 'error', text1: t('Failed to delete user') });
            }
          },
        },
      ]
    );
  };

  const handleToggleUserStatus = async (user: User) => {
    if (isCurrentAuthUser(user.id)) {
      Toast.show({ type: 'error', text1: t('Cannot disable your own account') });
      return;
    }

    try {
      await db.updateUser(user.id, { isActive: !user.isActive });
      Toast.show({
        type: 'success',
        text1: user.isActive ? t('User disabled') : t('User enabled'),
      });
      loadData();
    } catch (error) {
      console.error('Failed to toggle user status', error);
      Toast.show({ type: 'error', text1: t('Failed to update user') });
    }
  };

  const formatRoleLabel = (rawName?: string) => {
    if (!rawName) {
      return t('Unknown');
    }
    if (rawName.toLowerCase() === 'manager') {
      return t('Owner');
    }
    if (rawName.toLowerCase() === 'cashier') {
      return t('Cashier');
    }
    const capitalized = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    return t(capitalized);
  };

  const getRoleName = (roleId: number) => {
    const role = roles.find(r => r.id === roleId);
    return formatRoleLabel(role?.name);
  };

  const formatProfitValue = (config: JazzCashProfitConfig) => {
    if (!config.value) {
      return t('Not applied');
    }
    return config.mode === 'percent'
      ? `${config.value}%`
      : currencyFormatter.format(config.value);
  };

  const describeProfitMode = (config: JazzCashProfitConfig) => {
    return config.mode === 'percent' ? t('Percentage commission') : t('Flat PKR amount');
  };

  const handleLogout = () => {
    Alert.alert(t('Logout'), t('Are you sure you want to logout?'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Logout'),
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('Settings')}</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Shop Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Shop Details')}</Text>
          <Text style={styles.sectionHelper}>{t('Shown on invoices and receipts.')}</Text>
          <View style={styles.card}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('Shop Name')}</Text>
              <TextInput
                style={[styles.formInput, styles.shopInput]}
                value={shopName}
                onChangeText={setShopName}
                placeholder={t('Enter shop name')}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('Owner Name')}</Text>
              <TextInput
                style={[styles.formInput, styles.shopInput]}
                value={shopOwner}
                onChangeText={setShopOwner}
                placeholder={t('Enter owner name')}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('Phone Number')}</Text>
              <TextInput
                style={[styles.formInput, styles.shopInput]}
                value={shopPhone}
                onChangeText={setShopPhone}
                placeholder={t('Enter phone number')}
                keyboardType="phone-pad"
              />
            </View>
            <Button
              onPress={handleSaveShopDetails}
              style={[styles.shopSaveButton, !isShopDirty && styles.shopSaveButtonDisabled]}
              textStyle={!isShopDirty ? styles.shopSaveTextDisabled : undefined}
              disabled={!isShopDirty}
              loading={isSavingShop}
            >
              {isSavingShop ? t('Saving...') : t('Save Details')}
            </Button>
          </View>
        </View>

        {/* Current User Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Current User')}</Text>
          <View style={styles.card}>
            <View style={styles.userInfo}>
              <View style={styles.userAvatar}>
                <Ionicons name="person" size={24} color="#2563eb" />
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userName}>{currentUser?.name}</Text>
                <Text style={styles.userRole}>{currentUser?.isTrial ? 'Trial User' : 'User'}</Text>
              </View>
            </View>
            <Button variant="outline" onPress={handleLogout} style={styles.logoutButton}>
              {t('Logout')}
            </Button>
          </View>
        </View>

        {/* JazzCash Profit */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('JazzCash Profit')}</Text>
          <View style={styles.card}>
            <View style={styles.profitSummaryRow}>
              <View style={styles.profitSummaryIcon}>
                <Ionicons name="arrow-up" size={18} color="#dc2626" />
              </View>
              <View style={styles.profitSummaryContent}>
                <Text style={styles.profitSummaryLabel}>{t('Send profit')}</Text>
                <Text style={styles.profitSummaryValue}>
                  {formatProfitValue(jazzCashProfitSettings.send)}
                </Text>
                <Text style={styles.profitSummaryMode}>
                  {describeProfitMode(jazzCashProfitSettings.send)}
                </Text>
              </View>
            </View>

            <View style={styles.profitSummaryRow}>
              <View style={[styles.profitSummaryIcon, styles.profitSummaryIconReceive]}>
                <Ionicons name="arrow-down" size={18} color="#16a34a" />
              </View>
              <View style={styles.profitSummaryContent}>
                <Text style={styles.profitSummaryLabel}>{t('Receive profit')}</Text>
                <Text style={styles.profitSummaryValue}>
                  {formatProfitValue(jazzCashProfitSettings.receive)}
                </Text>
                <Text style={styles.profitSummaryMode}>
                  {describeProfitMode(jazzCashProfitSettings.receive)}
                </Text>
              </View>
            </View>

            <Text style={styles.profitSummaryHint}>
              {t('Manage profit settings in JazzCash Hub →')}
            </Text>
          </View>
        </View>

        {/* Security Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Security')}</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.biometricOption}
              onPress={handleToggleBiometric}
              disabled={!biometricAvailable || isTogglingBiometric}
              activeOpacity={0.7}
            >
              <View style={styles.biometricOptionLeft}>
                <View style={styles.biometricIconContainer}>
                  <Ionicons 
                    name="finger-print" 
                    size={24} 
                    color={biometricAvailable ? "#2563eb" : "#cbd5e1"} 
                  />
                </View>
                <View style={styles.biometricTextContainer}>
                  <Text style={[styles.biometricTitle, !biometricAvailable && styles.biometricTitleDisabled]}>
                    {t('Biometric authentication')}
                  </Text>
                  <Text style={styles.biometricSubtitle}>
                    {!biometricAvailable 
                      ? t('Not available on this device')
                      : t('Use fingerprint or Face ID to unlock register.')}
                  </Text>
                </View>
              </View>
              {biometricAvailable && (
                <View style={styles.biometricToggle}>
                  {isTogglingBiometric ? (
                    <ActivityIndicator size="small" color="#2563eb" />
                  ) : (
                    <View style={[styles.toggleSwitch, biometricEnabled && styles.toggleSwitchActive]}>
                      <View style={[styles.toggleKnob, biometricEnabled && styles.toggleKnobActive]} />
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Language Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="globe-outline" size={18} color="#0f172a" />
            <Text style={styles.sectionTitle}>{t('Language')}</Text>
          </View>
          <View style={styles.languageGrid}>
            {languageOptions.map((option) => (
              <TouchableOpacity
                key={option.code}
                style={[styles.languageButton, language === option.code && styles.languageButtonActive]}
                onPress={() => setLanguage(option.code)}
              >
                <Text style={[styles.languageText, language === option.code && styles.languageTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Data & Maintenance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Data & Maintenance')}</Text>

          <View style={styles.maintenanceGrid}>
            <TouchableOpacity
              style={styles.maintenanceCard}
              onPress={handleRestoreInventoryCardPress}
              activeOpacity={0.85}
            >
              <View style={[styles.maintenanceIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="cloud-download-outline" size={22} color="#7c3aed" />
              </View>
              <Text style={styles.maintenanceLabel}>{t('Restore Inventory Backup')}</Text>
              <Text style={styles.maintenanceMeta}>
                {isImporting ? t('Restoring inventory...') : t('Load items from your backup file')}
              </Text>
            </TouchableOpacity>

          <TouchableOpacity
            style={styles.maintenanceCard}
            onPress={openBackupOptions}
            activeOpacity={0.85}
          >
              <View style={[styles.maintenanceIcon, { backgroundColor: '#e0f2fe' }]}>
                <Ionicons name="cloud-upload-outline" size={22} color="#0ea5e9" />
              </View>
              <Text style={styles.maintenanceLabel}>{t('Backup Inventory Items')}</Text>
              <Text style={styles.maintenanceMeta}>
                {isExporting
                  ? t('Preparing inventory backup...')
              : t('Save all items as backup file')}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.maintenanceCard, { marginTop: 12 }]}
          onPress={() => handleImportProducts(undefined, t('CSV import'))}
          activeOpacity={0.85}
          disabled={isImportingCsv}
        >
          <View style={[styles.maintenanceIcon, { backgroundColor: '#ecfdf3' }]}>
            <Ionicons name="document-text-outline" size={22} color="#16a34a" />
          </View>
          <Text style={styles.maintenanceLabel}>{t('Import Inventory CSV')}</Text>
          <Text style={styles.maintenanceMeta}>
            {isImportingCsv ? t('Importing CSV...') : t('Load items from a CSV file')}
          </Text>
        </TouchableOpacity>

        {supportsDownloadsAccess && (
          <TouchableOpacity
            style={styles.downloadsAccessButton}
            onPress={handleGrantDownloadsAccess}
            activeOpacity={0.8}
            >
              <Ionicons name="folder-open-outline" size={16} color="#1d4ed8" />
              <Text style={styles.downloadsAccessText}>
                {t('Grant Downloads Access')}
              </Text>
            </TouchableOpacity>
          )}

          <Button
            variant="outline"
            style={styles.clearInventoryButton}
            onPress={handleClearInventory}
            loading={isClearingInventory}
            disabled={isClearingInventory}
          >
            {t('Clear Inventory')}
          </Button>
          <Text style={styles.dangerNote}>{t('Deletes all products. This cannot be undone.')}</Text>

          <View style={styles.autoBackupCard}>
            <View style={styles.autoBackupHeader}>
              <View style={styles.autoBackupHeaderText}>
                <Text style={styles.autoBackupTitle}>{t('Auto Backup Scheduler')}</Text>
                <Text style={styles.autoBackupStatus}>
                  {isLoadingAutoBackup
                    ? t('Loading...')
                    : autoBackupSetting?.enabled
                      ? t('Enabled')
                      : t('Disabled')}
                </Text>
              </View>
              <View style={styles.autoBackupToggle}>
                {isUpdatingAutoBackup ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <TouchableOpacity
                    onPress={handleToggleAutoBackup}
                    disabled={!autoBackupSetting || isLoadingAutoBackup}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.toggleSwitch,
                        autoBackupSetting?.enabled && styles.toggleSwitchActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.toggleKnob,
                          autoBackupSetting?.enabled && styles.toggleKnobActive,
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <Text style={styles.autoBackupDescription}>
              {t('Automatically creates offline backups in the background.')}
            </Text>
            {autoBackupSetting?.enabled && (
              <View style={styles.autoBackupOptions}>
                {autoBackupIntervals.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.autoBackupChip,
                      autoBackupSetting?.intervalHours === option.value &&
                        styles.autoBackupChipActive,
                    ]}
                    onPress={() => handleChangeAutoBackupInterval(option.value)}
                    disabled={isUpdatingAutoBackup}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.autoBackupChipText,
                        autoBackupSetting?.intervalHours === option.value &&
                          styles.autoBackupChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {lastInventoryBackup && (
            <View style={styles.backupLocationCard}>
              <Text style={styles.backupLocationTitle}>{t('Last inventory backup')}</Text>
              <Text style={styles.backupLocationLine}>
                {t('File')}: {lastInventoryBackup.fileName}
              </Text>
              <Text style={styles.backupLocationLine}>
                {t('Location')}:{' '}
                {lastInventoryBackup.location === 'downloads'
                  ? t('Downloads folder (visible in Files app)')
                  : t('App storage (share the file to move it)')}
              </Text>
              <Button
                variant="outline"
                style={styles.shareBackupButton}
                onPress={handleShareInventoryBackupFile}
                disabled={!lastInventoryBackup}
              >
                <Text style={styles.systemButtonSecondaryLabel}>{t('Share backup')}</Text>
              </Button>
            </View>
          )}

          <View style={styles.systemSection}>
            <View style={styles.systemCard}>
              <View style={styles.systemHeader}>
                <View style={[styles.systemIcon, { backgroundColor: '#eff6ff' }]}>
                  <Ionicons name="cloud-outline" size={20} color="#2563eb" />
                </View>
                <View style={styles.systemHeaderText}>
                  <Text style={styles.systemTitle}>{t('Cloud workspace')}</Text>
                  <Text style={styles.systemSubtitle}>
                    {t('Last upload')}: {describeTimestamp(lastSync.pushed)}
                  </Text>
                  <Text style={styles.systemSubtitle}>
                    {t('Last download')}: {describeTimestamp(lastSync.pulled)}
                  </Text>
                </View>
              </View>
              <Button style={styles.systemButton} onPress={handleManualSync} disabled={isSyncing}>
                {isSyncing ? (
                  <View style={styles.buttonLoading}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.systemButtonLabel}>{t('Syncing...')}</Text>
                  </View>
                ) : (
                  <Text style={styles.systemButtonLabel}>{t('Sync now')}</Text>
                )}
              </Button>
            </View>

            <View style={styles.systemCard}>
              <View style={styles.systemHeader}>
                <View style={[styles.systemIcon, { backgroundColor: '#fef2f2' }]}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#dc2626" />
                </View>
                <View style={styles.systemHeaderText}>
                  <Text style={styles.systemTitle}>{t('Offline backups')}</Text>
                  <Text style={styles.systemSubtitle}>
                    {t('Recent backup')}: {describeTimestamp(backupSummary.last)}
                  </Text>
                  <Text style={styles.systemSubtitle}>
                    {t('Total stored')}: {backupSummary.count}
                  </Text>
                </View>
              </View>
              <View style={styles.systemActions}>
                <Button style={styles.systemButton} onPress={handleBackupNow} disabled={isBackingUp}>
                  {isBackingUp ? (
                    <View style={styles.buttonLoading}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={styles.systemButtonLabel}>{t('Backing up')}</Text>
                    </View>
                  ) : (
              <Text style={styles.systemButtonLabel}>{t('Create backup')}</Text>
              )}
            </Button>
            <Button
              variant="outline"
              style={[styles.systemButtonSecondary, styles.systemButtonSecondaryOutline]}
              onPress={handleRestoreBackup}
              loading={isRestoringBackup}
              disabled={isRestoringBackup}
            >
              <Text style={styles.systemButtonSecondaryLabel}>{t('Restore backup')}</Text>
            </Button>
            <Button
              variant="outline"
              style={[styles.systemButtonSecondary, styles.systemButtonSecondaryOutline]}
              onPress={handleShareBackup}
              disabled={isSharingBackup}
            >
              {isSharingBackup ? (
                <View style={styles.buttonLoading}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={styles.systemButtonSecondaryLabel}>{t('Sharing...')}</Text>
                </View>
              ) : (
                <Text style={styles.systemButtonSecondaryLabel}>{t('Share to cloud')}</Text>
              )}
            </Button>
            <Button
              variant="outline"
              style={[styles.systemButtonSecondary, styles.systemButtonSecondaryOutline]}
              onPress={handleClearCache}
              disabled={isClearingCache}
            >
              {isClearingCache ? (
                <View style={styles.buttonLoading}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={styles.systemButtonSecondaryLabel}>{t('Clearing cache...')}</Text>
                </View>
              ) : (
                <Text style={styles.systemButtonSecondaryLabel}>{t('Clear cache')}</Text>
              )}
            </Button>
            <Button
              variant="outline"
              style={[styles.systemButtonSecondary, styles.systemButtonSecondaryDangerOutline]}
              onPress={handleResetDatabase}
            >
              <Text style={styles.systemButtonSecondaryDangerLabel}>{t('Reset Database')}</Text>
            </Button>
            <Button
              variant="outline"
              style={[styles.systemButtonSecondary, styles.systemButtonSecondaryDangerOutline]}
              onPress={handleClearBackups}
              loading={isClearingBackups}
              disabled={isClearingBackups}
            >
              <Text style={styles.systemButtonSecondaryDangerLabel}>{t('Delete backup files')}</Text>
            </Button>
          </View>
        </View>

        <View style={styles.systemCard}>
          <View style={styles.cacheScheduleHeader}>
            <View style={[styles.systemIcon, { backgroundColor: '#fefce8' }]}>
              <Ionicons name="time-outline" size={20} color="#ca8a04" />
            </View>
            <View style={styles.cacheScheduleText}>
              <Text style={styles.systemTitle}>{t('Cache scheduler')}</Text>
              <Text style={styles.systemSubtitle}>
                {t('Last cleared')}: {describeTimestamp(lastCacheClear)}
              </Text>
              <Text style={styles.systemSubtitle}>
                {t('Interval')}:{' '}
                {cacheIntervals.find((i) => i.value === cacheIntervalHours)?.label ??
                  `${cacheIntervalHours}h`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.toggleSwitchContainer}
              onPress={handleToggleCacheSchedule}
              disabled={isUpdatingCacheSchedule}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.toggleSwitch,
                  cacheScheduleEnabled && styles.toggleSwitchActive,
                  isUpdatingCacheSchedule && { opacity: 0.6 },
                ]}
              >
                <View style={[styles.toggleKnob, cacheScheduleEnabled && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>
          {cacheScheduleEnabled && (
            <>
              <Text style={styles.cacheScheduleDescription}>
                {t('Clear cache automatically on a schedule')}
              </Text>
              <View style={styles.autoBackupOptions}>
                {cacheIntervals.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.autoBackupChip,
                      cacheIntervalHours === option.value && styles.autoBackupChipActive,
                    ]}
                    onPress={() => handleChangeCacheInterval(option.value)}
                    disabled={isUpdatingCacheSchedule}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.autoBackupChipText,
                        cacheIntervalHours === option.value && styles.autoBackupChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      </View>
        </View>

        {/* User Management */}
        {canManageUsers && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('User Management')}</Text>
              <TouchableOpacity style={styles.addButton} onPress={openAddUserModal}>
                <Ionicons name="add-circle" size={24} color="#2563eb" />
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <Text style={styles.loadingText}>{t('Loading...')}</Text>
            ) : (
              <View style={styles.usersList}>
                {users.map((user) => (
                  <View key={user.id} style={styles.userCard}>
                    <View style={styles.userCardHeader}>
                      <View style={styles.userCardInfo}>
                        <Text style={styles.userCardName}>{user.name}</Text>
                        <Text style={styles.userCardRole}>{getRoleName(user.roleId)}</Text>
                      </View>
                      <Badge variant={user.isActive ? 'success' : 'warning'}>
                        {user.isActive ? t('Active') : t('Inactive')}
                      </Badge>
                    </View>
                    
                    {(user.email || user.phone) && (
                      <View style={styles.userCardContact}>
                        {user.email && (
                          <Text style={styles.userCardContactText}>
                            <Ionicons name="mail" size={14} /> {user.email}
                          </Text>
                        )}
                        {user.phone && (
                          <Text style={styles.userCardContactText}>
                            <Ionicons name="call" size={14} /> {user.phone}
                          </Text>
                        )}
                      </View>
                    )}

                    <View style={styles.userCardActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => openEditUserModal(user)}
                      >
                        <Ionicons name="pencil" size={18} color="#2563eb" />
                        <Text style={styles.actionButtonText}>{t('Edit')}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleToggleUserStatus(user)}
                        disabled={isCurrentAuthUser(user.id)}
                      >
                        <Ionicons
                          name={user.isActive ? 'pause-circle' : 'play-circle'}
                          size={18}
                          color={isCurrentAuthUser(user.id) ? '#9ca3af' : '#f59e0b'}
                        />
                        <Text
                          style={[
                            styles.actionButtonText,
                            isCurrentAuthUser(user.id) && styles.actionButtonDisabled,
                          ]}
                        >
                          {user.isActive ? t('Disable') : t('Enable')}
                        </Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDeleteUser(user)}
                        disabled={isCurrentAuthUser(user.id)}
                      >
                        <Ionicons
                          name="trash"
                          size={18}
                          color={isCurrentAuthUser(user.id) ? '#9ca3af' : '#ef4444'}
                        />
                        <Text
                          style={[
                            styles.actionButtonText,
                            styles.actionButtonDanger,
                            isCurrentAuthUser(user.id) && styles.actionButtonDisabled,
                          ]}
                        >
                          {t('Delete')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={isBackupOptionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsBackupOptionsVisible(false)}
      >
        <View style={styles.backupModalOverlay}>
          <View style={styles.backupModalCard}>
            <Text style={styles.backupModalTitle}>{t('Inventory Backup')}</Text>
            <Text style={styles.backupModalSubtitle}>
              {t('Choose where to save your inventory backup.')}
            </Text>
            <Text style={styles.backupModalLabel}>{t('File Name')}</Text>
            <TextInput
              style={styles.backupModalInput}
              value={backupFileName}
              onChangeText={setBackupFileName}
              placeholder={t('e.g., inventory-aug.json')}
            />
            <Text style={styles.backupModalHint}>
              {t('Give this file a descriptive name so you can find it later.')}
            </Text>
            <Text style={styles.backupModalTip}>
              {t('Tip: Select your Downloads folder when prompted.')}
            </Text>
            <View style={styles.backupModalActions}>
              <Button
                style={styles.backupModalPrimary}
                onPress={handleSaveBackupToDevice}
                disabled={isSavingBackupToDevice}
              >
                {isSavingBackupToDevice ? (
                  <View style={styles.buttonLoading}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.backupModalPrimaryText}>{t('Saving...')}</Text>
                  </View>
                ) : (
                  <Text style={styles.backupModalPrimaryText}>{t('Save to Device')}</Text>
                )}
              </Button>
              <Button
                variant="outline"
                style={styles.backupModalSecondary}
                onPress={handleExportData}
                disabled={isExporting}
              >
                {isExporting ? (
                  <View style={styles.buttonLoading}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.backupModalSecondaryText}>{t('Preparing...')}</Text>
                  </View>
                ) : (
                  <Text style={styles.backupModalSecondaryText}>{t('Share Backup')}</Text>
                )}
              </Button>
            </View>
            <Button variant="ghost" onPress={() => setIsBackupOptionsVisible(false)}>
              {t('Cancel')}
            </Button>
          </View>
        </View>
      </Modal>

      {/* User Form Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingUser ? t('Edit User') : t('Add New User')}
              </Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView
              style={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.modalContentInner}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('Name')}</Text>
              <TextInput
                style={styles.formInput}
                value={formName}
                onChangeText={setFormName}
                placeholder={t('Enter name')}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('Email')}</Text>
              <TextInput
                style={styles.formInput}
                value={formEmail}
                onChangeText={setFormEmail}
                placeholder={t('Enter email')}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('Phone')}</Text>
              <TextInput
                style={styles.formInput}
                value={formPhone}
                onChangeText={setFormPhone}
                placeholder={t('Enter phone')}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                {t('PIN')} {editingUser ? t('(leave blank to keep current)') : ''}
              </Text>
              <TextInput
                style={styles.formInput}
                value={formPin}
                onChangeText={(value) => setFormPin(value.replace(/\D/g, '').slice(0, 6))}
                placeholder={editingUser ? t('Enter new PIN') : t('Enter PIN')}
                keyboardType="number-pad"
                secureTextEntry={!showPin}
                maxLength={6}
              />
              <TouchableOpacity
                style={styles.pinToggle}
                onPress={() => setShowPin((prev) => !prev)}
              >
                <View style={[styles.checkbox, showPin && styles.checkboxChecked]}>
                  {showPin && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.pinToggleText}>{t('Show PIN')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('Role')}</Text>
              <View style={styles.roleButtons}>
                {roles.map((role) => (
                  <TouchableOpacity
                    key={role.id}
                    style={[
                      styles.roleButton,
                      formRoleId === role.id && styles.roleButtonActive,
                    ]}
                    onPress={() => setFormRoleId(role.id)}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        formRoleId === role.id && styles.roleButtonTextActive,
                      ]}
                    >
                      {formatRoleLabel(role.name)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {editingUser && (
              <View style={styles.formGroup}>
                <TouchableOpacity
                  style={styles.statusToggle}
                  onPress={() => setFormActive(!formActive)}
                >
                  <View style={styles.statusToggleLeft}>
                    <Ionicons
                      name={formActive ? 'checkmark-circle' : 'close-circle'}
                      size={24}
                      color={formActive ? '#10b981' : '#ef4444'}
                    />
                    <Text style={styles.statusToggleText}>
                      {formActive ? t('Active') : t('Inactive')}
                    </Text>
                  </View>
                  <Text style={styles.statusToggleHint}>{t('Tap to toggle')}</Text>
                </TouchableOpacity>
              </View>
            )}
                </View>
              </TouchableWithoutFeedback>
          </ScrollView>

            <View style={styles.modalFooter}>
              <Button variant="outline" onPress={() => setModalVisible(false)} style={styles.modalButton}>
                {t('Cancel')}
              </Button>
              <Button onPress={handleSaveUser} style={styles.modalButton}>
                {editingUser ? t('Update User') : t('Create User')}
              </Button>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#2563eb',
  },
  headerTitle: {
    ...textStyles.screenTitle,
    color: '#ffffff',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...textStyles.sectionTitle,
  },
  sectionHelper: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    marginBottom: 10,
  },
  addButton: {
    padding: spacing.xs,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  profitSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  profitSummaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profitSummaryIconReceive: {
    backgroundColor: '#dcfce7',
  },
  profitSummaryContent: {
    flex: 1,
  },
  profitSummaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  profitSummaryValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  profitSummaryMode: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  profitSummaryHint: {
    fontSize: 12,
    color: '#94a3b8',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  userRole: {
    fontSize: 14,
    color: '#64748b',
  },
  logoutButton: {
    marginTop: 8,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  languageButton: {
    flex: 1,
    minWidth: '48%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  languageButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  languageText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  languageTextActive: {
    color: '#ffffff',
  },
  shopInput: {
    backgroundColor: '#eff6ff',
    borderColor: '#dbeafe',
  },
  shopSaveButton: {
    marginTop: 8,
  },
  shopSaveButtonDisabled: {
    backgroundColor: '#e5edff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  shopSaveTextDisabled: {
    color: '#2563eb',
    opacity: 0.75,
  },
  maintenanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    marginBottom: 16,
  },
  maintenanceCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  maintenanceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  maintenanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  maintenanceMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748b',
  },
  autoBackupCard: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: spacing.sm,
  },
  autoBackupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  autoBackupHeaderText: {
    flex: 1,
  },
  autoBackupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  autoBackupStatus: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  autoBackupToggle: {
    marginLeft: 12,
  },
  autoBackupDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  autoBackupOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  autoBackupChip: {
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  autoBackupChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  autoBackupChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  autoBackupChipTextActive: {
    color: '#ffffff',
  },
  cacheScheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cacheScheduleText: {
    flex: 1,
    gap: spacing.xs,
  },
  cacheScheduleDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  toggleSwitchContainer: {
    paddingLeft: 8,
  },
  systemSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 8,
  },
  systemCard: {
    flex: 1,
    minWidth: 280,
    maxWidth: 400,
    borderRadius: radii.lg,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: spacing.xl,
    gap: spacing.md,
  },
  systemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  systemIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  systemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  systemSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  systemButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  systemButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  systemActions: {
    gap: 8,
  },
  systemButtonSecondary: {
    borderColor: '#2563eb',
  },
  systemButtonSecondaryOutline: {
    borderColor: '#2563eb',
    backgroundColor: '#ffffff',
  },
  systemButtonSecondaryDangerOutline: {
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },
  systemActionsColumn: {
    gap: 8,
  },
  systemButtonSecondaryFull: {
    borderColor: '#2563eb',
  },
  systemButtonSecondaryDanger: {
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
  },
  systemButtonSecondaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
    textAlign: 'center',
  },
  systemButtonSecondaryDangerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
    textAlign: 'center',
  },
  downloadsAccessButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 8,
  },
  downloadsAccessText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  clearInventoryButton: {
    alignSelf: 'flex-start',
    borderColor: '#dc2626',
    marginBottom: 12,
  },
  dangerNote: {
    marginTop: -4,
    marginBottom: 10,
    fontSize: 12,
    color: '#b91c1c',
  },
  backupLocationCard: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.lg - 2,
    borderRadius: radii.lg,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  backupLocationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e1b4b',
    marginBottom: 4,
  },
  backupLocationLine: {
    fontSize: 13,
    color: '#3730a3',
  },
  shareBackupButton: {
    marginTop: 10,
    borderColor: '#2563eb',
  },
  buttonLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    textAlign: 'center',
    color: '#64748b',
    padding: spacing.xl,
  },
  usersList: {
    gap: spacing.md,
  },
  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  userCardInfo: {
    flex: 1,
  },
  userCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  userCardRole: {
    fontSize: 14,
    color: '#64748b',
  },
  userCardContact: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  userCardContactText: {
    fontSize: 13,
    color: '#64748b',
  },
  userCardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: '#f8fafc',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#2563eb',
  },
  actionButtonDanger: {
    color: '#ef4444',
  },
  actionButtonDisabled: {
    color: '#9ca3af',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  modalContentInner: {
    flex: 1,
  },
  formGroup: {
    marginBottom: spacing.xl,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: spacing.sm,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  pinToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  pinToggleText: {
    fontSize: 13,
    color: '#334155',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  roleButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  roleButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  roleButtonTextActive: {
    color: '#ffffff',
  },
  statusToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  statusToggleHint: {
    fontSize: 13,
    color: '#64748b',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  modalButton: {
    flex: 1,
  },
  backupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  backupModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radii.lg,
    backgroundColor: '#ffffff',
    padding: spacing.xl,
    gap: spacing.md,
  },
  backupModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  backupModalSubtitle: {
    fontSize: 14,
    color: '#475569',
  },
  backupModalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  backupModalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  backupModalHint: {
    fontSize: 13,
    color: '#475569',
  },
  backupModalTip: {
    fontSize: 12,
    color: '#2563eb',
  },
  backupModalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  backupModalPrimary: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
  },
  backupModalSecondary: {
    flex: 1,
    borderRadius: 10,
    borderColor: '#c7d2fe',
  },
  backupModalPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  backupModalSecondaryText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  biometricOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  biometricOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  biometricIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  biometricTextContainer: {
    flex: 1,
  },
  biometricTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  biometricTitleDisabled: {
    color: '#94a3b8',
  },
  biometricSubtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  biometricToggle: {
    marginLeft: 12,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#cbd5e1',
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: '#2563eb',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobActive: {
    transform: [{ translateX: 20 }],
  },
});
