import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import { Buffer } from 'buffer';

const PRINTER_SERVICE_UUID =
  process.env.EXPO_PUBLIC_PRINTER_SERVICE_UUID || '0000ffe0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC_UUID =
  process.env.EXPO_PUBLIC_PRINTER_CHARACTERISTIC_UUID || '0000ffe1-0000-1000-8000-00805f9b34fb';

// Lazy load BLE manager - only initialize when actually needed
let bleManager: any = null;
let bleInitialized = false;

function getBleManager() {
  if (bleInitialized) {
    return bleManager;
  }
  
  try {
    const ble = require('react-native-ble-plx');
    if (ble && ble.BleManager) {
      bleManager = new ble.BleManager();
      console.log('BLE initialized successfully');
    }
  } catch (e) {
    console.warn('BLE not available - Bluetooth printing disabled');
  }
  
  bleInitialized = true;
  return bleManager;
}

export type ReceiptLineItem = {
  name: string;
  quantity: number;
  price: number;
};

export type ReceiptPayload = {
  id: number | string;
  customerName?: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  lineItems: ReceiptLineItem[];
  changeAmount?: number;
  amountPaid?: number;
  remainingBalance?: number;
  creditUsed?: number;
  amountAfterCredit?: number;
};

export type StoreProfile = {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  thankYouMessage?: string;
};

export type PrinterDevice = {
  id: string;
  name: string | null;
};

