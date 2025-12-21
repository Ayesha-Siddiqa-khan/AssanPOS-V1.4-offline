import type { ReceiptData } from '../types/printer';

const ARABIC_REGEX = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;

const hasArabic = (value?: string | null) => {
  if (!value) {
    return false;
  }
  return ARABIC_REGEX.test(value);
};

export function receiptNeedsBitmapFallback(receipt: ReceiptData): boolean {
  if (
    hasArabic(receipt.storeName) ||
    hasArabic(receipt.address) ||
    hasArabic(receipt.phone) ||
    hasArabic(receipt.dateTime) ||
    hasArabic(receipt.receiptNo) ||
    hasArabic(receipt.customerName) ||
    hasArabic(receipt.paymentMethod) ||
    hasArabic(receipt.footer)
  ) {
    return true;
  }

  return receipt.items.some((item) => hasArabic(item.name));
}
