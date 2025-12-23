import { Buffer } from 'buffer';
import type { NetworkPrinterConfig, ReceiptData, PrinterStatus } from '../types/printer';
import { buildEscPosBitmapReceipt, buildEscPosReceipt } from './escPosFormatter';
import { renderReceiptToBitmap } from './printRenderService';
import { receiptNeedsBitmapFallback } from './receiptTextUtils';

const DEFAULT_TIMEOUT_MS = 5000;

function loadTcpSocket(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-tcp-socket');
  } catch (error) {
    return null;
  }
}

async function writeToSocket(socket: any, data: Uint8Array) {
  const buffer = Buffer.from(data);
  return new Promise<void>((resolve, reject) => {
    socket.write(buffer, (error: any) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function sendRawOverTcp(
  ip: string,
  port: number,
  data: Uint8Array,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<PrinterStatus> {
  const TcpSocket = loadTcpSocket();
  if (!TcpSocket?.createConnection) {
    return {
      success: false,
      message: 'TCP socket library is not available. Use a development build.',
      error: 'TCP_SOCKET_UNAVAILABLE',
    };
  }

  return new Promise<PrinterStatus>((resolve) => {
    let finished = false;

    const finish = (status: PrinterStatus) => {
      if (finished) return;
      finished = true;
      resolve(status);
    };

    const socket = TcpSocket.createConnection(
      {
        host: ip,
        port,
        timeout: timeoutMs,
      },
      async () => {
        try {
          await writeToSocket(socket, data);
          socket.end();
        } catch (error: any) {
          socket.destroy();
          finish({
            success: false,
            message: 'Failed to send print data',
            error: error?.message || 'SOCKET_WRITE_FAILED',
          });
        }
      }
    );

    socket.on('timeout', () => {
      socket.destroy();
      finish({
        success: false,
        message: 'Printer timeout - check if printer is on and reachable',
        error: 'TIMEOUT',
      });
    });

    socket.on('error', (error: any) => {
      finish({
        success: false,
        message: 'Network error - check Wi-Fi and printer IP',
        error: error?.message || 'SOCKET_ERROR',
      });
    });

    socket.on('close', (hadError: boolean) => {
      if (finished) return;
      finish({
        success: !hadError,
        message: hadError ? 'Connection closed with errors' : 'Print job sent successfully',
        error: hadError ? 'SOCKET_CLOSED' : undefined,
      });
    });
  });
}

async function buildReceiptPayload(
  receiptData: ReceiptData,
  config: NetworkPrinterConfig
): Promise<Uint8Array> {
  if (config.bitmapFallback && receiptNeedsBitmapFallback(receiptData)) {
    const bitmap = await renderReceiptToBitmap(receiptData, config);
    return buildEscPosBitmapReceipt(bitmap, config);
  }
  return buildEscPosReceipt(receiptData, config);
}

export async function printReceipt(
  config: NetworkPrinterConfig,
  receiptData: ReceiptData
): Promise<PrinterStatus> {
  try {
    const bytes = await buildReceiptPayload(receiptData, config);
    return await sendRawOverTcp(config.ip, config.port, bytes);
  } catch (error: any) {
    return {
      success: false,
      message: 'Failed to generate receipt',
      error: error?.message || 'RECEIPT_BUILD_FAILED',
    };
  }
}

export function buildTestReceiptData(
  config: NetworkPrinterConfig,
  overrides?: Partial<ReceiptData>
): ReceiptData {
  const now = new Date();
  return {
    storeName: overrides?.storeName || 'Test Store',
    address: overrides?.address || '123 Main Street',
    phone: overrides?.phone || '0300-0000000',
    dateTime: overrides?.dateTime || now.toLocaleString(),
    receiptNo: overrides?.receiptNo || `TEST-${now.getTime()}`,
    customerName: overrides?.customerName || 'Test Customer',
    items: overrides?.items || [
      { name: 'Test Item 1', qty: 2, unitPrice: 50 },
      { name: 'Test Item 2', qty: 1, unitPrice: 100 },
    ],
    subtotal: overrides?.subtotal ?? 200,
    tax: overrides?.tax ?? 0,
    total: overrides?.total ?? 200,
    amountPaid: overrides?.amountPaid ?? 200,
    changeAmount: overrides?.changeAmount ?? 0,
    remainingBalance: overrides?.remainingBalance ?? 0,
    creditUsed: overrides?.creditUsed ?? 0,
    paymentMethod: overrides?.paymentMethod || 'Cash',
    footer: overrides?.footer || 'Thank you for your business!',
  };
}

export async function testPrint(config: NetworkPrinterConfig): Promise<PrinterStatus> {
  try {
    const payload = buildTestReceiptData(config, {
      storeName: config.name,
    });
    return await printReceipt(config, payload);
  } catch (error: any) {
    return {
      success: false,
      message: 'Test print failed',
      error: error?.message || 'TEST_PRINT_FAILED',
    };
  }
}

export const printerService = {
  printReceipt,
  testPrint,
};
