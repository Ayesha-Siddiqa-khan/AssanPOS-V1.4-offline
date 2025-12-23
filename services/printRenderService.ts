import type { NetworkPrinterConfig, ReceiptData } from '../types/printer';

export type ReceiptRenderer = (receipt: ReceiptData, profile: NetworkPrinterConfig) => Promise<string>;

let receiptRenderer: ReceiptRenderer | null = null;

export function registerReceiptRenderer(renderer: ReceiptRenderer | null) {
  receiptRenderer = renderer;
}

export async function renderReceiptToBitmap(
  receipt: ReceiptData,
  profile: NetworkPrinterConfig
): Promise<string> {
  if (!receiptRenderer) {
    throw new Error('Bitmap renderer is not available on this build.');
  }
  return receiptRenderer(receipt, profile);
}
