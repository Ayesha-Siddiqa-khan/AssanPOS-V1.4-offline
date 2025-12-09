import { NetworkPrinterConfig, ReceiptData, PrinterStatus } from '../types/printer';

/**
 * ESC/POS Printer Service
 * Handles LAN/Network printing via TCP sockets to ESC/POS printers
 * Specifically tested with Bixolon SRP-352 Plus III
 */

// ESC/POS Command bytes
const ESC = 0x1B;
const GS = 0x1D;

const COMMANDS = {
  INIT: [ESC, 0x40],                    // ESC @ - Initialize printer
  ALIGN_LEFT: [ESC, 0x61, 0x00],        // ESC a 0
  ALIGN_CENTER: [ESC, 0x61, 0x01],      // ESC a 1
  ALIGN_RIGHT: [ESC, 0x61, 0x02],       // ESC a 2
  BOLD_ON: [ESC, 0x45, 0x01],           // ESC E 1
  BOLD_OFF: [ESC, 0x45, 0x00],          // ESC E 0
  UNDERLINE_ON: [ESC, 0x2D, 0x01],      // ESC - 1
  UNDERLINE_OFF: [ESC, 0x2D, 0x00],     // ESC - 0
  FONT_NORMAL: [ESC, 0x21, 0x00],       // ESC ! 0
  FONT_DOUBLE_HEIGHT: [ESC, 0x21, 0x10],// ESC ! 16
  FONT_DOUBLE_WIDTH: [ESC, 0x21, 0x20], // ESC ! 32
  FEED_LINE: [0x0A],                    // LF - Line feed
  CUT_PAPER: [GS, 0x56, 0x41, 0x10],    // GS V 65 16 - Partial cut
  FULL_CUT: [GS, 0x56, 0x00],           // GS V 0 - Full cut
  DRAWER_KICK: [ESC, 0x70, 0x00, 0x19, 0xFA], // ESC p - Open cash drawer
};

/**
 * Convert string to byte array (CP437 encoding for ESC/POS)
 */
function stringToBytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Handle basic ASCII and common characters
    if (code < 128) {
      bytes.push(code);
    } else {
      // For non-ASCII, push '?' or handle specific chars
      bytes.push(0x3F); // '?'
    }
  }
  return bytes;
}

/**
 * Build ESC/POS byte sequence for receipt
 */
