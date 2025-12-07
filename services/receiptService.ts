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

export type ThermalPageOptions = {
  widthMm?: number;
  heightMm?: number;
};

const MM_TO_PT = 2.83465; // PDF uses points; 1 mm = 2.83465 pt
const DEFAULT_THERMAL_WIDTH_MM = 80;
const FALLBACK_THERMAL_WIDTH_MM = 58;

function resolveThermalWidth(widthMm?: number) {
  const fromEnv = process.env.EXPO_PUBLIC_PRINTER_WIDTH_MM
    ? Number(process.env.EXPO_PUBLIC_PRINTER_WIDTH_MM)
    : undefined;
  const candidate = Number.isFinite(widthMm) ? widthMm : fromEnv;
  if (Number.isFinite(candidate)) {
    // Clamp to the two supported widths (58mm or 80mm)
    return candidate <= 60 ? FALLBACK_THERMAL_WIDTH_MM : DEFAULT_THERMAL_WIDTH_MM;
  }
  return DEFAULT_THERMAL_WIDTH_MM;
}

function mmToPt(valueMm: number) {
  return valueMm * MM_TO_PT;
}

function estimateThermalHeightMm(html: string, widthMm: number) {
  // Rough heuristic: base height + a few mm per content row, clamped to a sane max.
  const rowMatches = html.match(/<tr/gi)?.length ?? 0;
  const paragraphMatches = html.match(/<p/gi)?.length ?? 0;
  const divMatches = html.match(/<div/gi)?.length ?? 0;
  const lineBreaks = html.match(/<br/gi)?.length ?? 0;
  const estimatedLines = rowMatches * 1.5 + paragraphMatches + lineBreaks + divMatches * 0.25;
  const baseHeight = 120; // mm
  const dynamicHeight = estimatedLines * 6; // mm per line
  const total = Math.max(baseHeight + dynamicHeight, baseHeight + 40);
  // Cap to avoid unbounded pages while still allowing long receipts
  return Math.min(total, 1200);
}

