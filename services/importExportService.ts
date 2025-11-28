import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import Papa from 'papaparse';
import { Buffer } from 'buffer';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { db } from '../lib/database';
import { supabase } from '../lib/supabaseClient';
import {
  readAsStringAsync,
  writeAsStringAsync,
  documentDirectory,
  cacheDirectory,
  EncodingType,
  StorageAccessFramework,
} from 'expo-file-system/legacy';

const EXPORT_TASK = 'pos-export-task';
const EXPORT_BUCKET = process.env.EXPO_PUBLIC_SUPABASE_EXPORT_BUCKET || 'pos-exports';
const INVENTORY_BACKUP_DIR_KEY = 'inventory.downloadDirUri';
const INVENTORY_BACKUP_META_KEY = 'inventory.lastBackupMeta';
const DOWNLOAD_DIR_NAME = 'Download';
const INVENTORY_SNAPSHOT_VERSION = 2;
const INVENTORY_FILE_EXTENSION = '.json';
const SNAPSHOT_MIME_TYPE = 'application/json';
const canScheduleBackgroundTasks = Platform.OS !== 'web' && Constants.appOwnership !== 'expo';
let exportTaskDefined = false;

type CsvRow = Record<string, string | number | null>;

type ExportableVariant = {
  id: number;
  name: string;
  design?: string;
  size?: string;
  color?: string;
  material?: string;
  price: number;
  stock: number;
  minStock: number;
  barcode?: string;
  costPrice: number;
  customAttributeLabel?: string;
  customAttributeValue?: string;
};

type ExportableProduct = {
  name: string;
  category: string;
  hasVariants: boolean;
  variants?: ExportableVariant[];
  price: number | null;
  stock: number | null;
  minStock: number | null;
  barcode: string | null;
  unit: string | null;
  costPrice: number | null;
};

type InventorySnapshot = {
  version: number;
  exportedAt: string;
  source: 'local' | 'remote';
  productCount: number;
  products: ExportableProduct[];
};

type ExportSnapshotOptions = {
  interactive?: boolean;
};