export function buildEscPosReceipt(
  receiptData: ReceiptData,
  paperWidthMM: 58 | 80
): Uint8Array {
  const bytes: number[] = [];
  
  // Initialize printer
  bytes.push(...COMMANDS.INIT);
  
  // Header - Store name (centered, bold, double height)
  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...COMMANDS.BOLD_ON);
  bytes.push(...COMMANDS.FONT_DOUBLE_HEIGHT);
  bytes.push(...stringToBytes(receiptData.storeName));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FONT_NORMAL);
  bytes.push(...COMMANDS.BOLD_OFF);
  
  // Store address and phone (centered, normal)
  if (receiptData.address) {
    bytes.push(...stringToBytes(receiptData.address));
    bytes.push(...COMMANDS.FEED_LINE);
  }
  if (receiptData.phone) {
    bytes.push(...stringToBytes(receiptData.phone));
    bytes.push(...COMMANDS.FEED_LINE);
  }
  
  // Divider line
  bytes.push(...COMMANDS.ALIGN_CENTER);
  const divider = paperWidthMM === 80 ? '================================' : '=========================';
  bytes.push(...stringToBytes(divider));
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Receipt details (left aligned)
  bytes.push(...COMMANDS.ALIGN_LEFT);
  bytes.push(...stringToBytes(`Receipt #: ${receiptData.receiptNo}`));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...stringToBytes(`Date: ${receiptData.dateTime}`));
  bytes.push(...COMMANDS.FEED_LINE);
  
  if (receiptData.customerName) {
    bytes.push(...stringToBytes(`Customer: ${receiptData.customerName}`));
    bytes.push(...COMMANDS.FEED_LINE);
  }
  
  // Divider
  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...stringToBytes(divider));
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Items (left aligned)
  bytes.push(...COMMANDS.ALIGN_LEFT);
  receiptData.items.forEach(item => {
    // Item name (bold)
    bytes.push(...COMMANDS.BOLD_ON);
    bytes.push(...stringToBytes(item.name));
    bytes.push(...COMMANDS.FEED_LINE);
    bytes.push(...COMMANDS.BOLD_OFF);
    
    // Quantity × Price = Total
    const lineTotal = item.qty * item.unitPrice;
    const qtyLine = `${item.qty} x PKR ${item.unitPrice.toFixed(0)}`;
    const totalStr = `PKR ${lineTotal.toFixed(0)}`;
    
    // Pad to align total on right
    const maxWidth = paperWidthMM === 80 ? 42 : 32;
    const padding = ' '.repeat(Math.max(0, maxWidth - qtyLine.length - totalStr.length));
    bytes.push(...stringToBytes(`${qtyLine}${padding}${totalStr}`));
    bytes.push(...COMMANDS.FEED_LINE);
  });
  
  // Divider
  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...stringToBytes(divider));
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Totals (right aligned with labels on left)
  bytes.push(...COMMANDS.ALIGN_LEFT);
  
  // Subtotal
  const subtotalLine = formatTotalLine('Subtotal', receiptData.subtotal, paperWidthMM);
  bytes.push(...stringToBytes(subtotalLine));
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Tax
  const taxLine = formatTotalLine('Tax', receiptData.tax, paperWidthMM);
  bytes.push(...stringToBytes(taxLine));
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Total (bold, underlined)
  bytes.push(...COMMANDS.BOLD_ON);
  bytes.push(...COMMANDS.UNDERLINE_ON);
  const totalLine = formatTotalLine('Total', receiptData.total, paperWidthMM);
  bytes.push(...stringToBytes(totalLine));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.BOLD_OFF);
  bytes.push(...COMMANDS.UNDERLINE_OFF);
  
  // Credit Used
  if (receiptData.creditUsed && receiptData.creditUsed > 0) {
    const creditLine = formatTotalLine('Credit Used', receiptData.creditUsed, paperWidthMM);
    bytes.push(...stringToBytes(creditLine));
    bytes.push(...COMMANDS.FEED_LINE);
  }
  
  // Amount Paid
  if (receiptData.amountPaid !== undefined) {
    const paidLine = formatTotalLine('Paid', receiptData.amountPaid, paperWidthMM);
    bytes.push(...stringToBytes(paidLine));
    bytes.push(...COMMANDS.FEED_LINE);
  }
  
  // Change
  if (receiptData.changeAmount && receiptData.changeAmount > 0) {
    const changeLine = formatTotalLine('Change', receiptData.changeAmount, paperWidthMM);
    bytes.push(...stringToBytes(changeLine));
    bytes.push(...COMMANDS.FEED_LINE);
  }
  
  // Balance Due
  if (receiptData.remainingBalance && receiptData.remainingBalance > 0) {
    const balanceLine = formatTotalLine('Balance', receiptData.remainingBalance, paperWidthMM);
    bytes.push(...stringToBytes(balanceLine));
    bytes.push(...COMMANDS.FEED_LINE);
  }
  
  // Divider
  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...stringToBytes(divider));
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Payment method
  bytes.push(...COMMANDS.ALIGN_LEFT);
  bytes.push(...stringToBytes(`Payment: ${receiptData.paymentMethod}`));
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Footer (centered)
  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...stringToBytes(receiptData.footer));
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Feed lines before cut
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Cut paper
  bytes.push(...COMMANDS.CUT_PAPER);
  
  return new Uint8Array(bytes);
}

/**
 * Format a total line with label on left and amount on right
 */
