import type { ReceiptData } from '../types/printer';
import { formatDateForDisplay, formatTimeForDisplay } from '../lib/date';

type StoreMeta = {
  storeName: string;
  address?: string;
  phone?: string;
  footer?: string;
};

export function mapSaleToReceiptData(sale: any, store: StoreMeta): ReceiptData {
  const date = formatDateForDisplay(sale?.date);
  const time = formatTimeForDisplay(sale?.time);
  const dateTime = [date, time].filter(Boolean).join(' ');

  const items = (sale?.cart || []).map((item: any) => ({
    name: item?.variantName ? `${item.name} - ${item.variantName}` : item?.name ?? 'Item',
    qty: Number(item?.quantity ?? 0),
    unitPrice: Number(item?.price ?? 0),
  }));

  return {
    storeName: store.storeName,
    address: store.address,
    phone: store.phone,
    dateTime: dateTime || new Date().toLocaleString(),
    receiptNo: String(sale?.id ?? ''),
    customerName: sale?.customer?.name || sale?.customerName || 'Walk-in Customer',
    items,
    subtotal: Number(sale?.subtotal ?? sale?.total ?? 0),
    tax: Number(sale?.tax ?? 0),
    total: Number(sale?.total ?? 0),
    amountPaid: Number(sale?.paidAmount ?? sale?.amountPaid ?? 0),
    changeAmount: Number(sale?.changeAmount ?? 0),
    remainingBalance: Number(sale?.remainingBalance ?? 0),
    creditUsed: Number(sale?.creditUsed ?? 0),
    paymentMethod: sale?.paymentMethod || 'Cash',
    footer: store.footer ?? 'Thank you for your business!',
  };
}

export function mapPurchaseToReceiptData(purchase: any, store: StoreMeta): ReceiptData {
  const date = formatDateForDisplay(purchase?.date);
  const time = formatTimeForDisplay(purchase?.time);
  const dateTime = [date, time].filter(Boolean).join(' ');

  const items = (purchase?.items || []).map((item: any) => ({
    name: item?.variantName ? `${item.name} - ${item.variantName}` : item?.name ?? 'Item',
    qty: Number(item?.quantity ?? 0),
    unitPrice: Number(item?.price ?? 0),
  }));

  return {
    storeName: store.storeName,
    address: store.address,
    phone: store.phone,
    dateTime: dateTime || new Date().toLocaleString(),
    receiptNo: `P-${purchase?.id ?? ''}`,
    customerName: purchase?.vendor?.name || 'Vendor Purchase',
    items,
    subtotal: Number(purchase?.subtotal ?? purchase?.total ?? 0),
    tax: Number(purchase?.tax ?? 0),
    total: Number(purchase?.total ?? 0),
    amountPaid: Number(purchase?.paidAmount ?? 0),
    changeAmount: Number(purchase?.changeAmount ?? 0),
    remainingBalance: Number(purchase?.remainingBalance ?? 0),
    creditUsed: Number(purchase?.creditUsed ?? 0),
    paymentMethod: purchase?.paymentMethod || 'Cash',
    footer: store.footer ?? 'Thank you for your business!',
  };
}