function ensureExportTaskDefinition() {
  if (!canScheduleBackgroundTasks || exportTaskDefined) {
    return;
  }
  try {
    TaskManager.defineTask(EXPORT_TASK, async () => {
      try {
        await exportDataSnapshot(undefined, { interactive: false });
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.warn('Scheduled export failed', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
    exportTaskDefined = true;
  } catch (error) {
    console.warn('Failed to define export task:', error);
  }
}

ensureExportTaskDefinition();

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str.length ? str : null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toNumberWithFallback = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parseVariantsPayload = (value: unknown): any[] | undefined => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const sanitizeVariant = (variant: any, fallbackId: number): ExportableVariant | null => {
  if (!variant || typeof variant !== 'object') {
    return null;
  }

  const name = String(variant.name ?? '').trim();
  if (!name) {
    return null;
  }

  const parsedId = Number((variant.id ?? fallbackId));
  const id = Number.isFinite(parsedId) ? parsedId : fallbackId;

  return {
    id,
    name,
    design: toNullableString(variant.design) ?? undefined,
    size: toNullableString(variant.size) ?? undefined,
    color: toNullableString(variant.color) ?? undefined,
    material: toNullableString(variant.material) ?? undefined,
    price: toNumberWithFallback(variant.price),
    stock: toNumberWithFallback(variant.stock),
    minStock: toNumberWithFallback(variant.minStock),
    barcode: toNullableString(variant.barcode) ?? undefined,
    costPrice: toNumberWithFallback(variant.costPrice),
    customAttributeLabel: toNullableString(variant.customAttributeLabel) ?? undefined,
    customAttributeValue: toNullableString(variant.customAttributeValue) ?? undefined,
  };
};

const sanitizeProductRecord = (product: any): ExportableProduct | null => {
  if (!product || typeof product !== 'object') {
    return null;
  }

  const name = String(product.name ?? '').trim();
  if (!name) {
    return null;
  }

  const category = String(product.category ?? '').trim() || 'General';
  const variantPayload = parseVariantsPayload(product.variants);
  const normalizedVariants = (variantPayload ?? [])
    .map((variant, index) => sanitizeVariant(variant, index + 1))
    .filter((variant): variant is ExportableVariant => Boolean(variant));

  const rawHasVariants =
    typeof product.hasVariants === 'string'
      ? product.hasVariants.toLowerCase() === 'true'
      : Boolean(product.hasVariants);

  const hasVariants = rawHasVariants || normalizedVariants.length > 0;

  return {
    name,
    category,
    hasVariants,
    variants: hasVariants && normalizedVariants.length ? normalizedVariants : undefined,
    price: toNullableNumber(product.price),
    stock: toNullableNumber(product.stock),
    minStock: toNullableNumber(product.minStock),
    barcode: toNullableString(product.barcode),
    unit: toNullableString(product.unit),
    costPrice: toNullableNumber(product.costPrice),
  };
};

const normalizeProductsForExport = (products: any[]): ExportableProduct[] => {
  return products
    .map(sanitizeProductRecord)
    .filter((product): product is ExportableProduct => Boolean(product));
};

const serializeInventorySnapshot = (snapshot: InventorySnapshot) =>
  JSON.stringify(snapshot, null, 2);

const getStoredBackupDirectory = async (): Promise<string | null> => {
  const value = (await db.getSetting(INVENTORY_BACKUP_DIR_KEY)) as string | null;
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const persistBackupDirectory = (uri: string | null) =>
  db.setSetting(INVENTORY_BACKUP_DIR_KEY, uri);

type InventoryBackupMeta = {
  fileName: string;
  savedAt: string;
  uri: string;
  location: 'downloads' | 'internal';
};

const persistLastBackupMeta = (meta: InventoryBackupMeta) =>
  db.setSetting(INVENTORY_BACKUP_META_KEY, meta);

export const getLastInventoryBackupMeta = async () => {
  const meta = (await db.getSetting(INVENTORY_BACKUP_META_KEY)) as InventoryBackupMeta | null;
  return meta ?? null;
};

const getDownloadBaseUri = () => {
  if (!StorageAccessFramework?.getUriForDirectoryInRoot) {
    return undefined;
  }
  try {
    return StorageAccessFramework.getUriForDirectoryInRoot(DOWNLOAD_DIR_NAME);
  } catch (error) {
    console.warn('[InventoryBackup] Failed to resolve downloads directory', error);
    return undefined;
  }
};

const requestDownloadsDirectoryPermissions = async (): Promise<string> => {
  if (!StorageAccessFramework?.requestDirectoryPermissionsAsync) {
    throw new Error('E_SAF_UNAVAILABLE');
  }

  const initialUri = getDownloadBaseUri();
  const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
  if (!permissions.granted || !permissions.directoryUri) {
    throw new Error('E_SAF_PERMISSION');
  }

  // Try to persist permissions if available
  try {
    if (typeof (StorageAccessFramework as any).persistPermissionsAsync === 'function') {
      await (StorageAccessFramework as any).persistPermissionsAsync(permissions.directoryUri);
    }
  } catch (error) {
    console.warn('[InventoryBackup] Unable to persist SAF permission', error);
  }

  await persistBackupDirectory(permissions.directoryUri);
  return permissions.directoryUri;
};

export const promptForDownloadsDirectory = async () => {
  try {
    const uri = await requestDownloadsDirectoryPermissions();
    return { granted: true, uri };
  } catch (error) {
    if ((error as Error)?.message === 'E_SAF_UNAVAILABLE') {
      return { granted: false, reason: 'unavailable' as const };
    }
    if ((error as Error)?.message === 'E_SAF_PERMISSION') {
      return { granted: false, reason: 'permission' as const };
    }
    throw error;
  }
};

const ensureDownloadsDirectory = async (): Promise<string | null> => {
  if (!StorageAccessFramework?.requestDirectoryPermissionsAsync) {
    return null;
  }
  const stored = await getStoredBackupDirectory();
  if (stored) {
    return stored;
  }
  try {
    return await requestDownloadsDirectoryPermissions();
  } catch (error) {
    console.warn('[InventoryBackup] Directory permission not granted', error);
    return null;
  }
};

const isSafPermissionError = (error: unknown) => {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return (
    message.includes('permission') ||
    message.includes('eacces') ||
    message.includes('not allowed') ||
    message.includes('requires that you grant access') ||
    message.includes('document tree has become invalid')
  );
};

export async function importProductsFromCsv(preselectedUri?: string) {
  let targetUri = preselectedUri ?? null;
  let fileLabel: string | undefined;

  if (!targetUri) {
    const pickerResult = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: '*/*',
    });

    const pickerCancelled =
      (typeof pickerResult.canceled === 'boolean' && pickerResult.canceled) ||
      ((pickerResult as any).type === 'cancel');

    if (pickerCancelled) {
      return null;
    }

    const asset =
      pickerResult.assets?.[0] ||
      ((pickerResult as any).type === 'success'
        ? {
            uri: (pickerResult as any).uri,
            name: (pickerResult as any).name ?? 'inventory-backup.csv',
          }
        : null);

    if (!asset || !asset.uri) {
      return null;
    }

    targetUri = asset.uri;
    fileLabel = asset.name;
  } else {
    fileLabel = decodeURIComponent(targetUri.split('/').pop() ?? 'inventory-backup.csv');
  }

  if (!targetUri) {
    return null;
  }

  let fileContent: string;
  try {
    if (
      targetUri.startsWith('content://') &&
      StorageAccessFramework?.readAsStringAsync
    ) {
      fileContent = await StorageAccessFramework.readAsStringAsync(targetUri);
    } else {
      fileContent = await readAsStringAsync(targetUri, { encoding: EncodingType.UTF8 });
    }
  } catch (error) {
    if (isSafPermissionError(error)) {
      throw new Error('E_SAF_PERMISSION');
    }
    throw error;
  }

  const parsedBackup = parseInventoryBackupContent(fileContent);
  if (!parsedBackup.products.length) {
    throw new Error('E_EMPTY_BACKUP');
  }

  await db.runInTransaction(async (connection) => {
    await connection.execAsync('DELETE FROM products');
    for (const product of parsedBackup.products) {
      await db.addProduct(product, { connection });
    }
  });

  return { imported: parsedBackup.products.length, fileName: fileLabel };
}

type ParsedInventoryBackup = {
  products: ExportableProduct[];
  format: 'json' | 'csv';
};

const tryParseJsonInventory = (payload: string): ExportableProduct[] | null => {
  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed)) {
      return normalizeProductsForExport(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray((parsed as any).products)) {
        return normalizeProductsForExport((parsed as any).products);
      }
      if (Array.isArray((parsed as any).payload?.products)) {
        return normalizeProductsForExport((parsed as any).payload.products);
      }
    }
  } catch {
    return null;
  }
  return null;
};

