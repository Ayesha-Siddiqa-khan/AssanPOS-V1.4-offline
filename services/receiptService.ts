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

  const rows = payload.lineItems
    .map((item) => {
      const lineTotal = (item.price || 0) * (item.quantity || 0);
      return `
        <tr>
          <td>${item.name}</td>
          <td style="text-align:right;">${item.quantity}</td>
          <td style="text-align:right;">${formatter.format(item.price)}</td>
          <td style="text-align:right;">${formatter.format(lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; }
          h1, h2, h3 { margin: 4px 0; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { padding: 4px 0; }
          tfoot td { font-weight: bold; }
          .meta { text-align: center; font-size: 12px; color: #6b7280; margin-top: 4px; }
          .divider { border-top: 1px dashed #d1d5db; margin: 12px 0; }
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
                <th style="text-align:left;">Item</th>
                <th style="text-align:right;">Qty</th>
                <th style="text-align:right;">Price</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="3">Subtotal</td>
                <td style="text-align:right;">${formatter.format(payload.subtotal)}</td>
              </tr>
              <tr>
                <td colspan="3">Tax</td>
                <td style="text-align:right;">${formatter.format(payload.tax)}</td>
              </tr>
              <tr>
                <td colspan="3">Total</td>
                <td style="text-align:right;">${formatter.format(payload.total)}</td>
              </tr>
              ${
                payload.amountPaid
                  ? `<tr>
                      <td colspan="3">Paid</td>
                      <td style="text-align:right;">${formatter.format(payload.amountPaid)}</td>
                    </tr>`
                    : ''
              }
              ${
                payload.changeAmount
                  ? `<tr>
                      <td colspan="3">Change</td>
                      <td style="text-align:right;">${formatter.format(payload.changeAmount)}</td>
                    </tr>`
                    : ''
              }
            </tfoot>
        </table>
        <div class="divider"></div>
        <div>Payment Method: ${payload.paymentMethod}</div>
        ${
          profile.thankYouMessage
            ? `<div class="meta" style="margin-top:16px;">${profile.thankYouMessage}</div>`
            : ''
        }
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
