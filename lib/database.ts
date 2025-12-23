import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { 
  deleteAsync, 
  getInfoAsync, 
  makeDirectoryAsync, 
  readAsStringAsync,
  writeAsStringAsync,
  readDirectoryAsync,
  documentDirectory,
  copyAsync,
  StorageAccessFramework,
  EncodingType,
} from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import * as SQLite from 'expo-sqlite';
import type { PrinterCutMode, PrinterEncoding, PrinterType } from '../types/printer';

const DB_NAME = 'pos_hardware_shop.db';
const BACKUP_DIRECTORY_NAME = 'POSBackups';

export const DATABASE_NAME = DB_NAME;
export const BACKUP_DIRECTORY = BACKUP_DIRECTORY_NAME;

type PermissionSet = Record<string, boolean>;

const DEFAULT_ROLES: Array<{ name: string; permissions: PermissionSet }> = [
  {
    name: 'manager',
    permissions: {
      processSales: true,
      manageInventory: true,
      adjustStock: true,
      manageCustomers: true,
      manageVendors: true,
      viewReports: true,
      manageExpenditures: true,
      managePurchases: true,
      manageSettings: true,
      manageUsers: true,
      dataExport: true,
      dataImport: true,
      manageBackups: true,
    },
  },
  {
    name: 'cashier',
    permissions: {
      processSales: true,
      manageInventory: false,
      adjustStock: false,
      manageCustomers: true,
      manageVendors: false,
      viewReports: false,
      manageExpenditures: false,
      managePurchases: false,
      manageSettings: false,
      manageUsers: false,
      dataExport: false,
      dataImport: false,
      manageBackups: false,
    },
  },
];

type RoleRecord = {
  id: number;
  name: string;
  permissions: PermissionSet;
  createdAt: string;
};

type UserRecord = {
  id: number;
  remoteId?: string | null;
  email?: string | null;
  phone?: string | null;
  name: string;
  pinHash?: string | null;
  biometricEnabled: boolean;
  roleId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
};

type SessionRecord = {
  id: number;
  userId: number;
  deviceId?: string | null;
  token: string;
  createdAt: string;
  expiresAt: string;
};

type SyncOutboxRecord = {
  id: number;
  entity: string;
  entityId: string;
  payload: any;
  action: string;
  status: string;
  error?: string | null;
  retries: number;
  createdAt: string;
  updatedAt: string;
};

type SyncStateRecord = {
  id: number;
  entity: string;
  lastPulledAt?: string | null;
  lastPushedAt?: string | null;
  version?: string | null;
};

type BackupLogRecord = {
  id: number;
  path: string;
  type: string;
  provider?: string | null;
  metadata?: any;
  uploaded: boolean;
  createdAt: string;
};

