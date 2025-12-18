import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
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

export type ShareReceiptOptions = {
  fileName?: string;
  dialogTitle?: string;
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

function sanitizePdfFileName(name: string) {
  const trimmed = (name || '').trim();
  const base = trimmed.length ? trimmed : 'Receipt';
  const withExt = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  // Remove characters that are problematic on common filesystems / Android shares
  return withExt
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensureShareablePdfUri(fileUri: string, fileName?: string) {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) return fileUri;

  const safeName = sanitizePdfFileName(fileName ?? 'Receipt');
  const targetUri = `${dir}${safeName}`;

  // Best-effort replace existing file.
  try {
    await FileSystem.deleteAsync(targetUri, { idempotent: true });
  } catch {
    // ignore
  }

  // Copy instead of move to avoid edge cases across providers.
  await FileSystem.copyAsync({ from: fileUri, to: targetUri });
  return targetUri;
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
  const widthInches = (widthMm / 25.4).toFixed(2);
  const heightInches = (heightMm / 25.4).toFixed(2);
  
  const pageStyle = `
    <meta name="viewport" content="width=${widthPx}, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      @page { 
        size: ${widthMm}mm ${heightMm}mm; 
        margin: 0mm;
      }
      @page :first {
        size: ${widthMm}mm ${heightMm}mm;
        margin: 0mm;
      }
      @media print {
        @page {
          size: ${widthInches}in ${heightInches}in;
          margin: 0;
        }
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

  const items = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const itemRows = items
    .map((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const lineTotal = price * qty;
      return `
        <tr>
          <td class="col-desc">${item.name ?? ''}</td>
          <td class="col-price">${fmt(price)}</td>
          <td class="col-qty">${qty}</td>
          <td class="col-amt">${fmt(lineTotal)}</td>
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
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Receipt #${payload.id}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Courier New', monospace;
            color: #000;
            font-size: 18px;
            line-height: 1.35;
            width: 100%;
          }

          .container { padding: 6px 8px 10px 8px; width: 100%; }

          .title {
            text-align: center;
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 0.3px;
            margin-bottom: 2px;
          }
          .submeta { text-align: center; font-size: 15px; margin: 1px 0; }

          .rule { text-align: center; margin: 10px 0; font-size: 14px; }

          .kv {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin: 4px 0;
            font-size: 16px;
          }
          .kv .k { font-weight: 800; }

          table.items {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0 6px 0;
            table-layout: fixed;
          }
          table.items th {
            font-size: 14px;
            text-align: left;
            padding: 4px 0;
            border-bottom: 1px solid #000;
          }
          table.items td {
            font-size: 16px;
            padding: 4px 0;
            vertical-align: top;
          }

          .col-desc { width: 48%; word-wrap: break-word; }
          .col-price { width: 20%; text-align: right; padding-right: 4px; }
          .col-qty { width: 10%; text-align: center; }
          .col-amt { width: 22%; text-align: right; }

          .totals { margin-top: 6px; }
          .totals .row {
            display: flex;
            justify-content: space-between;
            margin: 4px 0;
            font-size: 16px;
          }
          .totals .row strong { font-weight: 900; }

          .net {
            border: 2px solid #000;
            padding: 8px 10px;
            margin: 10px 0;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 10px;
          }
          .net .label { font-size: 18px; font-weight: 900; }
          .net .value { font-size: 26px; font-weight: 900; }

          .footer { margin-top: 10px; text-align: center; font-size: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="title">${profile.name}</div>
          ${profile.address ? `<div class="submeta">${profile.address}</div>` : ''}
          ${profile.phone ? `<div class="submeta">${profile.phone}</div>` : ''}
          ${profile.email ? `<div class="submeta">${profile.email}</div>` : ''}

          <div class="rule">================================</div>

          <div class="kv"><span class="k">Invoice #:</span><span>${payload.id}</span></div>
          <div class="kv"><span class="k">Date:</span><span>${payload.createdAt}</span></div>
          ${payload.customerName ? `<div class="kv"><span class="k">Bill To:</span><span>${payload.customerName}</span></div>` : ''}
          <div class="kv"><span class="k">Items:</span><span>${items.length}</span></div>

          <div class="rule">================================</div>

          <table class="items">
            <thead>
              <tr>
                <th class="col-desc">Description</th>
                <th class="col-price">Price</th>
                <th class="col-qty">Qty</th>
                <th class="col-amt">Amnt</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows || `<tr><td class="col-desc">(No items)</td><td class="col-price"></td><td class="col-qty"></td><td class="col-amt"></td></tr>`}
            </tbody>
          </table>

          <div class="rule">================================</div>

          <div class="totals">
            <div class="row"><span>Subtotal</span><span>${fmt(payload.subtotal)}</span></div>
            <div class="row"><span>Tax</span><span>${fmt(payload.tax)}</span></div>
            <div class="row"><strong>Total</strong><strong>${fmt(payload.total)}</strong></div>
            ${hasCreditUsed ? `<div class="row"><span>Credit Used</span><span>- ${fmt(payload.creditUsed)}</span></div>` : ''}
            ${hasAfterCredit ? `<div class="row"><span>After Credit</span><span>${fmt(payload.amountAfterCredit)}</span></div>` : ''}
          </div>

          <div class="net">
            <div class="label">Net Amount</div>
            <div class="value">${fmt(payload.total)}</div>
          </div>

          <div class="totals">
            ${hasPaid ? `<div class="row"><span>Paid Amount</span><span>${fmt(payload.amountPaid)}</span></div>` : ''}
            ${hasChange ? `<div class="row"><span>Change</span><span>${fmt(payload.changeAmount)}</span></div>` : ''}
            ${hasBalance ? `<div class="row"><span>Balance</span><span>${fmt(payload.remainingBalance)}</span></div>` : ''}
            <div class="row"><span>Payment</span><span>${payload.paymentMethod}</span></div>
          </div>

          <div class="rule">================================</div>

          ${profile.thankYouMessage ? `<div class="footer">${profile.thankYouMessage}</div>` : '<div class="footer">Thank you for your business!</div>'}
        </div>
      </body>
    </html>
  `;
}

export async function createReceiptPdf(
  html: string,
  options?: ThermalPageOptions & { fileName?: string }
) {
  const widthMm = resolveThermalWidth(options?.widthMm);
  const heightMm = options?.heightMm ?? estimateThermalHeightMm(html, widthMm);
  const normalizedHtml = withThermalPageSize(html, widthMm, heightMm);

  const printOptions: any = {
    html: normalizedHtml,
    base64: false,
    width: mmToPt(widthMm),
    height: mmToPt(heightMm),
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
    printerMargins: { top: 0, left: 0, right: 0, bottom: 0 },
    orientation: 'portrait',
    useMarkupHeight: true,
  };

  const result = await Print.printToFileAsync(printOptions);
  if (options?.fileName) {
    const uri = await ensureShareablePdfUri(result.uri, options.fileName);
    return { ...result, uri };
  }
  return result;
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

export async function shareReceipt(fileUri: string, options?: ShareReceiptOptions) {
  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  const shareUri = await ensureShareablePdfUri(fileUri, options?.fileName);

  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    dialogTitle: options?.dialogTitle,
    UTI: Platform.OS === 'ios' ? 'com.adobe.pdf' : undefined,
  });
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
      printerMargins: { top: 0, left: 0, right: 0, bottom: 0 },
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
