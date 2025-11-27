import {
  documentDirectory,
  cacheDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readDirectoryAsync,
  copyAsync,
  deleteAsync,
  type FileInfo,
  readAsStringAsync,
  EncodingType,
  StorageAccessFramework,
} from 'expo-file-system/legacy';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { scheduleBackupReminder } from './notificationService';
import {
  BACKUP_DIRECTORY,
  DATABASE_NAME,
  restoreDatabaseFromBackup,
  db,
  database as databaseApi,
} from '../lib/database';
import { Buffer } from 'buffer';

const BACKUP_TASK = 'pos-backup-task';
const BACKUP_SCHEDULE_SETTING_KEY = 'backup.schedule';
const BACKUP_DIRECTORY_SETTING_KEY = 'backup.directoryUri';
const DOWNLOAD_DIR_NAME = 'Download';
const canScheduleBackgroundTasks = Platform.OS !== 'web' && Constants.appOwnership !== 'expo';
let backupTaskDefined = false;

export type BackupScheduleSetting = {
  enabled: boolean;
  intervalHours: number;
};

const DEFAULT_BACKUP_SCHEDULE: BackupScheduleSetting = {
  enabled: false,
  intervalHours: 24,
};

function ensureBackupTaskDefinition() {
  if (!canScheduleBackgroundTasks || backupTaskDefined) {
    return;
  }
  try {
    TaskManager.defineTask(BACKUP_TASK, async () => {
      try {
        await createDatabaseBackup();
        await scheduleBackupReminder();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.warn('Automated backup failed', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
    backupTaskDefined = true;
  } catch (error) {
    console.warn('Failed to define backup task:', error);
  }
}

ensureBackupTaskDefinition();

export async function ensureBackupDirectory() {
  const dir = await getBackupDirectory();
  if (dir.startsWith('content://')) {
    // SAF-backed directory is managed by the system; nothing to create here.
    return;
  }
  const info = await getInfoAsync(dir);
  if (!info.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function createDatabaseBackup() {
  await ensureBackupDirectory();

  const baseDir = (documentDirectory ?? cacheDirectory ?? '').replace(/\/?$/, '/');
  const sqliteDirectory = `${baseDir}SQLite/`;

  const dbPath = `${sqliteDirectory}${DATABASE_NAME}`;
  const dbInfo = await getInfoAsync(dbPath);
  if (!dbInfo.exists || dbInfo.isDirectory) {
    throw new Error('Database file not found for backup');
  }

  // Flush WAL so the main db file is self-contained
  try {
    const connection = await databaseApi.getDB();
    await connection.execAsync('PRAGMA wal_checkpoint(FULL);');
  } catch (error) {
    console.warn('Failed to checkpoint WAL before backup (continuing anyway)', error);
  }

  const backupName = `pos-backup-${Date.now()}.db`;

  const backupDir = await getBackupDirectory();
  const backupPath = `${backupDir}${backupName}`;
  await copyAsync({ from: dbPath, to: backupPath });

  // Best-effort copy WAL/SHM alongside
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  const walInfo = await getInfoAsync(walPath);
  if (walInfo.exists) {
    await copyAsync({ from: walPath, to: `${backupPath}-wal` });
  }
  const shmInfo = await getInfoAsync(shmPath);
  if (shmInfo.exists) {
    await copyAsync({ from: shmPath, to: `${backupPath}-shm` });
  }

  return { uri: backupPath, name: backupName, location: 'internal' as const };
}

export async function listBackups() {
  const directory = await getBackupDirectory();
  await ensureBackupDirectory();

  const entries = await readDirectoryAsync(directory);
  return Promise.all(
    entries
      .filter((filename) => filename.toLowerCase().endsWith('.db'))
      .map(async (filename) => {
        const uri = `${directory}${filename}`;
        const stats = await getInfoAsync(uri);
        const details = stats as any;
        const size = stats.exists && !stats.isDirectory ? details.size ?? 0 : 0;
        const createdAt =
          stats.exists && typeof details.modificationTime === 'number'
            ? new Date(details.modificationTime * 1000).toISOString()
            : null;
        return {
          name: filename,
          uri,
          size,
          createdAt,
        };
      })
  );
}

export async function deleteAllBackups() {
  const directory = await getBackupDirectory();
  await ensureBackupDirectory();
  try {
    const entries = await readDirectoryAsync(directory);
    await Promise.all(
      entries.map(async (name) => {
        try {
          await deleteAsync(`${directory}${name}`, { idempotent: true });
        } catch (error) {
          console.warn('Failed to delete backup file', name, error);
        }
      })
    );
  } catch (error) {
    console.warn('Failed to delete backups', error);
    throw error;
  }
}

async function isValidSqliteBackup(uri: string) {
  try {
    const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    const header = Buffer.from(base64, 'base64').subarray(0, 16).toString('ascii');
    return header.startsWith('SQLite format 3');
  } catch (error) {
    console.warn('[Backup] Unable to validate backup header', error);
    return false;
  }
}

export async function shareBackupToCloud(backupUri?: string) {
  let target = backupUri;
  if (!target) {
    const backups = await listBackups();
    backups.sort((a, b) => (a.createdAt && b.createdAt ? (a.createdAt > b.createdAt ? -1 : 1) : 0));
    target = backups[0]?.uri;
  }

  if (!target) {
    throw new Error('No backup available to share');
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(target, {
    dialogTitle: 'Upload POS backup',
    mimeType: 'application/octet-stream',
  });
}

export async function restoreBackupFromFile(sourceUri: string) {
  // Best-effort header check, but don't block restore if it cannot be read
  try {
    const isValid = await isValidSqliteBackup(sourceUri);
    if (!isValid) {
      console.warn('Header check failed for backup (continuing anyway)', sourceUri);
    }
  } catch (error) {
    console.warn('Could not validate backup header (continuing anyway)', error);
  }

  // Attempt restore; surface any errors from the actual copy/open
  await restoreDatabaseFromBackup(sourceUri);
}

export async function registerAutomatedBackups(intervalHours = 24) {
  if (!canScheduleBackgroundTasks) {
    return;
  }
  try {
    ensureBackupTaskDefinition();
    const defined = await TaskManager.isTaskRegisteredAsync(BACKUP_TASK);
    if (!defined) {
      await BackgroundFetch.registerTaskAsync(BACKUP_TASK, {
        minimumInterval: intervalHours * 3600,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (error) {
    console.warn('Failed to register backup task:', error);
    // Don't throw - this is a non-critical feature
  }
}

export async function unregisterAutomatedBackups() {
  if (!canScheduleBackgroundTasks) {
    return;
  }
  const defined = await TaskManager.isTaskRegisteredAsync(BACKUP_TASK);
  if (defined) {
    await BackgroundFetch.unregisterTaskAsync(BACKUP_TASK);
  }
}

function getBackupDirectory() {
  return db.getSetting(BACKUP_DIRECTORY_SETTING_KEY).then((stored) => {
    // If user already granted Downloads access, use it
    if (
      Platform.OS === 'android' &&
      typeof stored === 'string' &&
      stored.startsWith('content://')
    ) {
      return stored;
    }

    // Otherwise keep everything in app storage without prompting
    const baseDir = (documentDirectory ?? cacheDirectory ?? '').replace(/\/?$/, '/');
    return `${baseDir}${BACKUP_DIRECTORY}/`;
  });
}

export async function getBackupScheduleSetting(): Promise<BackupScheduleSetting> {
  const stored = (await db.getSetting(BACKUP_SCHEDULE_SETTING_KEY)) as BackupScheduleSetting | null;
  if (stored && typeof stored.intervalHours === 'number') {
    return {
      enabled: Boolean(stored.enabled),
      intervalHours: Math.max(1, stored.intervalHours),
    };
  }
  return DEFAULT_BACKUP_SCHEDULE;
}

export async function saveBackupScheduleSetting(setting: BackupScheduleSetting) {
  await db.setSetting(BACKUP_SCHEDULE_SETTING_KEY, {
    enabled: Boolean(setting.enabled),
    intervalHours: Math.max(1, setting.intervalHours),
  });
}
