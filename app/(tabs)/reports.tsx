import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card } from '../../components/ui/Card';
import { shareTextViaWhatsApp } from '../../lib/share';

type Timeframe = 'daily' | 'weekly' | 'monthly';

export default function ReportsScreen() {
  const { sales, expenditures } = useData();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<Timeframe>('daily');

  const {
    filteredSales,
    filteredExpenditures,
    revenue,
    expenses,
    cogs,
    netProfit,
    paymentBreakdown,
    creditIssued,
    creditRecovered,
    topProducts,
    cashCollected,
    numberOfSales,
    averageTicket,
  } = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    if (activeTab === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (activeTab === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 6);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const startStr = startDate.toISOString().split('T')[0];

    const filteredSales = sales.filter((sale) => sale.date >= startStr);
    const filteredExpenditures = expenditures.filter((exp) => exp.date >= startStr);

    const revenue = filteredSales.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const expenses = filteredExpenditures.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const cogs = filteredSales.reduce((sum, sale) => {
      const cartCOGS = sale.cart.reduce((cartSum: number, item: any) => {
        const costPrice = item.costPrice || 0;
        return cartSum + costPrice * item.quantity;
      }, 0);
      return sum + cartCOGS;
    }, 0);
    const netProfit = revenue - cogs - expenses;

    const paymentBreakdown = filteredSales.reduce(
      (acc: Record<string, number>, sale) => {
        acc[sale.paymentMethod] = (acc[sale.paymentMethod] || 0) + (sale.total || 0);
        return acc;
      },
      {}
    );

    const creditIssued = filteredSales.reduce(
      (sum, sale) => sum + (sale.remainingBalance ?? 0),
      0
    );
    const creditRecovered = filteredSales.reduce(
      (sum, sale) => sum + (sale.creditUsed ?? 0),
      0
    );

    const productTotals = filteredSales.reduce((acc: Record<string, any>, sale) => {
      sale.cart.forEach((item: any) => {
        const key = `${item.productId}-${item.variantId ?? 'base'}`;
        if (!acc[key]) {
          acc[key] = {
            productId: item.productId,
            variantId: item.variantId ?? null,
            name: item.name,
            variantName: item.variantName,
            units: 0,
            revenue: 0,
          };
        }
        acc[key].units += item.quantity;
        acc[key].revenue += (item.price || 0) * item.quantity;
      });
      return acc;
    }, {});

    const topProducts = Object.values(productTotals)
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);

    const cashCollected = paymentBreakdown['Cash'] ?? 0;
    const numberOfSales = filteredSales.length;
    const averageTicket = numberOfSales > 0 ? revenue / numberOfSales : 0;

    return {
      filteredSales,
      filteredExpenditures,
      revenue,
      expenses,
      cogs,
      netProfit,
      paymentBreakdown,
      creditIssued,
      creditRecovered,
      topProducts,
      cashCollected,
      numberOfSales,
      averageTicket,
    };
  }, [activeTab, sales, expenditures]);

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString()}`;

  const timeframeLabel: Record<Timeframe, string> = {
    daily: t('Daily'),
    weekly: t('Weekly'),
    monthly: t('Monthly'),
  };

  const buildCsvReport = () => {
    const lines: string[] = [];
    lines.push(`"${t('Report Type')}","${timeframeLabel[activeTab]}"`);
    lines.push(`"${t('Generated at')}","${new Date().toLocaleString()}"`);
    lines.push('');
    lines.push(`"${t('Metric')}","${t('Value')}"`);
    lines.push(`"${t('Net Profit')}","${netProfit}"`);
    lines.push(`"${t('Revenue')}","${revenue}"`);
    lines.push(`"${t('COGS')}","${cogs}"`);
    lines.push(`"${t('Expenses')}","${expenses}"`);
    lines.push(`"${t('Cash Collected')}","${cashCollected}"`);
    lines.push(`"${t('Credit issued')}","${creditIssued}"`);
    lines.push(`"${t('Credit recovered')}","${creditRecovered}"`);
    lines.push(`"${t('Number of Sales')}","${numberOfSales}"`);
    lines.push(`"${t('Avg. Ticket Size')}","${averageTicket.toFixed(2)}"`);
    lines.push(`"${t('Daily Expenses')}","${expenses}"`);
    lines.push('');
    lines.push(`"${t('Top 5 Products')}","${t('Units')}","${t('Revenue')}"`);
    topProducts.forEach((item) => {
      const variantLabel = item.variantName ? ` - ${item.variantName}` : '';
      lines.push(`"${item.name}${variantLabel}","${item.units}","${item.revenue}"`);
    });
    lines.push('');
    lines.push(`"${t('Payment Methods')}","${t('Value')}"`);
    Object.entries(paymentBreakdown).forEach(([method, amount]) => {
      lines.push(`"${method}","${amount}"`);
    });
    return lines.join('\n');
  };

  const buildPdfHtml = () => {
    const productsHtml =
      topProducts.length === 0
        ? `<tr><td colspan="4">${t('No products found')}</td></tr>`
        : topProducts
            .map(
              (item, index) => `
        <tr>
          <td>#${index + 1}</td>
          <td>${item.name}${item.variantName ? ` - ${item.variantName}` : ''}</td>
          <td>${item.units}</td>
          <td>${formatCurrency(item.revenue)}</td>
        </tr>`
            )
            .join('');

    const paymentsHtml =
      Object.entries(paymentBreakdown).length === 0
        ? `<tr><td colspan="2">${t('No data yet')}</td></tr>`
        : Object.entries(paymentBreakdown)
            .map(
              ([method, amount]) => `
        <tr>
          <td>${method}</td>
          <td>${formatCurrency(amount)}</td>
        </tr>`
            )
            .join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { font-size: 22px; margin-bottom: 8px; }
            h2 { font-size: 18px; margin-top: 24px; margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
            th { background-color: #f3f4f6; }
            .metrics { margin-top: 12px; }
            .metrics p { margin: 4px 0; font-size: 13px; }
          </style>
        </head>
        <body>
          <h1>${t('Reports')} - ${timeframeLabel[activeTab]}</h1>
          <p>${t('Generated at')}: ${new Date().toLocaleString()}</p>
          <div class="metrics">
            <p><strong>${t('Net Profit')}:</strong> ${formatCurrency(netProfit)}</p>
            <p><strong>${t('Revenue')}:</strong> ${formatCurrency(revenue)}</p>
            <p><strong>${t('COGS')}:</strong> ${formatCurrency(cogs)}</p>
            <p><strong>${t('Expenses')}:</strong> ${formatCurrency(expenses)}</p>
            <p><strong>${t('Cash Collected')}:</strong> ${formatCurrency(cashCollected)}</p>
            <p><strong>${t('Credit issued')}:</strong> ${formatCurrency(creditIssued)}</p>
            <p><strong>${t('Credit recovered')}:</strong> ${formatCurrency(creditRecovered)}</p>
            <p><strong>${t('Number of Sales')}:</strong> ${numberOfSales}</p>
            <p><strong>${t('Avg. Ticket Size')}:</strong> ${formatCurrency(averageTicket)}</p>
            <p><strong>${t('Daily Expenses')}:</strong> ${formatCurrency(expenses)}</p>
          </div>
          <h2>${t('Top 5 Products')}</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>${t('Product')}</th>
                <th>${t('Units')}</th>
                <th>${t('Revenue')}</th>
              </tr>
            </thead>
            <tbody>
              ${productsHtml}
            </tbody>
          </table>
          <h2>${t('Payment Methods')}</h2>
          <table>
            <thead>
              <tr>
                <th>${t('Method')}</th>
                <th>${t('Value')}</th>
              </tr>
            </thead>
            <tbody>
              ${paymentsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;
  };

  const buildWhatsAppMessage = () => {
    const lines: string[] = [];
    lines.push(`${t('Reports')} - ${timeframeLabel[activeTab]}`);
    lines.push(`${t('Generated at')}: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push(`${t('Net Profit')}: ${formatCurrency(netProfit)}`);
    lines.push(`${t('Revenue')}: ${formatCurrency(revenue)}`);
    lines.push(`${t('COGS')}: ${formatCurrency(cogs)}`);
    lines.push(`${t('Expenses')}: ${formatCurrency(expenses)}`);
    lines.push(`${t('Cash Collected')}: ${formatCurrency(cashCollected)}`);
    lines.push(`${t('Credit issued')}: ${formatCurrency(creditIssued)}`);
    lines.push(`${t('Credit recovered')}: ${formatCurrency(creditRecovered)}`);
    lines.push(`${t('Number of Sales')}: ${numberOfSales}`);
    lines.push(`${t('Avg. Ticket Size')}: ${formatCurrency(averageTicket)}`);
    lines.push(`${t('Daily Expenses')}: ${formatCurrency(expenses)}`);
    lines.push('');
    lines.push(`${t('Top 5 Products')}:`);
    if (topProducts.length === 0) {
      lines.push(`- ${t('No products found')}`);
    } else {
      topProducts.forEach((item, index) => {
        const variantLabel = item.variantName ? ` - ${item.variantName}` : '';
        lines.push(
          `${index + 1}. ${item.name}${variantLabel} (${item.units} ${t('items')})`
        );
      });
    }
    lines.push('');
    lines.push(`${t('Payment Methods')}:`);
    if (Object.entries(paymentBreakdown).length === 0) {
      lines.push(`- ${t('No data yet')}`);
    } else {
      Object.entries(paymentBreakdown).forEach(([method, amount]) => {
        lines.push(`${method}: ${formatCurrency(amount)}`);
      });
    }
    return lines.join('\n');
  };

  const handleShareWhatsApp = async () => {
    try {
      const shared = await shareTextViaWhatsApp(buildWhatsAppMessage());
      if (!shared) {
        Toast.show({ type: 'error', text1: t('WhatsApp not installed') });
      }
    } catch (error) {
      console.error('Failed to share via WhatsApp', error);
      Toast.show({ type: 'error', text1: t('WhatsApp share failed') });
    }
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      if (format === 'csv') {
        const content = buildCsvReport();
        const fileName = `report-${activeTab}-${Date.now()}.csv`;
        const file = new File(Paths.cache, fileName);
        await file.write(content);
        const fileUri = file.uri;
        const shared = await shareTextViaWhatsApp(
          `${buildWhatsAppMessage()}\n\n${t('Generated CSV')}: ${fileUri}`
        );
        if (!shared) {
          Toast.show({
            type: 'info',
            text1: t('Generated CSV'),
            text2: fileUri,
          });
        }
      } else {
        // PDF Export
        const html = buildPdfHtml();
        
        try {
          const { uri } = await Print.printToFileAsync({ html, base64: false });
          
          // Check if sharing is available
          const isSharingAvailable = await Sharing.isAvailableAsync();
          
          if (isSharingAvailable) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: t('Share Report PDF'),
              UTI: 'com.adobe.pdf',
            });
          } else {
            // Fallback: show the file location
            Toast.show({
              type: 'info',
              text1: t('PDF Generated'),
              text2: uri,
            });
          }
        } catch (error) {
          console.error('Failed to generate PDF', error);
          throw error; // Re-throw to be caught by outer catch
        }
      }
    } catch (error) {
      console.error('Failed to export report', error);
      Toast.show({
        type: 'error',
        text1: format === 'csv' ? t('CSV export failed') : t('PDF export failed'),
      });
    }
  };


  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.pageTitle}>{t('Reports')}</Text>

        <View style={styles.tabRow}>
          {(['daily', 'weekly', 'monthly'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && styles.tabButtonActive,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === tab && styles.tabButtonTextActive,
                ]}
              >
                {timeframeLabel[tab]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.banner}>
          <Ionicons name="warning-outline" size={16} color="#dc2626" />
          <Text style={styles.bannerText}>
            {t(
              'Backup all products, customers, sales, and credit data. Restore from backup if required. Use Reset if expenditures are missing.'
            )}
          </Text>
        </View>

        <View style={styles.exportRow}>
          <TouchableOpacity
            style={[styles.exportButton, styles.exportOutline]}
            onPress={() => handleExport('csv')}
          >
            <Ionicons name="download-outline" size={16} color="#2563eb" />
            <Text style={styles.exportText}>{t('Export CSV')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButton, styles.exportOutline]}
            onPress={() => handleExport('pdf')}
          >
            <Ionicons name="document-text-outline" size={16} color="#2563eb" />
            <Text style={styles.exportText}>{t('Export PDF')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsSection}>
          <Text style={styles.sectionTitle}>{t('Key Metrics')}</Text>
          <View style={styles.metricsGrid}>
            <Card style={[styles.metricCard, styles.metricProfit]}>
              <View style={[styles.metricIcon, styles.metricIconProfit]}>
                <Ionicons name="trending-up" size={22} color="#16a34a" />
              </View>
              <View style={styles.metricContent}>
                <Text style={styles.metricTitle}>{t('Net Profit')}</Text>
                <Text style={styles.metricValue}>
                  Rs. {netProfit.toLocaleString()}
                </Text>
                <Text style={styles.metricHint}>
                  {t('Revenue')}: Rs. {revenue.toLocaleString()} {'\u2022'} {t('COGS')}:
                  Rs. {cogs.toLocaleString()} {'\u2022'} {t('Expenses')}:
                  Rs. {expenses.toLocaleString()}
                </Text>
              </View>
            </Card>

            <Card style={[styles.metricCard, styles.metricBlue]}>
              <View style={[styles.metricIcon, styles.metricIconBlue]}>
                <Ionicons name="cash-outline" size={22} color="#1d4ed8" />
              </View>
              <View style={styles.metricContent}>
                <Text style={styles.metricTitle}>{t('Total Sales')}</Text>
                <Text style={styles.metricValue}>
                  Rs. {revenue.toLocaleString()}
                </Text>
              </View>
            </Card>

            <Card style={[styles.metricCard, styles.metricGreen]}>
              <View style={[styles.metricIcon, styles.metricIconGreen]}>
                <Ionicons name="wallet-outline" size={22} color="#0ea5e9" />
              </View>
              <View style={styles.metricContent}>
                <Text style={styles.metricTitle}>{t('Cash Collected')}</Text>
                <Text style={styles.metricValue}>
                  Rs. {cashCollected.toLocaleString()}
                </Text>
              </View>
            </Card>

            <Card style={[styles.metricCard, styles.metricOrange]}>
              <View style={[styles.metricIcon, styles.metricIconOrange]}>
                <Ionicons name="card-outline" size={22} color="#f97316" />
              </View>
              <View style={styles.metricContent}>
                <Text style={styles.metricTitle}>{t('Credit issued')}</Text>
                <Text style={styles.metricValue}>
                  Rs. {creditIssued.toLocaleString()}
                </Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t('Outstanding')}</Text>
                </View>
              </View>
            </Card>

            <Card style={[styles.metricCard, styles.metricPurple]}>
              <View style={[styles.metricIcon, styles.metricIconPurple]}>
                <Ionicons name="arrow-down-circle-outline" size={22} color="#8b5cf6" />
              </View>
              <View style={styles.metricContent}>
                <Text style={styles.metricTitle}>{t('Credit recovered')}</Text>
                <Text style={styles.metricValue}>
                  Rs. {creditRecovered.toLocaleString()}
                </Text>
              </View>
            </Card>

            <Card style={[styles.metricCard, styles.metricLight]}>
              <View style={[styles.metricIcon, styles.metricIconLight]}>
                <Ionicons name="people-outline" size={22} color="#0ea5e9" />
              </View>
              <View style={styles.metricContent}>
                <Text style={styles.metricTitle}>{t('Number of Sales')}</Text>
                <Text style={styles.metricValue}>{String(numberOfSales)}</Text>
              </View>
            </Card>

            <Card style={[styles.metricCard, styles.metricLight]}>
              <View style={[styles.metricIcon, styles.metricIconLight]}>
                <Ionicons name="stats-chart-outline" size={22} color="#22c55e" />
              </View>
              <View style={styles.metricContent}>
                <Text style={styles.metricTitle}>{t('Avg. Ticket Size')}</Text>
                <Text style={styles.metricValue}>
                  Rs. {averageTicket.toFixed(0)}
                </Text>
              </View>
            </Card>

            <Card style={[styles.metricCard, styles.metricOrangeLight]}>
              <View style={[styles.metricIcon, styles.metricIconOrange]}>
                <Ionicons name="receipt-outline" size={22} color="#f97316" />
              </View>
              <View style={styles.metricContent}>
                <Text style={styles.metricTitle}>{t('Daily Expenses')}</Text>
                <Text style={styles.metricValue}>
                  Rs. {expenses.toLocaleString()}
                </Text>
              </View>
            </Card>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Top 5 Products')}</Text>
          <Card style={styles.infoCard}>
            {topProducts.length === 0 ? (
              <Text style={styles.emptyText}>{t('No products found')}</Text>
            ) : (
              topProducts.map((item, index) => (
                <View
                  key={`${item.productId}-${item.variantId ?? 'base'}`}
                  style={styles.productRow}
                >
                  <View style={styles.productRank}>
                    <Text style={styles.productRankText}>#{String(index + 1)}</Text>
                  </View>
                  <View style={styles.productDetails}>
                    <Text style={styles.productName}>
                      {item.name}
                      {item.variantName ? ` ${'\u2022'} ${item.variantName}` : ''}
                    </Text>
                    <Text style={styles.productMeta}>
                      {String(item.units)} {t('items')} {'\u2022'} Rs. {item.revenue.toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Payment Methods')}</Text>
          <Card style={styles.infoCard}>
            {Object.entries(paymentBreakdown).length === 0 ? (
              <Text style={styles.emptyText}>{t('No data yet')}</Text>
            ) : (
              Object.entries(paymentBreakdown).map(([method, amount]) => (
                <View key={method} style={styles.paymentRow}>
                  <View style={styles.legendDot} />
                  <Text style={styles.paymentLabel}>{method}</Text>
                  <Text style={styles.paymentValue}>Rs. {amount.toLocaleString()}</Text>
                </View>
              ))
            )}
          </Card>
        </View>

        <View style={{ height: 28 }} />
      </ScrollView>

      {/* Share Backup Modal */}
      
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6fb',
  },
  scrollContent: {
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  tabButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  tabButtonTextActive: {
    color: '#ffffff',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    color: '#991b1b',
  },
  exportRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  exportOutline: {
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#ffffff',
  },
  exportText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  shareRow: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    borderRadius: 12,
  },
  whatsappText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  backupSection: {
    marginTop: 20,
    paddingHorizontal: 16,
    gap: 12,
  },
  backupHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  backupRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backupButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  backupPrimary: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  backupRestore: {
    borderColor: '#86efac',
    backgroundColor: '#dcfce7',
  },
  backupReset: {
    borderColor: '#fecaca',
    backgroundColor: '#fee2e2',
  },
  backupButtonDisabled: {
    opacity: 0.6,
  },
  backupButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  backupButtonTextDanger: {
    color: '#b91c1c',
  },
  metricsSection: {
    marginTop: 20,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  metricsGrid: {
    paddingHorizontal: 16,
    gap: 12,
  },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  metricProfit: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
  },
  metricBlue: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  metricGreen: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  metricOrange: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  metricOrangeLight: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  metricPurple: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  metricLight: {
    backgroundColor: '#f9fafb',
    borderColor: '#e2e8f0',
  },
  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricIconProfit: {
    backgroundColor: '#bbf7d0',
  },
  metricIconBlue: {
    backgroundColor: '#bfdbfe',
  },
  metricIconGreen: {
    backgroundColor: '#bae6fd',
  },
  metricIconOrange: {
    backgroundColor: '#fed7aa',
  },
  metricIconPurple: {
    backgroundColor: '#ddd6fe',
  },
  metricIconLight: {
    backgroundColor: '#e0f2fe',
  },
  metricContent: {
    flex: 1,
    gap: 4,
  },
  metricTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  metricHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#4b5563',
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#fff7ed',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  badgeText: {
    fontSize: 11,
    color: '#b45309',
    fontWeight: '600',
  },
  infoCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  productRank: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338ca',
  },
  productDetails: {
    flex: 1,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  productMeta: {
    fontSize: 12,
    color: '#475569',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentLabel: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
  },
  paymentValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563eb',
  },
  backupShare: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  backupBrowse: {
    backgroundColor: '#ecfeff',
    borderColor: '#cffafe',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalCloseButton: {
    padding: 4,
  },
  backupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backupItemContent: {
    flex: 1,
  },
  backupItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  backupItemDate: {
    fontSize: 12,
    color: '#64748b',
  },
  emptyBackupList: {
    padding: 40,
    alignItems: 'center',
  },
  emptyBackupText: {
    fontSize: 14,
    color: '#94a3b8',
  },
});










