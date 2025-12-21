import { db } from '../lib/database';
import type { ReceiptData } from '../types/printer';

export const DEVELOPER_FOOTER_SETTING_KEY = 'receipt.developerFooterEnabled';

export const DEVELOPER_FOOTER_LINES = [
  'Developed by Abees',
  'https://www.abees.me/ +923066987888',
];

export async function getDeveloperFooterEnabled(): Promise<boolean> {
  const stored = await db.getSetting(DEVELOPER_FOOTER_SETTING_KEY);
  if (stored === null || stored === undefined) {
    return true;
  }
  if (typeof stored === 'boolean') {
    return stored;
  }
  if (typeof stored === 'string') {
    return stored.toLowerCase() !== 'false';
  }
  return Boolean(stored);
}

export function attachDeveloperFooter(receipt: ReceiptData, enabled: boolean): ReceiptData {
  if (!enabled) {
    return { ...receipt, developerFooterLines: [] };
  }
  return { ...receipt, developerFooterLines: DEVELOPER_FOOTER_LINES };
}

export async function applyDeveloperFooter(receipt: ReceiptData): Promise<ReceiptData> {
  const enabled = await getDeveloperFooterEnabled();
  return attachDeveloperFooter(receipt, enabled);
}