type ImportJobRecord = {
  id: number;
  type: string;
  status: string;
  summary?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

type PrinterProfileRecord = {
  id: string;
  name: string;
  type: PrinterType;
  ip: string;
  port: number;
  paperWidthMM: 58 | 80;
  encoding: PrinterEncoding;
  codePage: number;
  cutMode: PrinterCutMode;
  drawerKick: boolean;
  bitmapFallback: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type PrintJobRecord = {
  id: number;
  profileId?: string | null;
  type: string;
  payload: any;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
};

function mapRoleRow(row: any): RoleRecord {
  return {
    id: row.id,
    name: row.name,
    permissions: safeParseJSON<PermissionSet>(row.permissions, {
      fallback: {},
      context: `roles.${row.name}`,
    }),
    createdAt: row.createdAt,
  };
}

function mapUserRow(row: any): UserRecord {
  return {
    id: row.id,
    remoteId: row.remoteId,
    email: row.email,
    phone: row.phone,
    name: row.name,
    pinHash: row.pinHash,
    biometricEnabled: Boolean(row.biometricEnabled),
    roleId: row.roleId,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastLoginAt: row.lastLoginAt,
  };
}

function mapSyncOutboxRow(row: any): SyncOutboxRecord {
  return {
    id: row.id,
    entity: row.entity,
    entityId: row.entityId,
    payload: safeParseJSON<any>(row.payload, {
      fallback: {},
      context: `sync.outbox.${row.entity}.${row.entityId}`,
    }),
    action: row.action,
    status: row.status,
    error: row.error,
    retries: row.retries,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSyncStateRow(row: any): SyncStateRecord {
  return {
    id: row.id,
    entity: row.entity,
    lastPulledAt: row.lastPulledAt,
    lastPushedAt: row.lastPushedAt,
    version: row.version,
  };
}

function mapBackupLogRow(row: any): BackupLogRecord {
  return {
    id: row.id,
    path: row.path,
    type: row.type,
    provider: row.provider,
    metadata: safeParseJSON<any>(row.metadata, {
      fallback: null,
      context: `backupLogs.${row.id}`,
    }),
    uploaded: Boolean(row.uploaded),
    createdAt: row.createdAt,
  };
}

function mapImportJobRow(row: any): ImportJobRecord {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    summary: row.summary,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function mapPrinterProfileRow(row: any): PrinterProfileRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type as PrinterType,
    ip: row.ip,
    port: row.port,
    paperWidthMM: row.paperWidthMM,
    encoding: row.encoding as PrinterEncoding,
    codePage: row.codePage,
    cutMode: row.cutMode as PrinterCutMode,
    drawerKick: Boolean(row.drawerKick),
    bitmapFallback: Boolean(row.bitmapFallback),
    isDefault: Boolean(row.isDefault),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPrintJobRow(row: any): PrintJobRecord {
  return {
    id: row.id,
    profileId: row.profileId,
    type: row.type,
    payload: safeParseJSON<any>(row.payload, {
      fallback: {},
      context: `print_jobs.${row.id}`,
    }),
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastAttemptAt: row.lastAttemptAt,
    nextAttemptAt: row.nextAttemptAt,
  };
}

let db: SQLite.SQLiteDatabase | null = null;
let initializing: Promise<SQLite.SQLiteDatabase> | null = null;
let operationQueue: Promise<unknown> = Promise.resolve();

type OperationOptions = {
  connection?: SQLite.SQLiteDatabase;
};

function toBindParams(values: unknown[]): SQLite.SQLiteBindParams {
  return values as SQLite.SQLiteBindParams;
}

// Initialize database
export async function initDB(): Promise<SQLite.SQLiteDatabase> {
  if (db) {
    const isHealthy = await validateDatabaseHandle(db);
    if (isHealthy) {
      return db;
    }

    db = null;
  }

  if (!initializing) {
    initializing = openAndConfigureDatabase().finally(() => {
      initializing = null;
    });
  }

  return initializing;
}

async function openAndConfigureDatabase(): Promise<SQLite.SQLiteDatabase> {
  await ensureSQLiteDirectory();
  const database = await SQLite.openDatabaseAsync(DB_NAME);
  await configureDatabase(database);
  db = database;
  return database;
}

async function validateDatabaseHandle(database: SQLite.SQLiteDatabase): Promise<boolean> {
  try {
    await database.getFirstAsync('SELECT 1');
    return true;
  } catch (error) {
    if (isRecoverableSQLiteError(error)) {
      console.warn('SQLite connection became invalid, reopening database...', error);
      return false;
    }
    throw error;
  }
}

function isRecoverableSQLiteError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message ?? '';
  return (
    message.includes('NativeDatabase.prepareAsync') ||
    message.includes('database is closed') ||
    message.includes('NativeDatabase.runAsync')
  );
}

async function configureDatabase(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      hasVariants INTEGER NOT NULL,
      variants TEXT,
      price REAL,
      stock INTEGER,
      minStock INTEGER,
      barcode TEXT,
      unit TEXT,
      costPrice REAL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT,
      note TEXT,
      totalPurchases REAL DEFAULT 0,
      lastPurchase TEXT,
      credit REAL DEFAULT 0,
      dueAmount REAL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer TEXT,
      cart TEXT NOT NULL,
      subtotal REAL NOT NULL,
      taxRate REAL NOT NULL,
      tax REAL NOT NULL,
      total REAL NOT NULL,
      creditUsed REAL DEFAULT 0,
      amountAfterCredit REAL NOT NULL,
      paidAmount REAL NOT NULL,
      changeAmount REAL DEFAULT 0,
      remainingBalance REAL DEFAULT 0,
      paymentMethod TEXT NOT NULL,
      dueDate TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL,
      items INTEGER NOT NULL,
      amount REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

    CREATE TABLE IF NOT EXISTS creditTransactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customerId INTEGER NOT NULL,
      customerName TEXT NOT NULL,
      customerPhone TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      description TEXT NOT NULL,
      linkedSaleId INTEGER,
      FOREIGN KEY (customerId) REFERENCES customers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_credit_customer ON creditTransactions(customerId);

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT,
      company TEXT,
      address TEXT,
      note TEXT,
      totalPurchases REAL DEFAULT 0,
      lastPurchase TEXT,
      payable REAL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_vendors_phone ON vendors(phone);

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor TEXT,
      items TEXT NOT NULL,
      subtotal REAL NOT NULL,
      taxRate REAL NOT NULL,
      tax REAL NOT NULL,
      total REAL NOT NULL,
      paidAmount REAL NOT NULL,
      remainingBalance REAL DEFAULT 0,
      paymentMethod TEXT NOT NULL,
      invoiceNumber TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
    CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);

    CREATE TABLE IF NOT EXISTS expenditures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jazzCashTransactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow TEXT NOT NULL,
      customerName TEXT NOT NULL,
      customerPhone TEXT NOT NULL,
      customerCnic TEXT NOT NULL,
      amount REAL NOT NULL,
      baseAmount REAL NOT NULL DEFAULT 0,
      profitAmount REAL NOT NULL DEFAULT 0,
      note TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ownerFundTransactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_expenditures_date ON expenditures(date);
    CREATE INDEX IF NOT EXISTS idx_expenditures_category ON expenditures(category);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS printer_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      ip TEXT NOT NULL,
      port INTEGER NOT NULL,
      paperWidthMM INTEGER NOT NULL,
      encoding TEXT NOT NULL,
      codePage INTEGER NOT NULL,
      cutMode TEXT NOT NULL,
      drawerKick INTEGER NOT NULL DEFAULT 0,
      bitmapFallback INTEGER NOT NULL DEFAULT 0,
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_printer_profiles_default ON printer_profiles(isDefault);

    CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profileId TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      maxAttempts INTEGER NOT NULL DEFAULT 3,
      lastError TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      lastAttemptAt TEXT,
      nextAttemptAt TEXT,
      FOREIGN KEY (profileId) REFERENCES printer_profiles(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_next_attempt ON print_jobs(nextAttemptAt);

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      permissions TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remoteId TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      name TEXT NOT NULL,
      pinHash TEXT,
      biometricEnabled INTEGER NOT NULL DEFAULT 0,
      roleId INTEGER NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      lastLoginAt TEXT,
      FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      deviceId TEXT,
      token TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL,
      entityId TEXT NOT NULL,
      payload TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      retries INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_entity ON sync_outbox(entity);

    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT NOT NULL UNIQUE,
      lastPulledAt TEXT,
      lastPushedAt TEXT,
      version TEXT
    );

    CREATE TABLE IF NOT EXISTS backup_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      type TEXT NOT NULL,
      provider TEXT,
      metadata TEXT,
      uploaded INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      completedAt TEXT
    );
  `);
  await ensureJazzCashProfitColumns(database);
  await ensureCustomerColumns(database);
  await ensureVendorColumns(database);
  await ensurePurchaseColumns(database);
}

async function ensureJazzCashProfitColumns(database: SQLite.SQLiteDatabase) {
  const existingColumns = (await database.getAllAsync(
    `PRAGMA table_info(jazzCashTransactions)`
  )) as Array<{ name?: string }>;
  const hasColumn = (name: string) =>
    existingColumns.some((column) => column?.name === name);

  if (!hasColumn('baseAmount')) {
    await database.execAsync(
      `ALTER TABLE jazzCashTransactions ADD COLUMN baseAmount REAL NOT NULL DEFAULT 0`
    );
  }
  if (!hasColumn('profitAmount')) {
    await database.execAsync(
      `ALTER TABLE jazzCashTransactions ADD COLUMN profitAmount REAL NOT NULL DEFAULT 0`
    );
  }
}

async function ensureVendorColumns(database: SQLite.SQLiteDatabase) {
  const existingColumns = (await database.getAllAsync(
    `PRAGMA table_info(vendors)`
  )) as Array<{ name?: string }>;
  const hasColumn = (name: string) =>
    existingColumns.some((column) => column?.name === name);
  const addColumn = async (name: string, ddl: string) => {
    if (!hasColumn(name)) {
      await database.execAsync(ddl);
    }
  };

  await addColumn('email', `ALTER TABLE vendors ADD COLUMN email TEXT`);
  await addColumn('company', `ALTER TABLE vendors ADD COLUMN company TEXT`);
  await addColumn('address', `ALTER TABLE vendors ADD COLUMN address TEXT`);
  await addColumn('note', `ALTER TABLE vendors ADD COLUMN note TEXT`);
  await addColumn(
    'totalPurchases',
    `ALTER TABLE vendors ADD COLUMN totalPurchases REAL NOT NULL DEFAULT 0`
  );
  await addColumn('lastPurchase', `ALTER TABLE vendors ADD COLUMN lastPurchase TEXT`);
  await addColumn('payable', `ALTER TABLE vendors ADD COLUMN payable REAL NOT NULL DEFAULT 0`);
  await addColumn('imageUri', `ALTER TABLE vendors ADD COLUMN imageUri TEXT`);
}

async function ensureCustomerColumns(database: SQLite.SQLiteDatabase) {
  const existingColumns = (await database.getAllAsync(
    `PRAGMA table_info(customers)`
  )) as Array<{ name?: string }>;
  const hasColumn = (name: string) =>
    existingColumns.some((column) => column?.name === name);
  const addColumn = async (name: string, ddl: string) => {
    if (!hasColumn(name)) {
      await database.execAsync(ddl);
    }
  };

  await addColumn('imageUri', `ALTER TABLE customers ADD COLUMN imageUri TEXT`);
}

async function ensurePurchaseColumns(database: SQLite.SQLiteDatabase) {
  const existingColumns = (await database.getAllAsync(
    `PRAGMA table_info(purchases)`
  )) as Array<{ name?: string }>;
  const hasColumn = (name: string) =>
    existingColumns.some((column) => column?.name === name);
  const addColumn = async (name: string, ddl: string) => {
    if (!hasColumn(name)) {
      await database.execAsync(ddl);
    }
  };

  await addColumn('vendor', `ALTER TABLE purchases ADD COLUMN vendor TEXT`);
  await addColumn('items', `ALTER TABLE purchases ADD COLUMN items TEXT NOT NULL DEFAULT '[]'`);
  await addColumn('subtotal', `ALTER TABLE purchases ADD COLUMN subtotal REAL NOT NULL DEFAULT 0`);
  await addColumn('taxRate', `ALTER TABLE purchases ADD COLUMN taxRate REAL NOT NULL DEFAULT 0`);
  await addColumn('tax', `ALTER TABLE purchases ADD COLUMN tax REAL NOT NULL DEFAULT 0`);
  await addColumn('total', `ALTER TABLE purchases ADD COLUMN total REAL NOT NULL DEFAULT 0`);
  await addColumn('paidAmount', `ALTER TABLE purchases ADD COLUMN paidAmount REAL NOT NULL DEFAULT 0`);
  await addColumn(
    'remainingBalance',
    `ALTER TABLE purchases ADD COLUMN remainingBalance REAL NOT NULL DEFAULT 0`
  );
  await addColumn('paymentMethod', `ALTER TABLE purchases ADD COLUMN paymentMethod TEXT`);
  await addColumn('invoiceNumber', `ALTER TABLE purchases ADD COLUMN invoiceNumber TEXT`);
  await addColumn('date', `ALTER TABLE purchases ADD COLUMN date TEXT`);
  await addColumn('time', `ALTER TABLE purchases ADD COLUMN time TEXT`);
  await addColumn('status', `ALTER TABLE purchases ADD COLUMN status TEXT`);
  await addColumn('note', `ALTER TABLE purchases ADD COLUMN note TEXT`);
}

async function runDatabaseOperation<T>(
  operation: (database: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  const execute = async (): Promise<T> => {
    let attempts = 0;
    let database = await initDB();

    while (attempts < 2) {
      try {
        return await operation(database);
      } catch (error) {
        if (!isRecoverableSQLiteError(error)) {
          throw error;
        }

        attempts += 1;
        console.warn('Retrying database operation after recoverable error', error);

        try {
          if ('closeAsync' in database && typeof (database as any).closeAsync === 'function') {
            await (database as any).closeAsync();
          }
        } catch (closeError) {
          console.warn('Failed to close invalid database handle', closeError);
        }

        db = null;
        database = await initDB();
      }
    }

    throw new Error('Failed to execute database operation after retry');
  };

  const pending = operationQueue.then(execute, execute);
  operationQueue = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

async function executeWithConnection<T>(
  executor: (database: SQLite.SQLiteDatabase) => Promise<T>,
  connection?: SQLite.SQLiteDatabase
): Promise<T> {
  if (connection) {
    return executor(connection);
  }
  return runDatabaseOperation(executor);
}

async function ensureSQLiteDirectory() {
  await ensureDirectory('SQLite');
}

function safeParseJSON<T>(
  value: unknown,
  { fallback, context }: { fallback: T; context: string }
): T {
  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn(`Failed to parse JSON for ${context}`, error);
    return fallback;
  }
}

const ensureTrailingSlash = (uri: string): string =>
  uri.endsWith('/') ? uri : `${uri}/`;

async function ensureDirectory(name: string): Promise<string | null> {
  // Try to get document directory from legacy API first
  let legacyBaseDir = documentDirectory;
  
  // Fallback to checking the FileSystem namespace
  if (!legacyBaseDir && 'documentDirectory' in FileSystem) {
    legacyBaseDir = (FileSystem as unknown as { documentDirectory?: string | null }).documentDirectory ?? null;
  }

  if (!legacyBaseDir) {
    console.warn('Cannot find document directory - database features may not work');
    return null;
  }

  const targetDir = ensureTrailingSlash(`${legacyBaseDir}${name}`);

  try {
    const info = await getInfoAsync(targetDir);

    if (info.exists && info.isDirectory === false) {
      console.log(`Removing file at ${targetDir} to create directory`);
      await deleteAsync(targetDir, { idempotent: true });
    }

    if (!info.exists || info.isDirectory === false) {
      console.log(`Creating directory at ${targetDir}`);
      await makeDirectoryAsync(targetDir, { intermediates: true });
    }
    
    console.log(`Directory ensured at ${targetDir}`);
  } catch (error) {
    console.warn(`Failed to prepare ${name} directory:`, error);
    // Don't throw - return the directory path anyway
  }

  return targetDir;
}

async function getDatabaseFileUri(): Promise<string> {
  const sqliteDir = await ensureDirectory('SQLite');
  if (!sqliteDir) {
    throw new Error('Unable to resolve SQLite directory');
  }
  return `${sqliteDir}${DB_NAME}`;
}

async function ensureBackupDirectory(): Promise<string> {
  const dir = await ensureDirectory(BACKUP_DIRECTORY_NAME);
  if (!dir) {
    throw new Error('Unable to resolve backup directory');
  }
  return dir;
}

async function removeFileIfExists(uri: string) {
  try {
    const info = await getInfoAsync(uri);
    if (info.exists) {
      await deleteAsync(uri, { idempotent: true });
    }
  } catch (error) {
    console.warn(`Failed to remove file at ${uri}`, error);
  }
}

async function copyFileIfExists(source: string, destination: string) {
  try {
    const isSafUri = source.startsWith('content://') && StorageAccessFramework?.readAsStringAsync;
    if (!isSafUri) {
      const info = await getInfoAsync(source);
      if (!info.exists) {
        console.log(`Source file does not exist: ${source}`);
        return;
      }
    }

    console.log(`Copying file from ${source} to ${destination}`);

    const readFn = isSafUri
      ? StorageAccessFramework.readAsStringAsync
      : readAsStringAsync;

    const content = await readFn(source, { encoding: EncodingType.Base64 });
    await writeAsStringAsync(destination, content, { encoding: EncodingType.Base64 });
    console.log(`File copy complete (${source} -> ${destination})`);

    console.log(`File copied successfully to ${destination}`);
  } catch (error) {
    const message = String((error as any)?.message ?? '').toLowerCase();
    if (message.includes('no such file') || message.includes('not found') || message.includes('could not open')) {
      console.warn(`Optional source missing, skipping copy: ${source}`);
      return;
    }
    console.error(`Failed to copy file from ${source} to ${destination}:`, error);
    throw error;
  }
}

async function copyBackupToDownloads(
  sourcePath: string,
  fileName: string
): Promise<{ uri?: string; error?: string }> {
  if (Platform.OS !== 'android') {
    return { error: 'Only available on Android' };
  }

  try {
    // Try to access the public Downloads directory
    // On Android, this is typically /storage/emulated/0/Download/
    const downloadsPath = '/storage/emulated/0/Download/POSBackups/';
    
    console.log('Attempting to create folder in Downloads:', downloadsPath);
    
    // Try to create the POSBackups folder in Downloads
    try {
      await makeDirectoryAsync(downloadsPath, { intermediates: true });
      console.log('Downloads folder created successfully');
    } catch (dirError) {
      console.log('Could not create downloads folder:', dirError);
      return { error: 'Cannot access Downloads folder. Permission denied.' };
    }

    const destinationPath = `${downloadsPath}${fileName}`;
    console.log('Copying to:', destinationPath);
    
    // Read source file
    const fileContent = await readAsStringAsync(sourcePath, { encoding: 'base64' });
    
    // Write to Downloads
    await writeAsStringAsync(destinationPath, fileContent, { encoding: 'base64' });
    
    console.log('Backup saved to Downloads successfully');
    return { uri: destinationPath };
  } catch (error) {
    console.error('Failed to save to Downloads:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Could not save to Downloads: ${message}` };
  }
}

