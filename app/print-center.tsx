import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { db } from '../lib/database';
import {
  cancelPrintJob,
  clearSuccessfulJobs,
  enqueueTestPrint,
  listPrintJobs,
  processPrintQueue,
  retryPrintJob,
} from '../services/printQueueService';
import { getNetworkDiagnostics, scanJetDirectPrinters } from '../services/networkDiscovery';
import type { NetworkDiagnostics, DiscoveryResult } from '../services/networkDiscovery';
import type { NetworkPrinterConfig, PrintJob } from '../types/printer';

export default function PrintCenterScreen() {
  const router = useRouter();
  const [diagnostics, setDiagnostics] = useState<NetworkDiagnostics | null>(null);
  const [printers, setPrinters] = useState<NetworkPrinterConfig[]>([]);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0, found: 0 });
  const [discoveries, setDiscoveries] = useState<DiscoveryResult[]>([]);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const [diag, profiles, printJobs] = await Promise.all([
        getNetworkDiagnostics(),
        db.listPrinterProfiles(),
        listPrintJobs(120),
      ]);
      setDiagnostics(diag);
      setPrinters(profiles);
      setJobs(printJobs as PrintJob[]);
    } catch (error) {
      console.error('Print center refresh failed', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      listPrintJobs(120).then((printJobs) => setJobs(printJobs as PrintJob[]));
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const runScan = async () => {
    setIsScanning(true);
    setDiscoveries([]);
    setScanProgress({ scanned: 0, total: 0, found: 0 });
    try {
      const results = await scanJetDirectPrinters({
        onProgress: (progress) => setScanProgress(progress),
      });
      setDiscoveries(results);
      if (!results.length) {
        Toast.show({ type: 'info', text1: 'No printers found on this subnet' });
      }
    } catch (error) {
      console.error('Printer scan failed', error);
      Toast.show({ type: 'error', text1: 'Network scan failed' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleSaveDiscovery = async (result: DiscoveryResult) => {
    const newProfile: NetworkPrinterConfig = {
      id: `${result.ip}-${result.port}`,
      name: `Printer ${result.ip}`,
      type: 'ESC_POS',
      ip: result.ip,
      port: result.port,
      paperWidthMM: 80,
      encoding: 'cp437',
      codePage: 0,
      cutMode: 'partial',
      drawerKick: false,
      bitmapFallback: false,
      isDefault: printers.length === 0,
    };
    await db.upsertPrinterProfile(newProfile);
    await refresh();
    Toast.show({ type: 'success', text1: 'Printer profile saved' });
  };

  const renderDiagnostics = () => {
    if (!diagnostics) {
      return <Text style={styles.mutedText}>Diagnostics unavailable.</Text>;
    }

    return (
      <View style={styles.diagnosticBlock}>
        <Text style={styles.diagnosticLine}>
          Network: {diagnostics.networkType || 'Unknown'}
        </Text>
        <Text style={styles.diagnosticLine}>
          IP Address: {diagnostics.ipAddress || 'Unknown'}
        </Text>
        {diagnostics.warnings.length > 0 && (
          <View style={styles.warningBox}>
            {diagnostics.warnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                {warning}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Print Center</Text>
        <TouchableOpacity
          onPress={refresh}
          style={styles.headerButton}
          hitSlop={8}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            <Ionicons name="refresh" size={20} color="#2563eb" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Connectivity</Text>
          {renderDiagnostics()}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionButton} onPress={() => processPrintQueue({ force: true })}>
              <Ionicons name="play-circle-outline" size={18} color="#2563eb" />
              <Text style={styles.actionText}>Process Queue</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                jobs
                  .filter((job) => job.status === 'failed')
                  .forEach((job) => retryPrintJob(job.id));
                Toast.show({ type: 'success', text1: 'Retry requested' });
              }}
            >
              <Ionicons name="refresh-outline" size={18} color="#2563eb" />
              <Text style={styles.actionText}>Retry Failed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={async () => {
                await clearSuccessfulJobs();
                await refresh();
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#2563eb" />
              <Text style={styles.actionText}>Clear Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Printer Profiles</Text>
          {printers.length === 0 && (
            <Text style={styles.mutedText}>No printers saved yet.</Text>
          )}
          {printers.map((printer) => (
            <View key={printer.id} style={styles.listRow}>
              <View style={styles.listInfo}>
                <Text style={styles.listTitle}>{printer.name}</Text>
                <Text style={styles.listSubtitle}>
                  {printer.ip}:{printer.port} - {printer.paperWidthMM}mm {printer.isDefault ? '(Default)' : ''}
                </Text>
              </View>
              <View style={styles.listActions}>
                <TouchableOpacity
                  onPress={async () => {
                    await enqueueTestPrint(printer);
                    Toast.show({ type: 'success', text1: 'Test print queued' });
                  }}
                >
                  <Ionicons name="print-outline" size={18} color="#2563eb" />
                </TouchableOpacity>
                {!printer.isDefault && (
                  <TouchableOpacity
                    onPress={async () => {
                      await db.setDefaultPrinterProfile(printer.id);
                      await refresh();
                    }}
                  >
                    <Ionicons name="star-outline" size={18} color="#f59e0b" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Network Discovery</Text>
            <TouchableOpacity style={styles.scanButton} onPress={runScan} disabled={isScanning}>
              {isScanning ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Ionicons name="search-outline" size={18} color="#2563eb" />
              )}
              <Text style={styles.scanButtonText}>Scan</Text>
            </TouchableOpacity>
          </View>
          {isScanning && (
            <Text style={styles.mutedText}>
              Scanning {scanProgress.scanned}/{scanProgress.total} (Found {scanProgress.found})
            </Text>
          )}
          {discoveries.length > 0 && (
            <View style={styles.discoveryList}>
              {discoveries.map((result) => (
                <View key={result.ip} style={styles.listRow}>
                  <View style={styles.listInfo}>
                    <Text style={styles.listTitle}>{result.ip}</Text>
                    <Text style={styles.listSubtitle}>
                      Port {result.port} - {result.responseTimeMs} ms
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={() => handleSaveDiscovery(result)}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Print Queue</Text>
          {jobs.length === 0 && <Text style={styles.mutedText}>Queue is empty.</Text>}
          {jobs.map((job) => (
            <View key={job.id} style={styles.queueRow}>
              <View style={styles.listInfo}>
                <Text style={styles.listTitle}>
                  #{job.id} {job.type === 'test' ? '(Test)' : ''}
                </Text>
                <Text style={styles.listSubtitle}>
                  {job.status} - Attempts {job.attempts}/{job.maxAttempts}
                </Text>
                {job.lastError ? (
                  <Text style={styles.errorText}>{job.lastError}</Text>
                ) : null}
              </View>
              <View style={styles.listActions}>
                {job.status === 'failed' && (
                  <TouchableOpacity onPress={() => retryPrintJob(job.id)}>
                    <Ionicons name="refresh-outline" size={18} color="#2563eb" />
                  </TouchableOpacity>
                )}
                {job.status !== 'success' && job.status !== 'cancelled' && (
                  <TouchableOpacity
                    onPress={() => cancelPrintJob(job.id)}
                    style={{ marginLeft: 12 }}
                  >
                    <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  diagnosticBlock: {
    gap: 6,
  },
  diagnosticLine: {
    fontSize: 13,
    color: '#1f2937',
  },
  warningBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#b91c1c',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  listInfo: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  listSubtitle: {
    fontSize: 12,
    color: '#64748b',
  },
  listActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  errorText: {
    fontSize: 11,
    color: '#b91c1c',
  },
  mutedText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
  },
  scanButtonText: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
  },
  discoveryList: {
    gap: 8,
  },
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