export async function scanForPrinters(timeoutMs = 10000): Promise<PrinterDevice[]> {
  const manager = getBleManager();
  if (!manager) {
    throw new Error('Bluetooth is not available in Expo Go. Please use a development build.');
  }

  const discovered = new Map<string, PrinterDevice>();

  return new Promise(async (resolve, reject) => {
    try {
      // Check Bluetooth state first
      const state = await manager.state();
      if (state !== 'PoweredOn') {
        reject(new Error(`Bluetooth is ${state}. Please turn on Bluetooth and try again.`));
        return;
      }
    } catch (error) {
      // If we can't check state, try to scan anyway
      console.warn('Could not check Bluetooth state', error);
    }

    const timeout = setTimeout(() => {
      manager.stopDeviceScan();
      resolve(Array.from(discovered.values()));
    }, timeoutMs);

    try {
      manager.startDeviceScan(null, null, (error: any, device: any) => {
        if (error) {
          clearTimeout(timeout);
          manager.stopDeviceScan();
          reject(error);
          return;
        }

        if (device?.id && !discovered.has(device.id)) {
          discovered.set(device.id, { id: device.id, name: device.name });
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      manager.stopDeviceScan();
      reject(error);
    }
  });
}

export async function printReceiptViaBluetooth(deviceId: string, printable: string) {
  const manager = getBleManager();
  if (!manager) {
    throw new Error('Bluetooth is not available in Expo Go. Please use a development build.');
  }

  const device = await manager.connectToDevice(deviceId, { timeout: 10000 });
  await device.discoverAllServicesAndCharacteristics();

  const base64Payload = Buffer.from(printable, 'utf8').toString('base64');

  await device.writeCharacteristicWithResponseForService(
    PRINTER_SERVICE_UUID,
    PRINTER_CHARACTERISTIC_UUID,
    base64Payload
  );

  await device.cancelConnection();
}

export async function generateReceiptHtml(payload: ReceiptPayload, profile: StoreProfile) {
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PKR',
  });

  const fmt = (value: number | undefined | null) => formatter.format(Number(value) || 0);

  const rows = payload.lineItems
    .map((item) => {
      const lineTotal = (item.price || 0) * (item.quantity || 0);
      return `
        <tr>
          <td>${item.name}</td>
          <td style="text-align:right;">${item.quantity}</td>
          <td style="text-align:right;">${fmt(item.price)}</td>
          <td style="text-align:right;">${fmt(lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  const hasCreditUsed = (payload.creditUsed ?? 0) > 0;
  const hasAfterCredit =
    Number.isFinite(payload?.amountAfterCredit) &&
    (payload?.amountAfterCredit ?? 0) !== (payload?.total ?? 0);
  const hasPaid = Number.isFinite(payload?.amountPaid);
  const hasBalance =
    Number.isFinite(payload?.remainingBalance) && (payload?.remainingBalance ?? 0) !== 0;
  const hasChange = Number.isFinite(payload?.changeAmount) && (payload?.changeAmount ?? 0) !== 0;

  return `
    <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px 18px; color: #111827; }
          h2 { margin: 4px 0; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          th { padding: 4px 0; font-size: 13px; text-align: left; }
          td { padding: 3px 0; font-size: 13px; }
          .right { text-align: right; }
          .bold { font-weight: 700; }
          .meta { text-align: center; font-size: 11px; color: #6b7280; margin-top: 2px; }
          .divider { border-top: 1px dashed #d1d5db; margin: 12px 0; }
          .total-row td { font-weight: 700; padding-top: 2px; }
          .totals { margin-top: 6px; }
          .footer { margin-top: 18px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <h2>${profile.name}</h2>
        ${profile.address ? `<div class="meta">${profile.address}</div>` : ''}
        ${profile.phone ? `<div class="meta">${profile.phone}</div>` : ''}
        ${profile.email ? `<div class="meta">${profile.email}</div>` : ''}
        <div class="divider"></div>
        <div>Receipt #: ${payload.id}</div>
        <div>Date: ${payload.createdAt}</div>
        ${payload.customerName ? `<div>Customer: ${payload.customerName}</div>` : ''}
        <table>
          <thead>
            <tr>
              <th style="width: 58%;">Item</th>
              <th class="right" style="width: 12%;">Qty</th>
              <th class="right" style="width: 15%;">Price</th>
              <th class="right" style="width: 15%;">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <table class="totals">
          <tbody>
            <tr class="total-row">
              <td style="width: 70%;">Subtotal</td>
              <td class="right" style="width: 30%;">${fmt(payload.subtotal)}</td>
            </tr>
            <tr class="total-row">
              <td>Tax</td>
              <td class="right">${fmt(payload.tax)}</td>
            </tr>
            <tr class="total-row">
              <td>Total</td>
              <td class="right">${fmt(payload.total)}</td>
            </tr>
            ${
              hasCreditUsed
                ? `<tr class="total-row">
                    <td>Credit Used</td>
                    <td class="right">${fmt(payload.creditUsed)}</td>
                  </tr>`
                : ''
            }
            ${
              hasAfterCredit
                ? `<tr class="total-row">
                    <td>After Credit</td>
                    <td class="right">${fmt(payload?.amountAfterCredit ?? 0)}</td>
                  </tr>`
                : ''
            }
            ${
              hasPaid
                ? `<tr class="total-row">
                    <td>Paid</td>
                    <td class="right">${fmt(payload.amountPaid)}</td>
                  </tr>`
                : ''
            }
            ${
              hasBalance
                ? `<tr class="total-row">
                    <td>Balance</td>
                    <td class="right">${fmt(payload.remainingBalance)}</td>
                  </tr>`
                : ''
            }
            ${
              hasChange
                ? `<tr class="total-row">
                    <td>Change</td>
                    <td class="right">${fmt(payload.changeAmount)}</td>
                  </tr>`
                : ''
            }
          </tbody>
        </table>

        <div class="divider"></div>
        <div>Payment Method: ${payload.paymentMethod}</div>
        ${profile.thankYouMessage ? `<div class="footer">${profile.thankYouMessage}</div>` : ''}
      </body>
    </html>
  `;
}

export async function createReceiptPdf(html: string) {
  return Print.printToFileAsync({ html });
}

export async function openPrintPreview(html: string) {
  if (Platform.OS === 'web') {
    await invokePrint(html);
    return;
  }

  await invokePrint(html);
}

export async function shareReceipt(fileUri: string) {
  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }
  await Sharing.shareAsync(fileUri);
  return true;
}

async function invokePrint(html: string) {
  const printer = Print as unknown as { printAsync?: (options: { html: string }) => Promise<void> };
  if (typeof printer.printAsync === 'function') {
    await printer.printAsync({ html });
  } else {
    console.warn('printAsync is not available in expo-print module for this platform.');
  }
}

export async function emailReceipt(fileUri: string, recipients: string[]) {
  if (!(await MailComposer.isAvailableAsync())) {
    return false;
  }

  await MailComposer.composeAsync({
    subject: 'Your AsaanPOS receipt',
    recipients,
    body: 'Thank you for shopping with us. The receipt is attached.',
    attachments: [fileUri],
  });

  return true;
}
