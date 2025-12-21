import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { NetworkPrinterConfig, ReceiptData } from '../../types/printer';
import { registerReceiptRenderer } from '../../services/printRenderService';

type RenderRequest = {
  receipt: ReceiptData;
  profile: NetworkPrinterConfig;
  resolve: (base64: string) => void;
  reject: (error: Error) => void;
};

const widthForPaper = (paperWidthMM: 58 | 80) => (paperWidthMM === 80 ? 576 : 384);

export function ReceiptBitmapRenderer() {
  const viewShotRef = useRef<ViewShot | null>(null);
  const queueRef = useRef<RenderRequest[]>([]);
  const activeRef = useRef<RenderRequest | null>(null);
  const [activeRequest, setActiveRequest] = useState<RenderRequest | null>(null);

  const processNext = useCallback(() => {
    if (activeRef.current || queueRef.current.length === 0) {
      return;
    }
    const next = queueRef.current.shift() || null;
    activeRef.current = next;
    setActiveRequest(next);
  }, []);

  useEffect(() => {
    registerReceiptRenderer((receipt, profile) => {
      return new Promise((resolve, reject) => {
        queueRef.current.push({ receipt, profile, resolve, reject });
        processNext();
      });
    });
    return () => registerReceiptRenderer(null);
  }, [processNext]);

  useEffect(() => {
    let cancelled = false;
    const capture = async () => {
      if (!activeRequest) {
        return;
      }
      try {
        await new Promise((resolve) => setTimeout(resolve, 60));
        const result = await viewShotRef.current?.capture?.();
        if (cancelled) {
          return;
        }
        if (!result) {
          throw new Error('Bitmap capture failed.');
        }
        activeRequest.resolve(result);
      } catch (error: any) {
        if (!cancelled) {
          activeRequest.reject(error instanceof Error ? error : new Error('Bitmap capture failed.'));
        }
      } finally {
        if (!cancelled) {
          activeRef.current = null;
          setActiveRequest(null);
          processNext();
        }
      }
    };
    capture();
    return () => {
      cancelled = true;
    };
  }, [activeRequest, processNext]);

  const activeWidth = activeRequest
    ? widthForPaper(activeRequest.profile.paperWidthMM)
    : 384;

  return (
    <View style={styles.hiddenWrap} pointerEvents="none">
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'base64', width: activeWidth }}
        style={[styles.receiptWrap, { width: activeWidth }]}
      >
        {activeRequest && (
          <ReceiptBitmapLayout receipt={activeRequest.receipt} profile={activeRequest.profile} />
        )}
      </ViewShot>
    </View>
  );
}

function ReceiptBitmapLayout({
  receipt,
  profile,
}: {
  receipt: ReceiptData;
  profile: NetworkPrinterConfig;
}) {
  const divider = '-'.repeat(profile.paperWidthMM === 80 ? 42 : 32);

  return (
    <View style={styles.receiptInner}>
      <Text style={styles.headerText}>{receipt.storeName}</Text>
      {receipt.address ? <Text style={styles.centerText}>{receipt.address}</Text> : null}
      {receipt.phone ? <Text style={styles.centerText}>{receipt.phone}</Text> : null}
      <Text style={styles.centerText}>{divider}</Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Receipt #:</Text>
        <Text style={styles.infoValue}>{receipt.receiptNo}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Date:</Text>
        <Text style={styles.infoValue}>{receipt.dateTime}</Text>
      </View>
      {receipt.customerName ? (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Customer:</Text>
          <Text style={styles.infoValue}>{receipt.customerName}</Text>
        </View>
      ) : null}

      <Text style={styles.centerText}>{divider}</Text>

      {receipt.items.map((item, index) => (
        <View key={`${item.name}-${index}`} style={styles.itemBlock}>
          <Text style={styles.itemName}>{item.name}</Text>
          <View style={styles.itemLine}>
            <Text style={styles.itemMeta}>{`${item.qty} x PKR ${item.unitPrice.toFixed(0)}`}</Text>
            <Text style={styles.itemMeta}>{`PKR ${(item.qty * item.unitPrice).toFixed(0)}`}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.centerText}>{divider}</Text>

      <View style={styles.totalRow}>
        <Text>Subtotal</Text>
        <Text>{`PKR ${receipt.subtotal.toFixed(0)}`}</Text>
      </View>
      <View style={styles.totalRow}>
        <Text>Tax</Text>
        <Text>{`PKR ${receipt.tax.toFixed(0)}`}</Text>
      </View>
      <View style={styles.totalRowMain}>
        <Text style={styles.totalStrong}>Total</Text>
        <Text style={styles.totalStrong}>{`PKR ${receipt.total.toFixed(0)}`}</Text>
      </View>
      {(receipt.creditUsed ?? 0) > 0 ? (
        <View style={styles.totalRow}>
          <Text>Credit Used</Text>
          <Text>{`PKR ${receipt.creditUsed?.toFixed(0)}`}</Text>
        </View>
      ) : null}
      {receipt.amountPaid !== undefined ? (
        <View style={styles.totalRow}>
          <Text>Paid</Text>
          <Text>{`PKR ${receipt.amountPaid?.toFixed(0)}`}</Text>
        </View>
      ) : null}
      {(receipt.changeAmount ?? 0) > 0 ? (
        <View style={styles.totalRow}>
          <Text>Change</Text>
          <Text>{`PKR ${receipt.changeAmount?.toFixed(0)}`}</Text>
        </View>
      ) : null}
      {(receipt.remainingBalance ?? 0) > 0 ? (
        <View style={styles.totalRow}>
          <Text>Balance</Text>
          <Text>{`PKR ${receipt.remainingBalance?.toFixed(0)}`}</Text>
        </View>
      ) : null}

      <Text style={styles.centerText}>{divider}</Text>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Payment:</Text>
        <Text style={styles.infoValue}>{receipt.paymentMethod}</Text>
      </View>

      <Text style={styles.footerText}>{receipt.footer}</Text>
      {receipt.developerFooterLines?.map((line, index) => (
        <Text key={`dev-footer-${index}`} style={styles.footerText}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hiddenWrap: {
    position: 'absolute',
    left: -2000,
    top: -2000,
  },
  receiptWrap: {
    backgroundColor: '#ffffff',
  },
  receiptInner: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },
  headerText: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  centerText: {
    fontSize: 12,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12,
  },
  itemBlock: {
    gap: 2,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemMeta: {
    fontSize: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalRowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#111827',
    paddingVertical: 4,
  },
  totalStrong: {
    fontSize: 14,
    fontWeight: '700',
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
  },
});
