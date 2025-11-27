import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

type CrashLogContext = {
  source?: string;
  extra?: Record<string, unknown>;
  isFatal?: boolean;
};

const MAX_LOG_FILES = 25;
const BASE_DIR = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
const LOG_DIR = BASE_DIR ? `${BASE_DIR.replace(/\/?$/, '/') }crash-logs` : null;

let initialized = false;

const ensureDirectoryAsync = async () => {
  if (!LOG_DIR) {
    return null;
  }
  try {
    await FileSystem.makeDirectoryAsync(LOG_DIR, { intermediates: true });
  } catch (error: any) {
    if (!String(error?.message ?? '').includes('exist')) {
      throw error;
    }
  }
  return LOG_DIR;
};

const pruneOldLogs = async () => {
  if (!LOG_DIR) {
    return;
  }
  try {
    const entries = await FileSystem.readDirectoryAsync(LOG_DIR);
    if (entries.length <= MAX_LOG_FILES) {
      return;
    }
    const sorted = entries.slice().sort(); // chronological due to timestamped names
    const removeCount = entries.length - MAX_LOG_FILES;
    const toRemove = sorted.slice(0, removeCount);
    await Promise.all(
      toRemove.map((file) =>
        FileSystem.deleteAsync(`${LOG_DIR}/${file}`, { idempotent: true })
      )
    );
  } catch (error) {
    console.warn?.('[CrashLogger] Failed to prune logs', error);
  }
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return {
        ...error,
      };
    } catch {
      return { message: '[object Object]' };
    }
  }
  return { message: String(error) };
};

const persistCrashLog = async (
  kind: string,
  error: unknown,
  context: CrashLogContext = {}
) => {
  if (!LOG_DIR) {
    return;
  }
  try {
    await ensureDirectoryAsync();
    const timestamp = new Date().toISOString();
    const safeTimestamp = timestamp.replace(/[:.]/g, '-');
    const payload = {
      timestamp,
      kind,
      platform: Platform.OS,
      platformVersion: Platform.Version,
      context,
      error: serializeError(error),
    };
    const filePath = `${LOG_DIR}/log-${safeTimestamp}.json`;
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(payload, null, 2));
    await pruneOldLogs();
  } catch (logError) {
    console.warn?.('[CrashLogger] Failed to write crash log', logError);
  }
};

const registerUnhandledRejectionHandler = () => {
  if (typeof globalThis === 'undefined') {
    return;
  }
  const previousHandler = (globalThis as any).onunhandledrejection;
  (globalThis as any).onunhandledrejection = (event: any) => {
    persistCrashLog('unhandledRejection', event?.reason ?? event, { source: 'promise' });
    previousHandler?.(event);
  };
};

export const initCrashLogger = () => {
  if (initialized) {
    return;
  }
  initialized = true;

  if (!LOG_DIR) {
    console.warn('[CrashLogger] No writable directory available; crash logs disabled.');
    return;
  }

  const defaultHandler =
    (global as any).ErrorUtils?.getGlobalHandler?.() ?? ((error: unknown) => console.error(error));

  if ((global as any).ErrorUtils?.setGlobalHandler) {
    (global as any).ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      persistCrashLog('globalError', error, { isFatal, source: 'ErrorUtils' });
      defaultHandler(error, isFatal);
    });
  }

  registerUnhandledRejectionHandler();
};

export const logHandledError = (error: unknown, context?: CrashLogContext) =>
  persistCrashLog('handled', error, context);

export const getCrashLogDirectory = () => LOG_DIR;

export const listCrashLogs = async () => {
  if (!LOG_DIR) {
    return [];
  }
  try {
    const files = await FileSystem.readDirectoryAsync(LOG_DIR);
    return files.slice().sort().reverse();
  } catch {
    return [];
  }
};

export const readCrashLog = async (fileName: string) => {
  if (!LOG_DIR) {
    return null;
  }
  try {
    const content = await FileSystem.readAsStringAsync(`${LOG_DIR}/${fileName}`);
    return JSON.parse(content);
  } catch {
    return null;
  }
};

export const clearCrashLogs = async () => {
  if (!LOG_DIR) {
    return;
  }
  try {
    await FileSystem.deleteAsync(LOG_DIR, { idempotent: true });
  } catch (error) {
    console.warn?.('[CrashLogger] Failed to clear crash logs', error);
  }
};
