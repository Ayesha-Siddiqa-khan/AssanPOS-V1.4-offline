import { NetworkPrinterConfig, ReceiptData, PrinterStatus } from '../types/printer';
import { Buffer } from 'buffer';

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
/**
 * Send ESC/POS data to printer via TCP/IP
 * Uses direct TCP socket connection for proper ESC/POS communication
 */
export async function printViaTCP(
  ip: string,
  port: number,
  data: Uint8Array,
  timeoutMs: number = 5000
): Promise<PrinterStatus> {
  return new Promise((resolve) => {
    try {
      // Try to use react-native-tcp-socket if available
      // This requires: npm install react-native-tcp-socket
      let TcpSocket: any;
      
      try {
        TcpSocket = require('react-native-tcp-socket');
      } catch (e) {
        // Fallback: Library not installed
        console.warn('react-native-tcp-socket not installed. Install it for proper ESC/POS printing.');
        
        // Try HTTP POST as last resort (may not work with all printers)
        fallbackHttpPrint(ip, port, data, timeoutMs).then(resolve).catch(() => {
          resolve({
            success: false,
            message: 'Install react-native-tcp-socket for proper ESC/POS printing',
            error: 'TCP library missing',
          });
        });
        return;
      }
      
      // Create TCP socket connection
      const client = TcpSocket.default.createConnection(
        { host: ip, port: port, timeout: timeoutMs },
        () => {
          // Connected - send data
          console.log('Connected to printer:', ip, port);
          
          // Convert Uint8Array to Buffer
          const buffer = Buffer.from(data);
          client.write(buffer);
          
          // Give printer time to receive data, then close
          setTimeout(() => {
            client.destroy();
            resolve({
              success: true,
              message: 'Print job sent to printer',
            });
          }, 500);
        }
      );
      
      // Connection timeout
      const timeoutId = setTimeout(() => {
        client.destroy();
        resolve({
          success: false,
          message: 'Connection timeout - check printer IP and ensure it is powered on',
          error: 'Timeout',
        });
      }, timeoutMs);
      
      // Handle errors
      client.on('error', (error: any) => {
        clearTimeout(timeoutId);
        client.destroy();
        
        let message = 'Printer connection failed';
        if (error.message?.includes('ECONNREFUSED')) {
          message = 'Connection refused - check printer IP and port';
        } else if (error.message?.includes('ENETUNREACH')) {
          message = 'Network unreachable - ensure phone and printer are on same Wi-Fi';
        } else if (error.message?.includes('ETIMEDOUT')) {
          message = 'Connection timeout - printer not responding';
        }
        
        resolve({
          success: false,
          message: message,
          error: error.message,
        });
      });
      
      // Handle connection close
      client.on('close', () => {
        clearTimeout(timeoutId);
      });
      
    } catch (error: any) {
      resolve({
        success: false,
        message: 'Failed to connect to printer',
        error: error.message,
      });
    }
  });
}

/**
 * Fallback HTTP method (may not work with all printers)
 */
async function fallbackHttpPrint(
  ip: string,
  port: number,
  data: Uint8Array,
  timeoutMs: number
): Promise<PrinterStatus> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`http://${ip}:${port}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: data as any,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return {
        success: true,
        message: 'Print job sent (HTTP fallback)',
      };
    } else {
      return {
        success: false,
        message: `Printer returned HTTP ${response.status}`,
        error: `HTTP ${response.status}`,
      };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      return {
        success: false,
        message: 'Connection timeout',
        error: 'Timeout',
      };
    }
    
    return {
      success: false,
      message: 'HTTP connection failed',
      error: error.message,
    };
  }
}

/**
 * Main print service interface
 */
export class EscPosPrinterService {
  private normalizeReceipt(data: ReceiptData, config?: NetworkPrinterConfig): ReceiptData {
    const toNum = (value: any) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    const items = Array.isArray(data.items) ? data.items : [];
    const normalizedItems = items.map((item) => ({
      name: `${item?.name ?? ''}`,
      qty: toNum(item?.qty ?? item?.quantity ?? 0),
      unitPrice: toNum(item?.unitPrice ?? item?.price ?? 0),
    }));

    return {
      storeName: `${data.storeName ?? ''}`,
      address: data.address ?? '',
      phone: data.phone ?? '',
      dateTime: `${data.dateTime ?? ''}`,
      receiptNo: `${data.receiptNo ?? ''}`,
      customerName: data.customerName ?? '',
      items: normalizedItems,
      subtotal: toNum(data.subtotal),
      tax: toNum(data.tax),
      total: toNum(data.total),
      amountPaid: data.amountPaid !== undefined ? toNum(data.amountPaid) : undefined,
      changeAmount: data.changeAmount !== undefined ? toNum(data.changeAmount) : undefined,
      remainingBalance:
        data.remainingBalance !== undefined ? toNum(data.remainingBalance) : undefined,
      creditUsed: data.creditUsed !== undefined ? toNum(data.creditUsed) : undefined,
      paymentMethod: `${data.paymentMethod ?? ''}`,
      footer: `${data.footer ?? ''}`,
    };
  }

  private normalizeConfig(config: NetworkPrinterConfig): NetworkPrinterConfig {
    const paperWidthMM: 58 | 80 = config?.paperWidthMM === 58 ? 58 : 80;
    const port = Number.isFinite(config?.port) ? config.port : 9100;
    return { ...config, paperWidthMM, port } as NetworkPrinterConfig;
  }

  async printReceipt(
    config: NetworkPrinterConfig,
    receiptData: ReceiptData
  ): Promise<PrinterStatus> {
    try {
      const normalizedConfig = this.normalizeConfig(config);
      const safeReceipt = this.normalizeReceipt(receiptData, normalizedConfig);
      const bytes = buildEscPosReceipt(safeReceipt, normalizedConfig.paperWidthMM);
      return await printViaTCP(normalizedConfig.ip, normalizedConfig.port, bytes);
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