const parseInventoryBackupContent = (fileContent: string): ParsedInventoryBackup => {
  const trimmed = fileContent.trim();
  if (!trimmed) {
    return { products: [], format: 'json' };
  }

  const jsonProducts = tryParseJsonInventory(trimmed);
  if (jsonProducts) {
    return { products: jsonProducts, format: 'json' };
  }

  const parsed = Papa.parse<CsvRow>(fileContent, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    const err = parsed.errors[0];
    throw new Error(`E_PARSE_CSV: ${err.message ?? 'Unable to parse CSV'}`);
  }

  const csvProducts = normalizeProductsForExport(parsed.data);
  return { products: csvProducts, format: 'csv' };
};

async function buildInventorySnapshot(): Promise<InventorySnapshot> {
  let source: 'local' | 'remote' = 'local';
  let remoteProducts: any[] | undefined;

  if (supabase) {
    const snapshot = await supabase
      .from(process.env.EXPO_PUBLIC_SUPABASE_SNAPSHOT_TABLE || 'pos_sync_snapshots')
      .select('payload')
      .eq('company_key', process.env.EXPO_PUBLIC_SUPABASE_COMPANY_KEY || 'default')
      .maybeSingle();

    if (!snapshot.error) {
      const payload = snapshot.data?.payload;
      if (payload && Array.isArray(payload.products)) {
        remoteProducts = payload.products;
        source = 'remote';
      }
    } else {
      console.warn('Unable to read remote snapshot before export', snapshot.error);
    }
  }

  const localData = await db.getAllProducts();
  const products = normalizeProductsForExport(remoteProducts ?? localData);
  return {
    version: INVENTORY_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    source,
    productCount: products.length,
    products,
  };
}

function sanitizeFileName(name?: string) {
  const fallback = `inventory-backup-${new Date().toISOString().split('T')[0]}${INVENTORY_FILE_EXTENSION}`;
  if (!name) {
    return fallback;
  }
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
  if (!trimmed) {
    return fallback;
  }
  return trimmed.toLowerCase().endsWith(INVENTORY_FILE_EXTENSION)
    ? trimmed
    : `${trimmed}${INVENTORY_FILE_EXTENSION}`;
}

const isInventoryBackupFile = (uri: string) => {
  const lower = uri.toLowerCase();
  return lower.endsWith(INVENTORY_FILE_EXTENSION) || lower.endsWith('.csv');
};

export async function exportDataSnapshot(fileName?: string, options?: ExportSnapshotOptions) {
  const interactive = options?.interactive ?? true;
  const snapshot = await buildInventorySnapshot();
  const serialized = serializeInventorySnapshot(snapshot);
  const sanitizedName = sanitizeFileName(fileName);
  const exportDir = (documentDirectory ?? cacheDirectory ?? '').replace(/\/?$/, '/');
  const fileUri = `${exportDir}${sanitizedName}`;

  await writeAsStringAsync(fileUri, serialized, { encoding: EncodingType.UTF8 });

  if (supabase) {
    const baseName = fileUri.split('/').pop();
    if (baseName) {
      const fileContent = await readAsStringAsync(fileUri, {
        encoding: EncodingType.Base64,
      });
      const { error } = await supabase.storage
        .from(EXPORT_BUCKET)
        .upload(baseName, Buffer.from(fileContent, 'base64'), {
          contentType: SNAPSHOT_MIME_TYPE,
          upsert: true,
        });
      if (error) {
        console.warn('Failed to upload export to Supabase storage', error);
      }
    }
  }

  if (interactive && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(fileUri, { mimeType: SNAPSHOT_MIME_TYPE });
  }

  return fileUri;
}