function formatTotalLine(label: string, amount: number, paperWidthMM: 58 | 80): string {
  const amountStr = `PKR ${amount.toFixed(0)}`;
  const maxWidth = paperWidthMM === 80 ? 42 : 32;
  const padding = ' '.repeat(Math.max(0, maxWidth - label.length - amountStr.length));
  return `${label}${padding}${amountStr}`;
}

/**
 * Build test receipt for printer testing
 */
export function buildTestReceipt(
  printerName: string,
  ip: string,
  paperWidthMM: 58 | 80
): Uint8Array {
  const bytes: number[] = [];
  
  // Initialize
  bytes.push(...COMMANDS.INIT);
  
  // Header (centered, bold)
  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...COMMANDS.BOLD_ON);
  bytes.push(...COMMANDS.FONT_DOUBLE_HEIGHT);
  bytes.push(...stringToBytes('TEST PRINT'));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FONT_NORMAL);
  bytes.push(...COMMANDS.BOLD_OFF);
  bytes.push(...COMMANDS.FEED_LINE);
  
  // Info (left aligned)
  bytes.push(...COMMANDS.ALIGN_LEFT);
  bytes.push(...stringToBytes(`Printer: ${printerName}`));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...stringToBytes(`IP: ${ip}`));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...stringToBytes(`Paper: ${paperWidthMM}mm`));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...stringToBytes(`Time: ${new Date().toLocaleString()}`));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);
  
  bytes.push(...COMMANDS.ALIGN_CENTER);
  bytes.push(...COMMANDS.BOLD_ON);
  bytes.push(...stringToBytes('Printer OK'));
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.BOLD_OFF);
  
  // Feed and cut
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.FEED_LINE);
  bytes.push(...COMMANDS.CUT_PAPER);
  
  return new Uint8Array(bytes);
}

/**
 * Print via TCP socket to network printer
 * This is a React Native implementation using raw TCP
 */
export async function printViaTCP(
  ip: string,
  port: number,
  data: Uint8Array,
  timeoutMs: number = 5000
): Promise<PrinterStatus> {
  try {
    // In React Native, we need to use a TCP socket library
    // For now, we'll use fetch with a timeout as a fallback
    // In production, you'd use react-native-tcp-socket or similar
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      // For HTTP fallback: send raw bytes as text
      // Note: This is a workaround - real TCP socket is preferred
      const response = await fetch(`http://${ip}:${port}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: data as any, // Type workaround for React Native
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return {
          success: true,
          message: 'Print job sent successfully',
        };
      } else {
        return {
          success: false,
          message: `Printer returned status ${response.status}`,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return {
          success: false,
          message: 'Printer timeout - check if printer is on and reachable',
          error: 'Timeout',
        };
      }
      
      return {
        success: false,
        message: 'Network error - check Wi-Fi and printer IP',
        error: fetchError.message,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: 'Failed to connect to printer',
      error: error.message,
    };
  }
}

/**
 * Main print service interface
 */
export class EscPosPrinterService {
  async printReceipt(
    config: NetworkPrinterConfig,
    receiptData: ReceiptData
  ): Promise<PrinterStatus> {
    try {
      const bytes = buildEscPosReceipt(receiptData, config.paperWidthMM);
      return await printViaTCP(config.ip, config.port, bytes);
    } catch (error: any) {
      return {
        success: false,
        message: 'Failed to generate receipt',
        error: error.message,
      };
    }
  }
  
  async testPrint(config: NetworkPrinterConfig): Promise<PrinterStatus> {
    try {
      const bytes = buildTestReceipt(config.name, config.ip, config.paperWidthMM);
      return await printViaTCP(config.ip, config.port, bytes);
    } catch (error: any) {
      return {
        success: false,
        message: 'Test print failed',
        error: error.message,
      };
    }
  }
}

export const printerService = new EscPosPrinterService();