function withThermalPageSize(html: string, widthMm: number, heightMm: number) {
  const widthPx = Math.round(widthMm * 3.7795); // 1mm = ~3.78px at 96 DPI
  const pageStyle = `
    <meta name="viewport" content="width=${widthPx}, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      @page { 
        size: ${widthMm}mm ${heightMm}mm; 
        margin: 0mm; 
      }
      * { 
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html { 
        width: ${widthMm}mm; 
        height: ${heightMm}mm;
        margin: 0; 
        padding: 0; 
      }
      body { 
        width: ${widthMm}mm; 
        margin: 0; 
        padding: 0;
        overflow-x: hidden;
      }
      @media print {
        html, body {
          width: ${widthMm}mm !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      }
    </style>
  `;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${pageStyle}</head>`);
  }
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${pageStyle}`);
  }
  return `<!DOCTYPE html><html><head>${pageStyle}</head>${html}</html>`;
}

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
        <div class="item-name">${item.name}</div>
        <div class="item-details">
          <span>${item.quantity} x ${fmt(item.price)}</span>
          <span>${fmt(lineTotal)}</span>
        </div>
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
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Courier New', monospace; 
            padding: 0;
            margin: 0;
            color: #000; 
            font-size: 12px;
            line-height: 1.3;
            width: 100%;
          }
          .container {
            padding: 8px;
            width: 100%;
          }
          h2 { 
            margin: 0 0 4px 0; 
            text-align: center; 
            font-size: 16px;
            font-weight: bold;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 8px 0; 
          }
          td { 
            padding: 2px 0; 
            font-size: 12px; 
          }
          .meta { 
            text-align: center; 
            font-size: 11px; 
            margin: 2px 0; 
          }
          .divider { 
            text-align: center;
            margin: 8px 0;
            font-size: 12px;
          }
          .item-name {
            font-weight: bold;
            margin-bottom: 2px;
          }
          .item-details {
            font-size: 11px;
            margin-bottom: 6px;
            display: flex;
            justify-content: space-between;
          }
          .total-section {
            margin: 8px 0;
          }
          .total-row { 
            display: flex; 
            justify-content: space-between; 
            padding: 3px 0;
            font-size: 12px;
          }
          .total-row.main { 
            font-weight: bold; 
            font-size: 14px;
            padding: 5px 0;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            margin: 4px 0;
          }
          .footer { 
            margin-top: 12px; 
            text-align: center; 
            font-size: 11px; 
          }
          .info-line {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
            font-size: 11px;
          }
          .info-label {
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>${profile.name}</h2>
          ${profile.address ? `<div class="meta">${profile.address}</div>` : ''}
          ${profile.phone ? `<div class="meta">${profile.phone}</div>` : ''}
          ${profile.email ? `<div class="meta">${profile.email}</div>` : ''}
          
          <div class="divider">================================</div>
          
          <div class="info-line">
            <span class="info-label">Receipt #:</span>
            <span>${payload.id}</span>
          </div>
          <div class="info-line">
            <span class="info-label">Date:</span>
            <span>${payload.createdAt}</span>
          </div>
          ${payload.customerName ? `<div class="info-line">
            <span class="info-label">Customer:</span>
            <span>${payload.customerName}</span>
          </div>` : ''}
          
          <div class="divider">================================</div>
          
          <div>${rows}</div>

          <div class="divider">================================</div>

          <div class="total-section">
            <div class="total-row">
              <span>Subtotal</span>
              <span>${fmt(payload.subtotal)}</span>
            </div>
            <div class="total-row">
              <span>Tax</span>
              <span>${fmt(payload.tax)}</span>
            </div>
            <div class="total-row main">
              <span>Total</span>
              <span>${fmt(payload.total)}</span>
            </div>
            ${
              hasCreditUsed
                ? `<div class="total-row">
                    <span>Credit Used</span>
                    <span>${fmt(payload.creditUsed)}</span>
                  </div>`
                : ''
            }
            ${
              hasAfterCredit
                ? `<div class="total-row">
                    <span>After Credit</span>
                    <span>${fmt(payload?.amountAfterCredit ?? 0)}</span>
                  </div>`
                : ''
            }
            ${
              hasPaid
                ? `<div class="total-row">
                    <span>Paid</span>
                    <span>${fmt(payload.amountPaid)}</span>
                  </div>`
                : ''
            }
            ${
              hasBalance
                ? `<div class="total-row">
                    <span>Balance</span>
                    <span>${fmt(payload.remainingBalance)}</span>
                  </div>`
                : ''
            }
            ${
              hasChange
                ? `<div class="total-row">
                    <span>Change</span>
                    <span>${fmt(payload.changeAmount)}</span>
                  </div>`
                : ''
            }
          </div>

          <div class="divider">================================</div>
          
          <div class="info-line">
            <span class="info-label">Payment:</span>
            <span>${payload.paymentMethod}</span>
          </div>
          
          ${profile.thankYouMessage ? `<div class="footer">${profile.thankYouMessage}</div>` : '<div class="footer">Thank you for your business!</div>'}
        </div>
      </body>
    </html>
  `;
}

export async function createReceiptPdf(html: string, options?: ThermalPageOptions) {
  const widthMm = resolveThermalWidth(options?.widthMm);
  const heightMm = options?.heightMm ?? estimateThermalHeightMm(html, widthMm);
  const normalizedHtml = withThermalPageSize(html, widthMm, heightMm);

  const printOptions: any = {
    html: normalizedHtml,
    base64: false,
    width: mmToPt(widthMm),
    height: mmToPt(heightMm),
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
    orientation: 'portrait',
    useMarkupHeight: true,
  };

  return Print.printToFileAsync(printOptions);
}

export async function openPrintPreview(html: string, options?: ThermalPageOptions) {
  const widthMm = resolveThermalWidth(options?.widthMm);
  const heightMm = options?.heightMm ?? estimateThermalHeightMm(html, widthMm);
  const normalizedHtml = withThermalPageSize(html, widthMm, heightMm);

  if (Platform.OS === 'web') {
    await invokePrint(normalizedHtml, widthMm, heightMm);
    return;
  }

  await invokePrint(normalizedHtml, widthMm, heightMm);
}

export async function shareReceipt(fileUri: string) {
  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }
  await Sharing.shareAsync(fileUri);
  return true;
}

async function invokePrint(html: string, widthMm: number, heightMm: number) {
  const printer = Print as unknown as { printAsync?: (options: { html: string }) => Promise<void> };
  if (typeof printer.printAsync === 'function') {
    const options: any = {
      html,
      width: mmToPt(widthMm),
      height: mmToPt(heightMm),
      margins: { top: 0, left: 0, right: 0, bottom: 0 },
      orientation: 'portrait',
      useMarkupHeight: true,
    };
    await printer.printAsync(options);
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
