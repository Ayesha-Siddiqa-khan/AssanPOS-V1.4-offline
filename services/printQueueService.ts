import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../lib/database';
import type { NetworkPrinterConfig, ReceiptData, PrintJob } from '../types/printer';
import { printerService, buildTestReceiptData } from './escPosPrinterService';
import { applyDeveloperFooter } from './receiptPreferences';

const LEGACY_MIGRATION_KEY = 'printerProfilesMigrated';
const RETRY_BASE_DELAY_MS = 4000;
const RETRY_MAX_DELAY_MS = 60000;
const PRINT_JOB_TIMEOUT_MS = 20000;

let processing = false;
let processingStartedAt: number | null = null;
let workerTimer: NodeJS.Timeout | null = null;
let appStateListener: { remove: () => void } | null = null;
let workerStarted = false;

const computeBackoffMs = (attempts: number) => {
  const delay = RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(delay, RETRY_MAX_DELAY_MS);
};

export async function migrateLegacyPrinters() {
  try {
    const migrated = await AsyncStorage.getItem(LEGACY_MIGRATION_KEY);
    if (migrated === '1') {
      return;
    }

    const raw = await AsyncStorage.getItem('savedPrinters');
    if (!raw) {
      await AsyncStorage.setItem(LEGACY_MIGRATION_KEY, '1');
      return;
    }

    const legacyPrinters = JSON.parse(raw) as Array<any>;
    for (const legacy of legacyPrinters) {
      if (legacy?.type !== 'network' && legacy?.type !== 'ESC_POS') {
        continue;
      }
      const id = legacy.id || `${legacy.ip || 'printer'}-${Date.now()}`;
      await db.upsertPrinterProfile({
        id,
        name: legacy.name || `Printer ${legacy.ip || ''}`,
        type: 'ESC_POS',
        ip: legacy.ip,
        port: Number(legacy.port || 9100),
        paperWidthMM: legacy.paperWidthMM === 58 ? 58 : 80,
        encoding: 'cp437',
        codePage: 0,
        cutMode: 'partial',
        drawerKick: false,
        bitmapFallback: false,
        isDefault: Boolean(legacy.isDefault),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const profiles = await db.listPrinterProfiles();
    if (!profiles.some((profile) => profile.isDefault) && profiles.length > 0) {
      await db.setDefaultPrinterProfile(profiles[0].id);
    }

    await AsyncStorage.removeItem('savedPrinters');
    await AsyncStorage.setItem(LEGACY_MIGRATION_KEY, '1');
  } catch (error) {
    console.warn('Printer migration failed', error);
  }
}

export async function enqueueReceiptPrint(
  profile: NetworkPrinterConfig,
  payload: ReceiptData,
  options?: { maxAttempts?: number; type?: 'receipt' | 'test' }
): Promise<number> {
  void startPrintQueueWorker();
  const jobId = await db.createPrintJob({
    profileId: profile.id,
    type: options?.type ?? 'receipt',
    payload,
    maxAttempts: options?.maxAttempts ?? 3,
  });
  void processPrintQueue({ force: true });
  return jobId;
}

export async function enqueueTestPrint(profile: NetworkPrinterConfig): Promise<number> {
  const payload = await applyDeveloperFooter(
    buildTestReceiptData(profile, {
      storeName: profile.name,
    })
  );
  return enqueueReceiptPrint(profile, payload, { type: 'test' });
}

export async function processPrintQueue(options?: { force?: boolean }) {
  if (processing && !options?.force) {
    const now = Date.now();
    if (!processingStartedAt || now - processingStartedAt < PRINT_JOB_TIMEOUT_MS * 2) {
      return;
    }
    processing = false;
  }
  processing = true;
  processingStartedAt = Date.now();
  try {
    let job = await db.getNextPendingPrintJob();
    while (job) {
      await executePrintJob(job);
      job = await db.getNextPendingPrintJob();
    }
  } finally {
    processing = false;
    processingStartedAt = null;
  }
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Print timed out')), timeoutMs);
      promise.then(resolve).catch(reject);
    });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function executePrintJob(job: PrintJob) {
  const profile = job.profileId ? await db.getPrinterProfile(job.profileId) : null;
  if (!profile) {
    const attempts = job.attempts + 1;
    await db.updatePrintJob(job.id, {
      status: attempts >= job.maxAttempts ? 'failed' : 'retrying',
      attempts,
      lastError: 'Printer profile not found',
      lastAttemptAt: new Date().toISOString(),
      nextAttemptAt:
        attempts >= job.maxAttempts
          ? null
          : new Date(Date.now() + computeBackoffMs(attempts)).toISOString(),
    });
    return;
  }

  const attempts = job.attempts + 1;
  await db.updatePrintJob(job.id, {
    status: 'printing',
    attempts,
    lastError: null,
    lastAttemptAt: new Date().toISOString(),
    nextAttemptAt: null,
  });

  let result;
  try {
    result = await runWithTimeout(
      printerService.printReceipt(profile, job.payload as ReceiptData),
      PRINT_JOB_TIMEOUT_MS
    );
  } catch (error: any) {
    result = {
      success: false,
      message: 'Print timed out - check printer connection',
      error: error?.message || 'PRINT_TIMEOUT',
    };
  }
  if (result.success) {
    await db.updatePrintJob(job.id, {
      status: 'success',
      lastError: null,
      nextAttemptAt: null,
    });
    return;
  }

  const shouldRetry = attempts < job.maxAttempts;
  await db.updatePrintJob(job.id, {
    status: shouldRetry ? 'retrying' : 'failed',
    lastError: result.message || result.error || 'Print failed',
    nextAttemptAt: shouldRetry
      ? new Date(Date.now() + computeBackoffMs(attempts)).toISOString()
      : null,
  });
}

export async function listPrintJobs(limit = 100) {
  return db.listPrintJobs(limit);
}

export async function getPrintJob(id: number) {
  return db.getPrintJob(id);
}

export async function retryPrintJob(id: number) {
  return db.updatePrintJob(id, {
    status: 'pending',
    nextAttemptAt: null,
    lastError: null,
  });
}

export async function cancelPrintJob(id: number) {
  return db.updatePrintJob(id, {
    status: 'cancelled',
    nextAttemptAt: null,
  });
}

export async function clearSuccessfulJobs() {
  return db.deletePrintJobsByStatus(['success']);
}

export async function startPrintQueueWorker() {
  if (workerStarted) {
    return;
  }
  workerStarted = true;
  await migrateLegacyPrinters();
  void processPrintQueue({ force: true });
  if (!workerTimer) {
    workerTimer = setInterval(() => {
      void processPrintQueue();
    }, 4000);
  }
  if (!appStateListener) {
    appStateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void processPrintQueue();
      }
    });
  }
}

export function stopPrintQueueWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  if (appStateListener) {
    appStateListener.remove();
    appStateListener = null;
  }
}
