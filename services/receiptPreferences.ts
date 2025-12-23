import type { ReceiptData } from '../types/printer';

export async function getDeveloperFooterEnabled(): Promise<boolean> {
  return false;
}

export function attachDeveloperFooter(receipt: ReceiptData, _enabled: boolean): ReceiptData {
  return { ...receipt, developerFooterLines: [] };
}

export async function applyDeveloperFooter(receipt: ReceiptData): Promise<ReceiptData> {
  return attachDeveloperFooter(receipt, false);
}
