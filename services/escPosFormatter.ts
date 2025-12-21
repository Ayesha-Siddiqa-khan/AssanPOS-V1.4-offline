import { Buffer } from 'buffer';
import iconv from 'iconv-lite';
import type { NetworkPrinterConfig, ReceiptData, PrinterEncoding } from '../types/printer';
import { rasterizePngToEscPos } from './escPosRaster';

const ESC = 0x1b;
const GS = 0x1d;

const COMMANDS = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  UNDERLINE_ON: [ESC, 0x2d, 0x01],
  UNDERLINE_OFF: [ESC, 0x2d, 0x00],
  FONT_NORMAL: [ESC, 0x21, 0x00],
  FONT_DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
  FEED_LINE: [0x0a],
  CUT_PARTIAL: [GS, 0x56, 0x41, 0x10],
  CUT_FULL: [GS, 0x56, 0x00],
  DRAWER_KICK: [ESC, 0x70, 0x00, 0x19, 0xfa],
};

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

const lineWidthForPaper = (paperWidthMM: 58 | 80) => (paperWidthMM === 80 ? 42 : 32);

const selectCodePage = (codePage: number) => [ESC, 0x74, codePage];

function encodeText(text: string, encoding: PrinterEncoding): number[] {
  if (!text) {
    return [];
  }

  if (encoding === 'utf8') {
    if (textEncoder) {
      return Array.from(textEncoder.encode(text));
    }
    return Array.from(Buffer.from(text, 'utf8'));
  }

  try {
    return Array.from(iconv.encode(text, encoding));
  } catch (error) {
    return Array.from(Buffer.from(text, 'utf8'));
  }
}

function appendLine(target: number[], text: string, encoding: PrinterEncoding) {
  target.push(...encodeText(text, encoding));
  target.push(...COMMANDS.FEED_LINE);
}

function wrapText(text: string, width: number): string[] {
  if (text.length <= width) {
    return [text];
  }

  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      continue;
    }

    if (line) {
      lines.push(line);
    }

    if (word.length <= width) {
      line = word;
      continue;
    }

    let chunk = '';
    for (const char of word) {
      if (chunk.length + 1 > width) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    line = chunk;
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function formatColumns(left: string, right: string, width: number) {
  const available = Math.max(0, width - right.length);
  if (left.length >= available) {
    return left.slice(0, available) + right;
  }
  return left + ' '.repeat(available - left.length) + right;
}

function formatMoney(amount: number) {
  return `PKR ${Number(amount || 0).toFixed(0)}`;
}

function buildTotalsLine(label: string, amount: number, width: number) {
  return formatColumns(label, formatMoney(amount), width);
}

export function buildEscPosReceipt(
  receiptData: ReceiptData,
  profile: NetworkPrinterConfig
): Uint8Array {
  const bytes: number[] = [];
  const width = lineWidthForPaper(profile.paperWidthMM);
  const divider = '='.repeat(width);

  bytes.push(...COMMANDS.INIT);
  if (Number.isFinite(profile.codePage)) {
    bytes.push(...selectCodePage(profile.codePage));
  }

  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...COMMANDS.BOLD_ON);
  bytes.push(...COMMANDS.FONT_DOUBLE_HEIGHT);
  appendLine(bytes, receiptData.storeName, profile.encoding);
  bytes.push(...COMMANDS.FONT_NORMAL);
  bytes.push(...COMMANDS.BOLD_OFF);

  if (receiptData.address) {
    appendLine(bytes, receiptData.address, profile.encoding);
  }
  if (receiptData.phone) {
    appendLine(bytes, receiptData.phone, profile.encoding);
  }

  appendLine(bytes, divider, profile.encoding);

  bytes.push(...COMMANDS.ALIGN_LEFT);
  appendLine(bytes, `Receipt #: ${receiptData.receiptNo}`, profile.encoding);
  appendLine(bytes, `Date: ${receiptData.dateTime}`, profile.encoding);
  if (receiptData.customerName) {
    appendLine(bytes, `Customer: ${receiptData.customerName}`, profile.encoding);
  }

  appendLine(bytes, divider, profile.encoding);

  for (const item of receiptData.items) {
    bytes.push(...COMMANDS.BOLD_ON);
    const nameLines = wrapText(item.name, width);
    nameLines.forEach((line) => appendLine(bytes, line, profile.encoding));
    bytes.push(...COMMANDS.BOLD_OFF);

    const qtyLine = `${item.qty} x ${formatMoney(item.unitPrice)}`;
    const total = formatMoney(item.qty * item.unitPrice);
    appendLine(bytes, formatColumns(qtyLine, total, width), profile.encoding);
  }

  appendLine(bytes, divider, profile.encoding);

  appendLine(bytes, buildTotalsLine('Subtotal', receiptData.subtotal, width), profile.encoding);
  appendLine(bytes, buildTotalsLine('Tax', receiptData.tax, width), profile.encoding);

  bytes.push(...COMMANDS.BOLD_ON);
  bytes.push(...COMMANDS.UNDERLINE_ON);
  appendLine(bytes, buildTotalsLine('Total', receiptData.total, width), profile.encoding);
  bytes.push(...COMMANDS.BOLD_OFF);
  bytes.push(...COMMANDS.UNDERLINE_OFF);

  if (receiptData.creditUsed && receiptData.creditUsed > 0) {
    appendLine(bytes, buildTotalsLine('Credit Used', receiptData.creditUsed, width), profile.encoding);
  }
  if (receiptData.amountPaid !== undefined) {
    appendLine(bytes, buildTotalsLine('Paid', receiptData.amountPaid, width), profile.encoding);
  }
  if (receiptData.changeAmount && receiptData.changeAmount > 0) {
    appendLine(bytes, buildTotalsLine('Change', receiptData.changeAmount, width), profile.encoding);
  }
  if (receiptData.remainingBalance && receiptData.remainingBalance > 0) {
    appendLine(bytes, buildTotalsLine('Balance', receiptData.remainingBalance, width), profile.encoding);
  }

  appendLine(bytes, divider, profile.encoding);
  appendLine(bytes, `Payment: ${receiptData.paymentMethod}`, profile.encoding);

  bytes.push(...COMMANDS.ALIGN_CENTER);
  appendLine(bytes, '');
  appendLine(bytes, receiptData.footer, profile.encoding);

  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);

  if (profile.drawerKick) {
    bytes.push(...COMMANDS.DRAWER_KICK);
  }

  if (profile.cutMode === 'full') {
    bytes.push(...COMMANDS.CUT_FULL);
  } else if (profile.cutMode === 'partial') {
    bytes.push(...COMMANDS.CUT_PARTIAL);
  }

  return new Uint8Array(bytes);
}

export function buildEscPosBitmapReceipt(
  pngBase64: string,
  profile: NetworkPrinterConfig
): Uint8Array {
  const bytes: number[] = [];

  bytes.push(...COMMANDS.INIT);
  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...Array.from(rasterizePngToEscPos(pngBase64)));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);

  if (profile.drawerKick) {
    bytes.push(...COMMANDS.DRAWER_KICK);
  }

  if (profile.cutMode === 'full') {
    bytes.push(...COMMANDS.CUT_FULL);
  } else if (profile.cutMode === 'partial') {
    bytes.push(...COMMANDS.CUT_PARTIAL);
  }

  return new Uint8Array(bytes);
}
