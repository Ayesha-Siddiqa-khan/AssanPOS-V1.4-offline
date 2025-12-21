export type PrinterType = 'ESC_POS' | 'BLUETOOTH' | 'USB' | 'PDF';
export type PrinterCutMode = 'partial' | 'full' | 'none';
export type PrinterEncoding =
  | 'cp437'
  | 'cp850'
  | 'cp852'
  | 'cp858'
  | 'cp860'
  | 'cp863'
  | 'cp865'
  | 'cp866'
  | 'cp864'
  | 'cp1252'
  | 'cp1256'
  | 'utf8';

export interface NetworkPrinterConfig {
  id: string;
  name: string;
  type: PrinterType;
  ip: string;
  port: number;      // default 9100
  paperWidthMM: 58 | 80;
  encoding: PrinterEncoding;
  codePage: number;
  cutMode: PrinterCutMode;
  drawerKick: boolean;
  bitmapFallback: boolean;
  isDefault: boolean;
}

export interface ReceiptItem {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface ReceiptData {
  storeName: string;
  address?: string;
  phone?: string;
  dateTime: string;
  receiptNo: string;
  customerName?: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid?: number;
  changeAmount?: number;
  remainingBalance?: number;
  creditUsed?: number;
  paymentMethod: string;
  footer: string;
  developerFooterLines?: string[];
}

export interface PrinterStatus {
  success: boolean;
  message: string;
  error?: string;
}

export type PrintJobStatus = 'pending' | 'printing' | 'retrying' | 'success' | 'failed' | 'cancelled';
export type PrintJobType = 'receipt' | 'test';

export interface PrintJob {
  id: number;
  profileId: string | null;
  type: PrintJobType;
  payload: ReceiptData;
  status: PrintJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
}