async function listBackupFiles(): Promise<
  Array<{ name: string; uri: string; modificationTime?: number }>
> {
  const dir = await ensureBackupDirectory();
  try {
    const entries = await readDirectoryAsync(dir);
    const backups = await Promise.all(
      entries
        .filter((name) => name.toLowerCase().endsWith('.db'))
        .map(async (name) => {
          const uri = `${dir}${name}`;
          try {
            const info = await getInfoAsync(uri);
            const modificationTime =
              info && typeof info === 'object' && 'modificationTime' in info
                ? ((info as { modificationTime?: number | null }).modificationTime ?? undefined)
                : undefined;
            return { name, uri, modificationTime };
          } catch {
            return { name, uri, modificationTime: undefined };
          }
        })
    );

    return backups.sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
  } catch (error) {
    console.warn('Failed to read backup directory', error);
    return [];
  }
}

function formatTimestampForFilename(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function createDatabaseBackup() {
  try {
    console.log('Starting database backup...');
    
    // Ensure database is initialized first
    try {
      const database = await initDB();
      if (!database) {
        throw new Error('Database connection is null');
      }
      console.log('Database initialized for backup');
    } catch (initError) {
      console.error('Failed to initialize database:', initError);
      throw new Error(`Database initialization failed: ${initError instanceof Error ? initError.message : 'Unknown error'}`);
    }
    
    // Checkpoint WAL with better error handling
    try {
      await runDatabaseOperation(async (database) => {
        if (!database) {
          console.warn('Database is null, skipping WAL checkpoint');
          return;
        }
        await database.execAsync('PRAGMA wal_checkpoint(FULL);');
        console.log('WAL checkpoint completed');
      });
    } catch (error) {
      console.warn('Failed to checkpoint WAL before backup (continuing anyway):', error);
      // Don't fail the backup if checkpoint fails
    }

    const sourceUri = await getDatabaseFileUri();
    console.log('Source database URI:', sourceUri);
    
    // Verify source database exists
    try {
      const sourceInfo = await getInfoAsync(sourceUri);
      if (!sourceInfo.exists) {
        throw new Error('Source database file does not exist');
      }
      const fileSize = typeof sourceInfo === 'object' && 'size' in sourceInfo ? (sourceInfo as any).size : 'unknown';
      console.log('Source database verified, size:', fileSize);
    } catch (verifyError) {
      console.error('Failed to verify source database:', verifyError);
      throw new Error('Source database verification failed');
    }
    
    const backupDir = await ensureBackupDirectory();
    console.log('Backup directory:', backupDir);
    
    if (!backupDir) {
      throw new Error('Failed to create backup directory');
    }
    
    const filename = `${DB_NAME.replace('.db', '')}_${formatTimestampForFilename(new Date())}.db`;
    const destinationUri = `${backupDir}${filename}`;
    
    console.log('Copying database file...');
    await copyFileIfExists(sourceUri, destinationUri);
    
    console.log('Copying WAL files if they exist...');
    const walSource = `${sourceUri}-wal`;
    const shmSource = `${sourceUri}-shm`;
    const walDestination = `${destinationUri}-wal`;
    const shmDestination = `${destinationUri}-shm`;
    
    // These might not exist, which is fine
    try {
      await copyFileIfExists(walSource, walDestination);
    } catch (walError) {
      console.log('WAL file not copied (may not exist):', walError);
    }
    
    try {
      await copyFileIfExists(shmSource, shmDestination);
    } catch (shmError) {
      console.log('SHM file not copied (may not exist):', shmError);
    }
    
    console.log('Attempting to copy backup to downloads...');
    let externalUri: string | undefined;
    let externalError: string | undefined;
    
    try {
      const result = await copyBackupToDownloads(destinationUri, filename);
      externalUri = result.uri;
      externalError = result.error;
      
      if (externalUri) {
        console.log('Backup copied to downloads:', externalUri);
      } else if (externalError) {
        console.log('Backup saved locally, download copy failed:', externalError);
      }
    } catch (downloadError) {
      console.error('Failed to copy to downloads:', downloadError);
      externalError = downloadError instanceof Error ? downloadError.message : 'Unknown error';
    }
    
    console.log('Backup completed successfully');
    return { uri: destinationUri, filename, externalUri, externalError };
  } catch (error) {
    console.error('Database backup failed:', error);
    throw error;
  }
}

export async function listDatabaseBackups() {
  return await listBackupFiles();
}

export async function shareDatabaseBackup(uri: string, fileName: string) {
  // expo-sharing is not available in the current development build
  // Instead, we'll show the file path so users can manually access it
  try {
    const info = await getInfoAsync(uri);
    if (!info.exists) {
      throw new Error('Backup file not found');
    }

    // Return the file path information
    return {
      success: true,
      uri: uri,
      fileName: fileName,
      message: `Backup saved at:\n${uri}\n\nYou can access this file using a file manager app or connect your device to a computer.`,
    };
  } catch (error) {
    console.error('Failed to get backup info:', error);
    throw error;
  }
}

export async function getBackupStoragePath(): Promise<string> {
  const backupDir = await ensureBackupDirectory();
  return backupDir;
}

export async function restoreDatabaseFromBackup(uri: string) {
  try {
    const info = await getInfoAsync(uri);
    if (!info.exists) {
      throw new Error('Backup file not found');
    }
  } catch (err) {
    // SAF content URIs may throw on getInfoAsync; proceed and let copy step fail if truly missing
    console.warn('Could not stat backup URI, attempting restore anyway', err);
  }

  await operationQueue;

  const currentDb = db;
  if (currentDb && 'closeAsync' in currentDb && typeof (currentDb as any).closeAsync === 'function') {
    try {
      await (currentDb as any).closeAsync();
    } catch (error) {
      console.warn('Failed to close existing database before restore', error);
    }
  }

  const destination = await getDatabaseFileUri();
  await removeFileIfExists(destination);

  try {
    await copyAsync({ from: uri, to: destination });
  } catch (error) {
    // Fallback to buffered copy if copyAsync fails
    console.warn('copyAsync failed for restore, falling back to buffered copy', error);
    await copyFileIfExists(uri, destination);
  }

  const walDestination = `${destination}-wal`;
  const shmDestination = `${destination}-shm`;
  await removeFileIfExists(walDestination);
  await removeFileIfExists(shmDestination);
  const walSource = `${uri}-wal`;
  const shmSource = `${uri}-shm`;
  await copyFileIfExists(walSource, walDestination);
  await copyFileIfExists(shmSource, shmDestination);

   try {
     const destInfo = await getInfoAsync(destination);
     const destSize = (destInfo as any)?.size ?? 0;
     if (!destInfo.exists || destSize === 0) {
       throw new Error(`Restored file missing or empty at ${destination}`);
     }

     // Validate SQLite header (warn-only)
     try {
       const headerBase64 = await readAsStringAsync(destination, { encoding: EncodingType.Base64 });
       const headerBytes = Buffer.from(headerBase64, 'base64').subarray(0, 16).toString('ascii');
       if (!headerBytes.startsWith('SQLite format 3')) {
         console.warn('Restored file did not pass header check (continuing):', headerBytes);
       }
     } catch (headerError) {
       console.warn('Unable to validate restored DB header (continuing)', headerError);
     }
     console.log(`Restore copy complete. Size: ${destSize} bytes`);
   } catch (error) {
     console.error('Post-restore validation failed', error);
     throw error;
   }

  db = null;
  await initDB();
}

// Database operations
export const database = {
  async getDB() {
    return await initDB();
  },

  async runInTransaction<T>(callback: (connection: SQLite.SQLiteDatabase) => Promise<T>) {
    return runDatabaseOperation(async (database) => {
      await database.execAsync('BEGIN IMMEDIATE');
      try {
        const result = await callback(database);
        await database.execAsync('COMMIT');
        return result;
      } catch (error) {
        try {
          await database.execAsync('ROLLBACK');
        } catch (rollbackError) {
          console.warn('Failed to rollback transaction', rollbackError);
        }
        throw error;
      }
    });
  },

  // Products
  async getAllProducts() {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync('SELECT * FROM products');
      return rows.map((row: any) => ({
        ...row,
        hasVariants: Boolean(row.hasVariants),
        variants: safeParseJSON<any[] | undefined>(row.variants, {
          fallback: undefined,
          context: 'products.variants',
        }),
      }));
    });
  },

  async getProduct(id: number) {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT * FROM products WHERE id = ?', [id]);
      if (!row) return null;
      return {
        ...row,
        hasVariants: Boolean((row as any).hasVariants),
        variants: safeParseJSON<any[] | undefined>((row as any).variants, {
          fallback: undefined,
          context: 'products.variants',
        }),
      };
    });
  },

  async addProduct(product: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      const result = await database.runAsync(
        'INSERT INTO products (name, category, hasVariants, variants, price, stock, minStock, barcode, unit, costPrice) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          product.name,
          product.category,
          product.hasVariants ? 1 : 0,
          product.variants ? JSON.stringify(product.variants) : null,
          product.price ?? null,
          product.stock ?? null,
          product.minStock ?? null,
          product.barcode || null,
          product.unit || null,
          product.costPrice ?? null,
        ]
      );
      return result.lastInsertRowId;
    };

    if (options?.connection) {
      return executor(options.connection);
    }

    return runDatabaseOperation(executor);
  },

  async updateProduct(product: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync(
        'UPDATE products SET name = ?, category = ?, hasVariants = ?, variants = ?, price = ?, stock = ?, minStock = ?, barcode = ?, unit = ?, costPrice = ? WHERE id = ?',
        [
          product.name,
          product.category,
          product.hasVariants ? 1 : 0,
          product.variants ? JSON.stringify(product.variants) : null,
          product.price ?? null,
          product.stock ?? null,
          product.minStock ?? null,
          product.barcode || null,
          product.unit || null,
          product.costPrice ?? null,
          product.id,
        ]
      );
    };
    return executeWithConnection(executor, options?.connection);
  },

  async deleteProduct(id: number) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM products WHERE id = ?', [id])
    );
  },

  // Customers
  async getAllCustomers() {
    return runDatabaseOperation((database) =>
      database.getAllAsync('SELECT * FROM customers ORDER BY name')
    );
  },

  async getCustomer(id: number) {
    return runDatabaseOperation((database) =>
      database.getFirstAsync('SELECT * FROM customers WHERE id = ?', [id])
    );
  },

  async getCustomerByPhone(phone: string) {
    return runDatabaseOperation((database) =>
      database.getFirstAsync('SELECT * FROM customers WHERE phone = ?', [phone])
    );
  },

  async addCustomer(customer: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      const result = await database.runAsync(
        'INSERT INTO customers (name, phone, email, note, imageUri, totalPurchases, lastPurchase, credit, dueAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          customer.name,
          customer.phone,
          customer.email || null,
          customer.note || null,
          customer.imageUri || null,
          customer.totalPurchases || 0,
          customer.lastPurchase || null,
          customer.credit || 0,
          customer.dueAmount || 0,
        ]
      );
      return result.lastInsertRowId;
    };
    return executeWithConnection(executor, options?.connection);
  },

  async updateCustomer(customer: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync(
        'UPDATE customers SET name = ?, phone = ?, email = ?, note = ?, imageUri = ?, totalPurchases = ?, lastPurchase = ?, credit = ?, dueAmount = ? WHERE id = ?',
        [
          customer.name,
          customer.phone,
          customer.email || null,
          customer.note || null,
          customer.imageUri || null,
          customer.totalPurchases || 0,
          customer.lastPurchase || null,
          customer.credit || 0,
          customer.dueAmount || 0,
          customer.id,
        ]
      );
    };
    return executeWithConnection(executor, options?.connection);
  },

  async deleteCustomer(id: number, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync('DELETE FROM customers WHERE id = ?', [id]);
    };
    return executeWithConnection(executor, options?.connection);
  },

  // Sales
  async getAllSales() {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync('SELECT * FROM sales ORDER BY date DESC, time DESC');
      return rows.map((row: any) => ({
        ...row,
        customer: safeParseJSON<any | undefined>(row.customer, {
          fallback: undefined,
          context: 'sales.customer',
        }),
        cart: safeParseJSON<any[]>(row.cart, { fallback: [], context: 'sales.cart' }),
      }));
    });
  },

  async getSale(id: number) {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT * FROM sales WHERE id = ?', [id]);
      if (!row) return null;
      return {
        ...row,
        customer: safeParseJSON<any | undefined>((row as any).customer, {
          fallback: undefined,
          context: 'sales.customer',
        }),
        cart: safeParseJSON<any[]>((row as any).cart, { fallback: [], context: 'sales.cart' }),
      };
    });
  },

  async getSalesByStatus(status: string) {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync(
        'SELECT * FROM sales WHERE status = ? ORDER BY date DESC, time DESC',
        [status]
      );
      return rows.map((row: any) => ({
        ...row,
        customer: safeParseJSON<any | undefined>(row.customer, {
          fallback: undefined,
          context: 'sales.customer',
        }),
        cart: safeParseJSON<any[]>(row.cart, { fallback: [], context: 'sales.cart' }),
      }));
    });
  },

  async addSale(sale: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      const result = await database.runAsync(
        `INSERT INTO sales (customer, cart, subtotal, taxRate, tax, total, creditUsed, amountAfterCredit, 
         paidAmount, changeAmount, remainingBalance, paymentMethod, dueDate, date, time, status, items, amount) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sale.customer ? JSON.stringify(sale.customer) : null,
          JSON.stringify(sale.cart),
          sale.subtotal,
          sale.taxRate,
          sale.tax,
          sale.total,
          sale.creditUsed || 0,
          sale.amountAfterCredit,
          sale.paidAmount,
          sale.changeAmount || 0,
          sale.remainingBalance || 0,
          sale.paymentMethod,
          sale.dueDate || null,
          sale.date,
          sale.time,
          sale.status,
          sale.items,
          sale.amount,
        ]
      );
      return result.lastInsertRowId;
    };
    return executeWithConnection(executor, options?.connection);
  },

  async updateSale(sale: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync(
        `UPDATE sales SET customer = ?, cart = ?, subtotal = ?, taxRate = ?, tax = ?, total = ?, 
         creditUsed = ?, amountAfterCredit = ?, paidAmount = ?, changeAmount = ?, remainingBalance = ?, 
         paymentMethod = ?, dueDate = ?, date = ?, time = ?, status = ?, items = ?, amount = ? WHERE id = ?`,
        [
          sale.customer ? JSON.stringify(sale.customer) : null,
          JSON.stringify(sale.cart),
          sale.subtotal,
          sale.taxRate,
          sale.tax,
          sale.total,
          sale.creditUsed || 0,
          sale.amountAfterCredit,
          sale.paidAmount,
          sale.changeAmount || 0,
          sale.remainingBalance || 0,
          sale.paymentMethod,
          sale.dueDate || null,
          sale.date,
          sale.time,
          sale.status,
          sale.items,
          sale.amount,
          sale.id,
        ]
      );
    };
    return executeWithConnection(executor, options?.connection);
  },

  async deleteSale(id: number, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync('DELETE FROM sales WHERE id = ?', [id]);
    };
    return executeWithConnection(executor, options?.connection);
  },

  // Credit Transactions
  async getAllCreditTransactions() {
    return runDatabaseOperation((database) =>
      database.getAllAsync('SELECT * FROM creditTransactions ORDER BY date DESC, time DESC')
    );
  },

  async getCreditTransactionsByCustomer(customerId: number) {
    return runDatabaseOperation((database) =>
      database.getAllAsync(
        'SELECT * FROM creditTransactions WHERE customerId = ? ORDER BY date DESC, time DESC',
        [customerId]
      )
    );
  },

  async addCreditTransaction(transaction: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      const result = await database.runAsync(
        'INSERT INTO creditTransactions (customerId, customerName, customerPhone, amount, type, date, time, description, linkedSaleId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          transaction.customerId,
          transaction.customerName,
          transaction.customerPhone,
          transaction.amount,
          transaction.type,
          transaction.date,
          transaction.time,
          transaction.description,
          transaction.linkedSaleId || null,
        ]
      );
      return result.lastInsertRowId;
    };
    return executeWithConnection(executor, options?.connection);
  },

  async updateCreditTransaction(transaction: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync(
        'UPDATE creditTransactions SET customerId = ?, customerName = ?, customerPhone = ?, amount = ?, type = ?, date = ?, time = ?, description = ?, linkedSaleId = ? WHERE id = ?',
        [
          transaction.customerId,
          transaction.customerName,
          transaction.customerPhone,
          transaction.amount,
          transaction.type,
          transaction.date,
          transaction.time,
          transaction.description,
          transaction.linkedSaleId || null,
          transaction.id,
        ]
      );
    };
    return executeWithConnection(executor, options?.connection);
  },

  async deleteCreditTransaction(id: number, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync('DELETE FROM creditTransactions WHERE id = ?', [id]);
    };
    return executeWithConnection(executor, options?.connection);
  },

  // Vendors
  async getAllVendors() {
    return runDatabaseOperation((database) =>
      database.getAllAsync('SELECT * FROM vendors ORDER BY name')
    );
  },

  async getVendorById(id: number) {
    return runDatabaseOperation((database) =>
      database.getFirstAsync('SELECT * FROM vendors WHERE id = ?', [id])
    );
  },

  async getVendorByPhone(phone: string) {
    return runDatabaseOperation((database) =>
      database.getFirstAsync('SELECT * FROM vendors WHERE phone = ?', [phone])
    );
  },

  async addVendor(vendor: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      const result = await database.runAsync(
        'INSERT INTO vendors (name, phone, email, company, address, note, totalPurchases, lastPurchase, payable, imageUri) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          vendor.name,
          vendor.phone,
          vendor.email || null,
          vendor.company || null,
          vendor.address || null,
          vendor.note || null,
          vendor.totalPurchases || 0,
          vendor.lastPurchase || null,
          vendor.payable || 0,
          vendor.imageUri || null,
        ]
      );
      return result.lastInsertRowId;
    };
    return executeWithConnection(executor, options?.connection);
  },

  async updateVendor(vendor: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync(
        'UPDATE vendors SET name = ?, phone = ?, email = ?, company = ?, address = ?, note = ?, totalPurchases = ?, lastPurchase = ?, payable = ?, imageUri = ? WHERE id = ?',
        [
          vendor.name,
          vendor.phone,
          vendor.email || null,
          vendor.company || null,
          vendor.address || null,
          vendor.note || null,
          vendor.totalPurchases || 0,
          vendor.lastPurchase || null,
          vendor.payable || 0,
          vendor.imageUri || null,
          vendor.id,
        ]
      );
    };
    return executeWithConnection(executor, options?.connection);
  },

  async deleteVendor(id: number, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync('DELETE FROM vendors WHERE id = ?', [id]);
    };
    return executeWithConnection(executor, options?.connection);
  },

  // Purchases
  async getAllPurchases() {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync('SELECT * FROM purchases ORDER BY date DESC, time DESC');
      return rows.map((row: any) => ({
        ...row,
        vendor: safeParseJSON<any | undefined>(row.vendor, {
          fallback: undefined,
          context: 'purchases.vendor',
        }),
        items: safeParseJSON<any[]>(row.items, { fallback: [], context: 'purchases.items' }),
      }));
    });
  },

  async getPurchaseById(id: number) {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT * FROM purchases WHERE id = ?', [id]);
      if (!row) return null;
      return {
        ...row,
        vendor: safeParseJSON<any | undefined>((row as any).vendor, {
          fallback: undefined,
          context: 'purchases.vendor',
        }),
        items: safeParseJSON<any[]>((row as any).items, { fallback: [], context: 'purchases.items' }),
      };
    });
  },

  async addPurchase(purchase: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      const result = await database.runAsync(
        `INSERT INTO purchases (vendor, items, subtotal, taxRate, tax, total, paidAmount, remainingBalance, 
         paymentMethod, invoiceNumber, date, time, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchase.vendor ? JSON.stringify(purchase.vendor) : null,
          JSON.stringify(purchase.items),
          purchase.subtotal,
          purchase.taxRate,
          purchase.tax,
          purchase.total,
          purchase.paidAmount,
          purchase.remainingBalance || 0,
          purchase.paymentMethod,
          purchase.invoiceNumber || null,
          purchase.date,
          purchase.time,
          purchase.status,
          purchase.note || null,
        ]
      );
      return result.lastInsertRowId;
    };
    return executeWithConnection(executor, options?.connection);
  },

  async updatePurchase(purchase: any, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync(
        `UPDATE purchases SET vendor = ?, items = ?, subtotal = ?, taxRate = ?, tax = ?, total = ?, 
         paidAmount = ?, remainingBalance = ?, paymentMethod = ?, invoiceNumber = ?, date = ?, time = ?, 
         status = ?, note = ? WHERE id = ?`,
        [
          purchase.vendor ? JSON.stringify(purchase.vendor) : null,
          JSON.stringify(purchase.items),
          purchase.subtotal,
          purchase.taxRate,
          purchase.tax,
          purchase.total,
          purchase.paidAmount,
          purchase.remainingBalance || 0,
          purchase.paymentMethod,
          purchase.invoiceNumber || null,
          purchase.date,
          purchase.time,
          purchase.status,
          purchase.note || null,
          purchase.id,
        ]
      );
    };
    return executeWithConnection(executor, options?.connection);
  },

  async deletePurchase(id: number, options?: OperationOptions) {
    const executor = async (database: SQLite.SQLiteDatabase) => {
      await database.runAsync('DELETE FROM purchases WHERE id = ?', [id]);
    };
    return executeWithConnection(executor, options?.connection);
  },

  // Expenditures
  async getAllExpenditures() {
    return runDatabaseOperation((database) =>
      database.getAllAsync('SELECT * FROM expenditures ORDER BY date DESC, time DESC')
    );
  },

  async getExpenditureById(id: number) {
    return runDatabaseOperation((database) =>
      database.getFirstAsync('SELECT * FROM expenditures WHERE id = ?', [id])
    );
  },

  async getExpendituresByDate(date: string) {
    return runDatabaseOperation((database) =>
      database.getAllAsync('SELECT * FROM expenditures WHERE date = ? ORDER BY time DESC', [date])
    );
  },

  async getExpendituresByCategory(category: string) {
    return runDatabaseOperation((database) =>
      database.getAllAsync(
        'SELECT * FROM expenditures WHERE category = ? ORDER BY date DESC, time DESC',
        [category]
      )
    );
  },

  async addExpenditure(expenditure: any) {
    return runDatabaseOperation(async (database) => {
      const result = await database.runAsync(
        'INSERT INTO expenditures (category, amount, description, date, time) VALUES (?, ?, ?, ?, ?)',
        [expenditure.category, expenditure.amount, expenditure.description, expenditure.date, expenditure.time]
      );
      return result.lastInsertRowId;
    });
  },

  async updateExpenditure(expenditure: any) {
    return runDatabaseOperation((database) =>
      database.runAsync(
        'UPDATE expenditures SET category = ?, amount = ?, description = ?, date = ?, time = ? WHERE id = ?',
        [
          expenditure.category,
          expenditure.amount,
          expenditure.description,
          expenditure.date,
          expenditure.time,
          expenditure.id,
        ]
      )
    );
  },

  async deleteExpenditure(id: number) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM expenditures WHERE id = ?', [id])
    );
  },

  // JazzCash transactions
  async getAllJazzCashTransactions() {
    return runDatabaseOperation((database) =>
      database.getAllAsync('SELECT * FROM jazzCashTransactions ORDER BY datetime(createdAt) DESC')
    );
  },

  async addJazzCashTransaction(transaction: any) {
    return runDatabaseOperation(async (database) => {
      const result = await database.runAsync(
        'INSERT INTO jazzCashTransactions (flow, customerName, customerPhone, customerCnic, amount, baseAmount, profitAmount, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          transaction.flow,
          transaction.customerName,
          transaction.customerPhone,
          transaction.customerCnic,
          transaction.amount,
          transaction.baseAmount ?? transaction.amount ?? 0,
          transaction.profitAmount ?? 0,
          transaction.note || null,
          transaction.createdAt,
        ]
      );
      return result.lastInsertRowId;
    });
  },

  async deleteJazzCashTransaction(id: number) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM jazzCashTransactions WHERE id = ?', [id])
    );
  },

  // Owner fund transactions
  async getAllOwnerFundTransactions() {
    return runDatabaseOperation((database) =>
      database.getAllAsync('SELECT * FROM ownerFundTransactions ORDER BY datetime(createdAt) DESC')
    );
  },

  async addOwnerFundTransaction(transaction: any) {
    return runDatabaseOperation(async (database) => {
      const result = await database.runAsync(
        'INSERT INTO ownerFundTransactions (type, amount, note, createdAt) VALUES (?, ?, ?, ?)',
        [transaction.type, transaction.amount, transaction.note || null, transaction.createdAt]
      );
      return result.lastInsertRowId;
    });
  },

  async deleteOwnerFundTransaction(id: number) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM ownerFundTransactions WHERE id = ?', [id])
    );
  },

  // Settings
  async getSetting(key: string) {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
      return row
        ? safeParseJSON<any>((row as any).value, { fallback: null, context: `settings.${key}` })
        : null;
    });
  },

  async setSetting(key: string, value: any) {
    return runDatabaseOperation((database) =>
      database.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        toBindParams([key, JSON.stringify(value)])
      )
    );
  },

  // Printer profiles
  async listPrinterProfiles(): Promise<PrinterProfileRecord[]> {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync(
        'SELECT * FROM printer_profiles ORDER BY isDefault DESC, name COLLATE NOCASE'
      );
      return rows.map(mapPrinterProfileRow);
    });
  },

  async getPrinterProfile(id: string): Promise<PrinterProfileRecord | null> {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT * FROM printer_profiles WHERE id = ?', [id]);
      return row ? mapPrinterProfileRow(row) : null;
    });
  },

  async upsertPrinterProfile(profile: PrinterProfileRecord): Promise<string> {
    return runDatabaseOperation(async (database) => {
      const now = new Date().toISOString();
      if (profile.isDefault) {
        await database.runAsync('UPDATE printer_profiles SET isDefault = 0');
      }

      const existing = await database.getFirstAsync(
        'SELECT id FROM printer_profiles WHERE id = ?',
        [profile.id]
      );

      if (existing) {
        await database.runAsync(
          `
            UPDATE printer_profiles
            SET name = ?, type = ?, ip = ?, port = ?, paperWidthMM = ?, encoding = ?, codePage = ?,
                cutMode = ?, drawerKick = ?, bitmapFallback = ?, isDefault = ?, updatedAt = ?
            WHERE id = ?
          `,
          toBindParams([
            profile.name,
            profile.type,
            profile.ip,
            profile.port,
            profile.paperWidthMM,
            profile.encoding,
            profile.codePage,
            profile.cutMode,
            profile.drawerKick ? 1 : 0,
            profile.bitmapFallback ? 1 : 0,
            profile.isDefault ? 1 : 0,
            now,
            profile.id,
          ])
        );
        return profile.id;
      }

      await database.runAsync(
        `
          INSERT INTO printer_profiles
            (id, name, type, ip, port, paperWidthMM, encoding, codePage, cutMode, drawerKick,
             bitmapFallback, isDefault, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        toBindParams([
          profile.id,
          profile.name,
          profile.type,
          profile.ip,
          profile.port,
          profile.paperWidthMM,
          profile.encoding,
          profile.codePage,
          profile.cutMode,
          profile.drawerKick ? 1 : 0,
          profile.bitmapFallback ? 1 : 0,
          profile.isDefault ? 1 : 0,
          profile.createdAt || now,
          now,
        ])
      );
      return profile.id;
    });
  },

  async setDefaultPrinterProfile(id: string) {
    return runDatabaseOperation(async (database) => {
      await database.runAsync('UPDATE printer_profiles SET isDefault = 0');
      await database.runAsync(
        'UPDATE printer_profiles SET isDefault = 1, updatedAt = ? WHERE id = ?',
        toBindParams([new Date().toISOString(), id])
      );
    });
  },

  async deletePrinterProfile(id: string) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM printer_profiles WHERE id = ?', [id])
    );
  },

  // Print jobs
  async createPrintJob(job: {
    profileId?: string | null;
    type: string;
    payload: any;
    status?: string;
    attempts?: number;
    maxAttempts?: number;
    lastError?: string | null;
    nextAttemptAt?: string | null;
  }): Promise<number> {
    return runDatabaseOperation(async (database) => {
      const now = new Date().toISOString();
      const result = await database.runAsync(
        `
          INSERT INTO print_jobs
            (profileId, type, payload, status, attempts, maxAttempts, lastError,
             createdAt, updatedAt, lastAttemptAt, nextAttemptAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        toBindParams([
          job.profileId ?? null,
          job.type,
          JSON.stringify(job.payload ?? {}),
          job.status ?? 'pending',
          job.attempts ?? 0,
          job.maxAttempts ?? 3,
          job.lastError ?? null,
          now,
          now,
          null,
          job.nextAttemptAt ?? null,
        ])
      );
      return result.lastInsertRowId;
    });
  },

  async listPrintJobs(limit = 100): Promise<PrintJobRecord[]> {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync(
        'SELECT * FROM print_jobs ORDER BY datetime(createdAt) DESC LIMIT ?',
        [limit]
      );
      return rows.map(mapPrintJobRow);
    });
  },

  async getPrintJob(id: number): Promise<PrintJobRecord | null> {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync(
        'SELECT * FROM print_jobs WHERE id = ?',
        [id]
      );
      return row ? mapPrintJobRow(row) : null;
    });
  },

  async getNextPendingPrintJob(): Promise<PrintJobRecord | null> {
    return runDatabaseOperation(async (database) => {
      const now = new Date().toISOString();
      const row = await database.getFirstAsync(
        `
          SELECT * FROM print_jobs
          WHERE status IN ('pending', 'retrying')
            AND (nextAttemptAt IS NULL OR nextAttemptAt <= ?)
          ORDER BY datetime(createdAt) ASC
          LIMIT 1
        `,
        [now]
      );
      return row ? mapPrintJobRow(row) : null;
    });
  },

  async updatePrintJob(
    id: number,
    updates: {
      status?: string;
      attempts?: number;
      maxAttempts?: number;
      lastError?: string | null;
      lastAttemptAt?: string | null;
      nextAttemptAt?: string | null;
    }
  ) {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.attempts !== undefined) {
      fields.push('attempts = ?');
      values.push(updates.attempts);
    }
    if (updates.maxAttempts !== undefined) {
      fields.push('maxAttempts = ?');
      values.push(updates.maxAttempts);
    }
    if (updates.lastError !== undefined) {
      fields.push('lastError = ?');
      values.push(updates.lastError);
    }
    if (updates.lastAttemptAt !== undefined) {
      fields.push('lastAttemptAt = ?');
      values.push(updates.lastAttemptAt);
    }
    if (updates.nextAttemptAt !== undefined) {
      fields.push('nextAttemptAt = ?');
      values.push(updates.nextAttemptAt);
    }

    fields.push('updatedAt = ?');
    values.push(new Date().toISOString());
    values.push(id);

    return runDatabaseOperation((database) =>
      database.runAsync(
        `UPDATE print_jobs SET ${fields.join(', ')} WHERE id = ?`,
        toBindParams(values)
      )
    );
  },

  async deletePrintJob(id: number) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM print_jobs WHERE id = ?', [id])
    );
  },

  async deletePrintJobsByStatus(statuses: string[]) {
    if (!statuses.length) {
      return;
    }
    const placeholders = statuses.map(() => '?').join(', ');
    return runDatabaseOperation((database) =>
      database.runAsync(
        `DELETE FROM print_jobs WHERE status IN (${placeholders})`,
        toBindParams(statuses)
      )
    );
  },

  // Roles
  async ensureDefaultRoles(): Promise<RoleRecord[]> {
    return runDatabaseOperation(async (database) => {
      for (const role of DEFAULT_ROLES) {
        await database.runAsync(
          'INSERT OR IGNORE INTO roles (name, permissions) VALUES (?, ?)',
          toBindParams([role.name, JSON.stringify(role.permissions)])
        );
      }
      const rows = await database.getAllAsync('SELECT * FROM roles ORDER BY id');
      return rows.map(mapRoleRow);
    });
  },

  async getRoles(): Promise<RoleRecord[]> {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync('SELECT * FROM roles ORDER BY id');
      return rows.map(mapRoleRow);
    });
  },

  async upsertRole(role: { id?: number; name: string; permissions: PermissionSet }): Promise<number> {
    const payload = [role.name, JSON.stringify(role.permissions)];
    if (role.id) {
      await runDatabaseOperation((database) =>
        database.runAsync(
          'UPDATE roles SET name = ?, permissions = ?, createdAt = createdAt WHERE id = ?',
          toBindParams([role.name, JSON.stringify(role.permissions), role.id])
        )
      );
      return role.id;
    }

    return runDatabaseOperation(async (database) => {
      const result = await database.runAsync(
        'INSERT INTO roles (name, permissions) VALUES (?, ?)',
        toBindParams(payload)
      );
      return result.lastInsertRowId;
    });
  },

  async deleteRole(id: number) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM roles WHERE id = ?', [id])
    );
  },

  // Users
  async listUsers(): Promise<UserRecord[]> {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync('SELECT * FROM users ORDER BY name COLLATE NOCASE');
      return rows.map(mapUserRow);
    });
  },

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT * FROM users WHERE email = ?', [email]);
      return row ? mapUserRow(row) : null;
    });
  },

  async getUserByPinHash(pinHash: string): Promise<UserRecord | null> {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT * FROM users WHERE pinHash = ?', [pinHash]);
      return row ? mapUserRow(row) : null;
    });
  },

  async getUserById(id: number): Promise<UserRecord | null> {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT * FROM users WHERE id = ?', [id]);
      return row ? mapUserRow(row) : null;
    });
  },

  async createUser(user: {
    remoteId?: string;
    email?: string;
    phone?: string;
    name: string;
    pinHash?: string;
    biometricEnabled?: boolean;
    roleId: number;
  }): Promise<number> {
    return runDatabaseOperation(async (database) => {
      const now = new Date().toISOString();
      const result = await database.runAsync(
        `
          INSERT INTO users (remoteId, email, phone, name, pinHash, biometricEnabled, roleId, isActive, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `,
        toBindParams([
          user.remoteId || null,
          user.email || null,
          user.phone || null,
          user.name,
          user.pinHash || null,
          user.biometricEnabled ? 1 : 0,
          user.roleId,
          now,
          now,
        ])
      );
      return result.lastInsertRowId;
    });
  },

  async updateUser(
    id: number,
    updates: Partial<Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>> & { updatedAt?: string }
  ) {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.remoteId !== undefined) {
      fields.push('remoteId = ?');
      values.push(updates.remoteId);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.pinHash !== undefined) {
      fields.push('pinHash = ?');
      values.push(updates.pinHash);
    }
    if (updates.biometricEnabled !== undefined) {
      fields.push('biometricEnabled = ?');
      values.push(updates.biometricEnabled ? 1 : 0);
    }
    if (updates.roleId !== undefined) {
      fields.push('roleId = ?');
      values.push(updates.roleId);
    }
    if (updates.isActive !== undefined) {
      fields.push('isActive = ?');
      values.push(updates.isActive ? 1 : 0);
    }
    if (updates.lastLoginAt !== undefined) {
      fields.push('lastLoginAt = ?');
      values.push(updates.lastLoginAt);
    }

    fields.push('updatedAt = ?');
    values.push(updates.updatedAt ?? new Date().toISOString());
    values.push(id);

    const statement = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

    return runDatabaseOperation((database) => database.runAsync(statement, toBindParams(values)));
  },

  async recordSession(session: {
    userId: number;
    deviceId?: string;
    token: string;
    createdAt: string;
    expiresAt: string;
  }): Promise<number> {
    return runDatabaseOperation(async (database) => {
      const result = await database.runAsync(
        `
          INSERT INTO sessions (userId, deviceId, token, createdAt, expiresAt)
          VALUES (?, ?, ?, ?, ?)
        `,
        toBindParams([
          session.userId,
          session.deviceId || null,
          session.token,
          session.createdAt,
          session.expiresAt,
        ])
      );
      return result.lastInsertRowId;
    });
  },

  async getActiveSession(token: string): Promise<SessionRecord | null> {
    return runDatabaseOperation(async (database) => {
      const nowIso = new Date().toISOString();
      const row = await database.getFirstAsync(
        'SELECT * FROM sessions WHERE token = ? AND expiresAt > ?',
        toBindParams([token, nowIso])
      );
      if (!row) {
        return null;
      }
      const typedRow = row as any;
      return {
        id: typedRow.id,
        userId: typedRow.userId,
        deviceId: typedRow.deviceId,
        token: typedRow.token,
        createdAt: typedRow.createdAt,
        expiresAt: typedRow.expiresAt,
      };
    });
  },

  async purgeExpiredSessions() {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM sessions WHERE expiresAt <= ?', toBindParams([new Date().toISOString()]))
    );
  },

  async deleteSession(token: string) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM sessions WHERE token = ?', toBindParams([token]))
    );
  },

  // Sync metadata
  async enqueueSyncChange(change: {
    entity: string;
    entityId: string | number;
    payload: any;
    action: 'insert' | 'update' | 'delete';
  }): Promise<number> {
    return runDatabaseOperation(async (database) => {
      const now = new Date().toISOString();
      const result = await database.runAsync(
        `
          INSERT INTO sync_outbox (entity, entityId, payload, action, status, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `,
        toBindParams([
          change.entity,
          String(change.entityId),
          JSON.stringify(change.payload),
          change.action,
          now,
          now,
        ])
      );
      return result.lastInsertRowId;
    });
  },

  async getPendingSyncChanges(limit = 25): Promise<SyncOutboxRecord[]> {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync(
        'SELECT * FROM sync_outbox WHERE status IN ("pending", "retrying") ORDER BY createdAt LIMIT ?',
        [limit]
      );
      return rows.map(mapSyncOutboxRow);
    });
  },

  async updateSyncChangeStatus(
    id: number,
    updates: { status: string; error?: string | null; retries?: number }
  ) {
    const fields = ['status = ?'];
    const values: unknown[] = [updates.status];

    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }

    if (updates.retries !== undefined) {
      fields.push('retries = ?');
      values.push(updates.retries);
    }

    fields.push('updatedAt = ?');
    values.push(new Date().toISOString());

    values.push(id);

    return runDatabaseOperation((database) =>
      database.runAsync(
        `UPDATE sync_outbox SET ${fields.join(', ')} WHERE id = ?`,
        toBindParams(values)
      )
    );
  },

  async deleteSyncChange(id: number) {
    return runDatabaseOperation((database) =>
      database.runAsync('DELETE FROM sync_outbox WHERE id = ?', toBindParams([id]))
    );
  },

  async getSyncState(entity: string): Promise<SyncStateRecord | null> {
    return runDatabaseOperation(async (database) => {
      const row = await database.getFirstAsync('SELECT * FROM sync_state WHERE entity = ?', [entity]);
      return row ? mapSyncStateRow(row) : null;
    });
  },

  async upsertSyncState(entity: string, updates: Partial<Omit<SyncStateRecord, 'id' | 'entity'>>) {
    return runDatabaseOperation(async (dbInstance) => {
      const row = await dbInstance.getFirstAsync(
        'SELECT * FROM sync_state WHERE entity = ?',
        toBindParams([entity])
      );
      const existing = row ? mapSyncStateRow(row) : null;
      const now = new Date().toISOString();
      const payload = {
        lastPulledAt: updates.lastPulledAt ?? existing?.lastPulledAt ?? now,
        lastPushedAt: updates.lastPushedAt ?? existing?.lastPushedAt ?? now,
        version: updates.version ?? existing?.version ?? null,
      };

      if (existing) {
        await dbInstance.runAsync(
          `
            UPDATE sync_state SET lastPulledAt = ?, lastPushedAt = ?, version = ? WHERE entity = ?
          `,
          toBindParams([payload.lastPulledAt, payload.lastPushedAt, payload.version, entity])
        );
        return existing.id;
      }

      const result = await dbInstance.runAsync(
        `
          INSERT INTO sync_state (entity, lastPulledAt, lastPushedAt, version)
          VALUES (?, ?, ?, ?)
        `,
        toBindParams([entity, payload.lastPulledAt, payload.lastPushedAt, payload.version])
      );
      return result.lastInsertRowId;
    });
  },

  // Backup logs
  async logBackup(entry: { path: string; type: string; provider?: string; metadata?: any }) {
    return runDatabaseOperation(async (database) => {
      const result = await database.runAsync(
        `
          INSERT INTO backup_logs (path, type, provider, metadata, uploaded)
          VALUES (?, ?, ?, ?, ?)
        `,
        toBindParams([
          entry.path,
          entry.type,
          entry.provider || null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          entry.provider ? 1 : 0,
        ])
      );
      return result.lastInsertRowId;
    });
  },

  async updateBackupLog(id: number, updates: { uploaded?: boolean; provider?: string; metadata?: any }) {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.uploaded !== undefined) {
      fields.push('uploaded = ?');
      values.push(updates.uploaded ? 1 : 0);
    }

    if (updates.provider !== undefined) {
      fields.push('provider = ?');
      values.push(updates.provider);
    }

    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(id);

    return runDatabaseOperation((database) =>
      database.runAsync(
        `UPDATE backup_logs SET ${fields.join(', ')} WHERE id = ?`,
        toBindParams(values)
      )
    );
  },

  async getBackupHistory(limit = 20): Promise<BackupLogRecord[]> {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync(
        'SELECT * FROM backup_logs ORDER BY createdAt DESC LIMIT ?',
        toBindParams([limit])
      );
      return rows.map(mapBackupLogRow);
    });
  },

  // Import jobs
  async createImportJob(job: { type: string; status?: string; summary?: string | null }): Promise<number> {
    return runDatabaseOperation(async (database) => {
      const result = await database.runAsync(
        `
          INSERT INTO import_jobs (type, status, summary)
          VALUES (?, ?, ?)
        `,
        toBindParams([job.type, job.status ?? 'queued', job.summary ?? null])
      );
      return result.lastInsertRowId;
    });
  },

  async updateImportJob(
    id: number,
    updates: { status?: string; summary?: string | null; completedAt?: string | null }
  ) {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (updates.summary !== undefined) {
      fields.push('summary = ?');
      values.push(updates.summary);
    }

    if (updates.completedAt !== undefined) {
      fields.push('completedAt = ?');
      values.push(updates.completedAt);
    }

    if (!fields.length) {
      return;
    }

    values.push(id);

    return runDatabaseOperation((database) =>
      database.runAsync(
        `UPDATE import_jobs SET ${fields.join(', ')} WHERE id = ?`,
        toBindParams(values)
      )
    );
  },

  async getRecentImportJobs(limit = 20): Promise<ImportJobRecord[]> {
    return runDatabaseOperation(async (database) => {
      const rows = await database.getAllAsync(
        'SELECT * FROM import_jobs ORDER BY createdAt DESC LIMIT ?',
        [limit]
      );
      return rows.map(mapImportJobRow);
    });
  },

  // Clear all data
  async clearAllData() {
    try {
      console.log('Clearing all data from database...');
      
      // Initialize database first
      const db = await initDB();
      if (!db) {
        throw new Error('Database is not initialized');
      }

      // Delete data from all tables in the correct order (child tables first to avoid foreign key errors)
      await runDatabaseOperation(async (database) => {
        // Temporarily disable foreign key constraints
        console.log('Disabling foreign key constraints...');
        await database.execAsync('PRAGMA foreign_keys = OFF;');
        
        console.log('Deleting credit transactions...');
        await database.execAsync('DELETE FROM creditTransactions;');
        
        console.log('Deleting sales...');
        await database.execAsync('DELETE FROM sales;');
        
        console.log('Deleting purchases...');
        await database.execAsync('DELETE FROM purchases;');
        
        console.log('Deleting expenditures...');
        await database.execAsync('DELETE FROM expenditures;');
        
        console.log('Deleting products...');
        await database.execAsync('DELETE FROM products;');
        
        console.log('Deleting customers...');
        await database.execAsync('DELETE FROM customers;');
        
        console.log('Deleting vendors...');
        await database.execAsync('DELETE FROM vendors;');
        
        console.log('Deleting settings...');
        await database.execAsync('DELETE FROM settings;');
        
        // Re-enable foreign key constraints
        console.log('Re-enabling foreign key constraints...');
        await database.execAsync('PRAGMA foreign_keys = ON;');
        
        console.log('All data cleared successfully');
      });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  },
};

export { database as db };