type ExportLocation = 'downloads' | 'internal';

export async function exportInventorySnapshotToDevice(
  fileName?: string
): Promise<{ uri: string; location: ExportLocation; fileName: string }> {
  const snapshot = await buildInventorySnapshot();
  const serialized = serializeInventorySnapshot(snapshot);
  const sanitizedName = sanitizeFileName(fileName);

  const saveToDownloads = async (): Promise<string | null> => {
    if (
      Platform.OS !== 'android' ||
      !StorageAccessFramework ||
      typeof StorageAccessFramework.requestDirectoryPermissionsAsync !== 'function'
    ) {
      return null;
    }

    const writeToDir = async (dirUri: string) => {
      const uri = await StorageAccessFramework.createFileAsync(
        dirUri,
        sanitizedName,
        SNAPSHOT_MIME_TYPE
      );
      await writeAsStringAsync(uri, serialized, { encoding: EncodingType.UTF8 });
      return uri;
    };

    let directoryUri = await ensureDownloadsDirectory();
    if (!directoryUri) {
      throw new Error('E_SAF_PERMISSION');
    }
    try {
      return await writeToDir(directoryUri);
    } catch (error) {
      if (isSafPermissionError(error)) {
        await persistBackupDirectory(null);
        directoryUri = await requestDownloadsDirectoryPermissions();
        return await writeToDir(directoryUri);
      }
      throw error;
    }
  };

  try {
    const downloadsUri = await saveToDownloads();
    if (downloadsUri) {
      const meta = {
        uri: downloadsUri,
        location: 'downloads' as ExportLocation,
        fileName: sanitizedName,
        savedAt: new Date().toISOString(),
      };
      await persistLastBackupMeta(meta);
      return meta;
    }
  } catch (error) {
    if ((error as Error)?.message === 'E_SAF_PERMISSION') {
      throw error;
    }
    console.warn('[InventoryBackup] Save to Downloads failed, falling back', error);
  }

  const exportDir = (documentDirectory ?? cacheDirectory ?? '').replace(/\/?$/, '/');
  const fallbackUri = `${exportDir}${sanitizedName}`;
  await writeAsStringAsync(fallbackUri, serialized, { encoding: EncodingType.UTF8 });
  const fallbackMeta = {
    uri: fallbackUri,
    location: 'internal' as ExportLocation,
    fileName: sanitizedName,
    savedAt: new Date().toISOString(),
  };
  await persistLastBackupMeta(fallbackMeta);
  return fallbackMeta;
}

export async function getLatestInventoryBackupFromDownloads() {
  if (
    Platform.OS !== 'android' ||
    !StorageAccessFramework ||
    typeof StorageAccessFramework.readDirectoryAsync !== 'function'
  ) {
    return null;
  }
  const directoryUri = await getStoredBackupDirectory();
  if (!directoryUri) {
    return null;
  }
  try {
    const entries = await StorageAccessFramework.readDirectoryAsync(directoryUri);
    const backupEntries = entries.filter((uri) => isInventoryBackupFile(uri));
    if (!backupEntries.length) {
      return null;
    }
    const latestUri = backupEntries.slice().sort().pop()!;
    return {
      uri: latestUri,
      name: decodeURIComponent(
        latestUri.split('/').pop() ?? `inventory-backup${INVENTORY_FILE_EXTENSION}`
      ),
    };
  } catch (error) {
    if (isSafPermissionError(error)) {
      await persistBackupDirectory(null);
    }
    console.warn('[InventoryBackup] Failed to enumerate saved backups', error);
    return null;
  }
}

export async function registerExportTask(intervalHours = 24) {
  if (!canScheduleBackgroundTasks) {
    return;
  }
  ensureExportTaskDefinition();
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(EXPORT_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(EXPORT_TASK, {
        minimumInterval: intervalHours * 3600,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (error) {
    console.warn('Failed to register export task:', error);
    // Don't throw - this is a non-critical feature
  }
}

export async function unregisterExportTask() {
  if (!canScheduleBackgroundTasks) {
    return;
  }
  const isRegistered = await TaskManager.isTaskRegisteredAsync(EXPORT_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(EXPORT_TASK);
  }
}
