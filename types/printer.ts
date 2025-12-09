export type PrinterType = 'ESC_POS' | 'BLUETOOTH' | 'USB' | 'PDF';

export interface NetworkPrinterConfig {
  id: string;
  name: string;
  type: PrinterType;
  ip: string;
  port: number;      // default 9100
  paperWidthMM: 58 | 80;
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
}

export interface PrinterStatus {
  success: boolean;
  message: string;
  error?: string;
}
