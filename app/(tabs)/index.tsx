import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePos } from '../../contexts/PosContext';
import { useShop } from '../../contexts/ShopContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { formatDateForDisplay } from '../../lib/date';

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const {
    sales,
    customers,
    products,
    isLoading,
  } = useData();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const { resetSale } = usePos();
  const { profile: shopProfile } = useShop();
  const formatCurrency = (value: number) => `Rs. ${Number(value || 0).toLocaleString()}`;

  const [phoneSearch, setPhoneSearch] = useState('');
  const [isAboutVisible, setIsAboutVisible] = useState(false);

  const headerActions = useMemo(
    () => [
      {
        key: 'calculator',
        label: t('Calculator'),
        icon: 'calculator-outline' as const,
        onPress: () => router.push('/calculator'),
      },
      {
        key: 'settings',
        label: t('Settings'),
        icon: 'settings-outline' as const,
        onPress: () => router.push('/(tabs)/settings'),
      },
      {
        key: 'info',
        label: t('About'),
        icon: 'information-circle-outline' as const,
        onPress: () => setIsAboutVisible(true),
      },
    ],
    [router, t]
  );

  const todayLabel = useMemo(() => {
    const today = new Date();
    const weekday = today.toLocaleDateString(
      language === 'urdu' ? 'ur-PK' : 'en-US',
      { weekday: 'long' }
    );
    return `${weekday}, ${formatDateForDisplay(today)}`;
  }, [language]);

  const todaySalesTotal = useMemo(() => {
    const todayStr = formatDateForDisplay(new Date());
    return sales
      .filter((sale) => formatDateForDisplay(sale.date) === todayStr)
      .reduce((sum, sale) => sum + (sale.total || 0), 0);
  }, [sales]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.navTitle}>
          <Text style={styles.navTitleText} numberOfLines={1}>
            {shopProfile.shopName?.trim() || 'AsaanPOS'}
          </Text>
          <Text style={styles.navSubtitle} numberOfLines={1}>
            {todayLabel}
          </Text>
        </View>
      ),
      headerRight: () => (
        <View style={styles.navActions}>
          {headerActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={styles.navActionButton}
              onPress={action.onPress}
              activeOpacity={0.85}
            >
              <Ionicons name={action.icon} size={20} color="#0f172a" />
            </TouchableOpacity>
          ))}
        </View>
      ),
      headerStyle: { backgroundColor: '#e9efff' },
      headerTintColor: '#0f172a',
    });
  }, [navigation, headerActions, shopProfile, todayLabel, user, t]);

  const pendingPayments = useMemo(
    () => sales.filter((sale) => sale.status === 'Partially Paid' || sale.status === 'Due'),
    [sales]
  );

  const pendingBalanceTotal = useMemo(
    () => pendingPayments.reduce((sum, sale) => sum + sale.remainingBalance, 0),
    [pendingPayments]
  );

  const recentSales = useMemo(() => sales.slice(0, 5), [sales]);
  const developerEmail = 'abubakarkhanlakhwera@gmail.com';
  const developerPhone = '0306-6987888';

  const lowStockItems = useMemo(() => {
    if (!products || products.length === 0) {
      return [];
    }

    const items: Array<{ key: string; name: string; stock: number; target: number }> = [];

    products.forEach((product) => {
      if (product.hasVariants && product.variants?.length) {
        product.variants.forEach((variant) => {
          const target = variant.minStock ?? product.minStock ?? 0;
          const stock = variant.stock ?? 0;
          if (target > 0 && stock <= target) {
            items.push({
              key: `variant-${variant.id}`,
              name: `${product.name} - ${variant.name}`,
              stock,
              target,
            });
          }
        });
      } else {
        const target = product.minStock ?? 0;
        const stock = product.stock ?? 0;
        if (target > 0 && stock <= target) {
          items.push({
            key: `product-${product.id}`,
            name: product.name,
            stock,
            target,
          });
        }
      }
    });

    return items.sort((a, b) => a.stock - b.stock);
  }, [products]);

  const handleOpenLowStock = () => {
    router.push('/inventory?filter=low');
  };

  const handleStartSale = () => {
    resetSale();
    router.push('/modals/product-selection');
  };

  const handleOpenEmail = () => {
    Linking.openURL(`mailto:${developerEmail}`).catch(() => {});
  };

  const handleOpenPhone = () => {
    Linking.openURL(`tel:${developerPhone.replace(/[^0-9+]/g, '')}`).catch(() => {});
  };

  const handleSearchCustomer = () => {
    const trimmed = phoneSearch.trim();
    const normalized = normalizePhone(trimmed);

    if (!trimmed) {
      Toast.show({ type: 'info', text1: t('Enter a name or phone to search') });
      return;
    }

    const matchedCustomer = customers.find((customer) => {
      const phoneMatch = normalizePhone(customer.phone) === normalized;
      const nameMatch = customer.name?.toLowerCase().includes(trimmed.toLowerCase());
      return phoneMatch || nameMatch;
    });

    if (matchedCustomer) {
      router.push({
        pathname: '/modals/customer-account',
        params: { customerId: String(matchedCustomer.id) },
      });
      setPhoneSearch('');
      return;
    }

    Toast.show({
      type: 'info',
      text1: t('No customer found'),
      text2: t('Use the Customers tab to add a new account.'),
    });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'Paid':
        return { label: t('Paid'), variant: 'success' as const };
      case 'Partially Paid':
        return { label: t('Partially Paid'), variant: 'warning' as const };
      case 'Due':
        return { label: t('Due'), variant: 'danger' as const };
      default:
        return { label: status, variant: 'secondary' as const };
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>{t('Loading...')}</Text>
      </SafeAreaView>
    );
  }

  const quickActionGroups = [
    {
      key: 'payments',
      title: t('Payments'),
      actions: [
        {
          key: 'pending',
          label: t('Pending Payments'),
          icon: 'time-outline' as const,
          tint: '#f97316',
          backdrop: '#fff7ed',
          meta:
            pendingPayments.length > 0
              ? `${pendingPayments.length} ${t('open')}`
              : t('All clear'),
          onPress: () => router.push('/pending-payments'),
        },
        {
          key: 'jazzcash',
          label: t('JazzCash'),
          icon: 'card-outline' as const,
          tint: '#2563eb',
          backdrop: '#eef2ff',
          meta: t('Manager'),
          onPress: () => router.push('/jazzcash'),
        },
      ],
    },
    {
      key: 'accounts',
      title: t('Accounts'),
      actions: [
        {
          key: 'ledger',
          label: t('Customer Credit'),
          icon: 'book-outline' as const,
          tint: '#0ea5e9',
          backdrop: '#e0f2fe',
          meta: t('Manage customer credit'),
          onPress: () => router.push('/credit-ledger'),
        },
        {
          key: 'expenses',
          label: t('Expenses'),
          icon: 'cash-outline' as const,
          tint: '#dc2626',
          backdrop: '#fee2e2',
          meta: t('Track shop expenses'),
          onPress: () => router.push('/expenditures'),
        },
      ],
    },
    {
      key: 'suppliers',
      title: t('Suppliers'),
      actions: [
        {
          key: 'vendors',
          label: t('Vendors'),
          icon: 'people-circle-outline' as const,
          tint: '#22c55e',
          backdrop: '#dcfce7',
          meta: t('Add supplier records'),
          onPress: () => router.push('/vendors'),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroGreeting}>
              {t('Hello')},{' '}
              <Text style={styles.heroName}>
                {user?.name?.trim() || shopProfile.ownerName?.trim() || t('Team')}
              </Text>
            </Text>
            <View style={styles.heroStatsRow}>
              <TouchableOpacity
                style={styles.heroStat}
                activeOpacity={0.8}
                onPress={() => router.push('/(tabs)/sales')}
              >
                <View style={styles.heroStatTop}>
                  <Text style={styles.heroStatValue}>{formatCurrency(todaySalesTotal)}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#6b7280" />
                </View>
                <Text style={styles.heroStatLabel}>{t("Today's sales")}</Text>
              </TouchableOpacity>
              <View style={styles.heroDivider} />
              <TouchableOpacity
                style={styles.heroStat}
                activeOpacity={0.8}
                onPress={() => router.push('/pending-payments')}
              >
                <View style={styles.heroStatTop}>
                  <Text style={styles.heroStatValue}>{pendingPayments.length}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#6b7280" />
                </View>
                <Text style={styles.heroStatLabel}>{t('Pending payments')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroActions} />
        </View>

        <View style={styles.searchBlock}>
          <Text style={[styles.microLabel, { marginTop: 6 }]}>{t('Start new sale')}</Text>
          <Button style={styles.newSaleButton} onPress={handleStartSale}>
            <View style={styles.newSaleContent}>
              <Ionicons name="add-circle" size={20} color="#ffffff" />
              <Text style={styles.newSaleLabel}>
                {t('New Sale')} · {t('Create a quick invoice')}
              </Text>
            </View>
          </Button>
        </View>

        {lowStockItems.length > 0 && (
          <TouchableOpacity
            style={styles.lowStockAlert}
            activeOpacity={0.85}
            onPress={handleOpenLowStock}
          >
            <View style={styles.lowStockAlertHeader}>
              <View style={styles.lowStockAlertTitleRow}>
                <Ionicons name="alert-circle" size={18} color="#dc2626" />
                <Text style={styles.lowStockAlertTitle}>{t('Low Stock Alerts')}</Text>
              </View>
              <View style={styles.lowStockAlertBadge}>
                <Text style={styles.lowStockAlertBadgeText}>{lowStockItems.length}</Text>
              </View>
            </View>
            {lowStockItems.slice(0, 3).map((item) => (
              <View key={item.key} style={styles.lowStockAlertRow}>
                <View>
                  <Text style={styles.lowStockAlertName}>{item.name}</Text>
                  <Text style={styles.lowStockAlertMeta}>
                    {t('Stock')}: {item.stock} / {item.target}
                  </Text>
                </View>
                <Text style={styles.lowStockAlertAction}>{t('Reorder')}</Text>
              </View>
            ))}
            {lowStockItems.length > 3 && (
              <Text style={styles.lowStockAlertFooter}>
                {t('Plus {count} more items').replace(
                  '{count}',
                  String(lowStockItems.length - 3)
                )}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.quickActionSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Quick Actions')}</Text>
            <TouchableOpacity onPress={() => {}}>
              <Text style={styles.seeAll}>
                {t('View all actions')} <Ionicons name="chevron-forward" size={14} color="#2563eb" />
              </Text>
            </TouchableOpacity>
          </View>
          {quickActionGroups.map((group) => (
            <View key={group.key} style={styles.quickGroup}>
              <Text style={styles.quickGroupTitle}>{group.title}</Text>
              <View style={styles.quickActionsGrid}>
                {group.actions.map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    style={styles.quickActionCard}
                    onPress={action.onPress}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.quickActionIcon, { backgroundColor: action.backdrop }]}>
                      <Ionicons name={action.icon} size={22} color={action.tint} />
                    </View>
                    <Text style={styles.quickActionLabel}>{action.label}</Text>
                    <Text style={styles.quickActionMeta}>{action.meta}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>

      <View style={styles.recentSalesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('Recent Sales')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/sales')}>
              <Text style={styles.seeAll}>{t('See All')}</Text>
            </TouchableOpacity>
          </View>

          {recentSales.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyStateIconWrapper}>
                <Ionicons name="receipt-outline" size={28} color="#2563eb" />
              </View>
              <Text style={styles.emptyStateTitle}>{t('No sales recorded yet')}</Text>
              <Text style={styles.emptyStateText}>
                {t('Start a new sale to see it listed here.')}
              </Text>
            </View>
          ) : (
            recentSales.map((sale) => {
              const statusConfig = getStatusConfig(sale.status);
              return (
                <View key={sale.id} style={styles.saleCard}>
                  <View style={styles.saleHeader}>
                    <View style={styles.saleTitleBlock}>
                      <Text style={styles.saleCustomer}>
                        {sale.customer?.name || t('Walk-in Customer')}
                      </Text>
                      <Text style={styles.saleDate}>
                        {formatDateForDisplay(sale.date)}
                        {sale.time ? ` ${sale.time}` : ''}
                      </Text>
                    </View>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                  </View>
                  <View style={styles.saleFooter}>
                    <Text style={styles.saleAmount}>Rs. {sale.total.toLocaleString()}</Text>
                    <Text style={styles.saleItems}>
                      {sale.items}{' '}
                      {sale.items === 1 ? t('item') : t('items')}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
      <Modal
        visible={isAboutVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsAboutVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.aboutOverlay}
          onPressOut={() => setIsAboutVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.aboutCard}>
            <View style={styles.aboutHeader}>
              <Text style={styles.aboutTitle}>{t('About the Developer')}</Text>
              <TouchableOpacity onPress={() => setIsAboutVisible(false)}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <View style={styles.aboutAvatar}>
              <Text style={styles.aboutAvatarText}>MA</Text>
            </View>
            <Text style={styles.aboutName}>Muhammad AbuBakar Siddique</Text>
            <Text style={styles.aboutRole}>{t('Web & Mobile App Developer')}</Text>

            <ScrollView
              style={styles.aboutBody}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <Text style={styles.aboutParagraph}>
                {t("Hi! I'm a Web & Mobile App Developer helping businesses ship fast, reliable products.")}
              </Text>
              <Text style={styles.aboutLabel}>{t('I can help you build:')}</Text>
              <View style={styles.aboutBulletRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#2563eb" />
                <Text style={styles.aboutBulletText}>{t('Custom websites')}</Text>
              </View>
              <View style={styles.aboutBulletRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#2563eb" />
                <Text style={styles.aboutBulletText}>{t('Android & iOS apps')}</Text>
              </View>
              <View style={styles.aboutBulletRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#2563eb" />
                <Text style={styles.aboutBulletText}>{t('AI-powered tools and dashboards')}</Text>
              </View>

              <Text style={[styles.aboutLabel, { marginTop: 10 }]}>{t('Need help? Reach out:')}</Text>
              <TouchableOpacity
                style={styles.aboutContact}
                onPress={handleOpenEmail}
              >
                <Ionicons name="mail-outline" size={18} color="#2563eb" />
                <Text style={styles.aboutContactText}>{developerEmail}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.aboutContact}
                onPress={handleOpenPhone}
              >
                <Ionicons name="call-outline" size={18} color="#2563eb" />
                <Text style={styles.aboutContactText}>{developerPhone}</Text>
              </TouchableOpacity>
            </ScrollView>

            <Button style={styles.aboutCloseButton} onPress={() => setIsAboutVisible(false)}>
              {t('Close')}
            </Button>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f6fa',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  navTitle: {
    maxWidth: 280,
    gap: 2,
  },
  navTitleText: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  navSubtitle: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 4,
  },
  navActionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  aboutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  aboutCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    maxHeight: '80%',
    width: '92%',
    alignSelf: 'center',
  },
  aboutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aboutTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0f172a',
  },
  aboutAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  aboutAvatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2563eb',
  },
  aboutName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  aboutRole: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 8,
  },
  aboutBody: {
    marginBottom: 16,
  },
  aboutParagraph: {
    fontSize: 13,
    lineHeight: 19,
    color: '#334155',
    marginBottom: 10,
  },
  aboutLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  aboutBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  aboutBulletText: {
    fontSize: 13,
    color: '#0f172a',
  },
  aboutContact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  aboutContactText: {
    fontSize: 13,
    color: '#2563eb',
    textDecorationLine: 'underline',
  },
  aboutCloseButton: {
    marginTop: 4,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  heroLeft: {
    flex: 1,
    gap: 4,
  },
  heroGreeting: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  heroName: {
    color: '#2563eb',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginTop: 4,
  },
  heroStat: {
    flex: 1,
    gap: 4,
    paddingHorizontal: 8,
  },
  heroStatTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroStatLabel: {
    fontSize: 11.5,
    color: '#6b7280',
    fontWeight: '600',
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  heroDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e5e7eb',
  },
  heroActions: {
    flexDirection: 'row',
    gap: 6,
  },
  heroIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchBlock: {
    marginTop: 14,
    gap: 6,
  },
  microLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  searchContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#111827',
  },
  searchAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newSaleButton: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    marginTop: 6,
    paddingVertical: 16,
  },
  newSaleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newSaleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 10,
  },
  lowStockAlert: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fecdd3',
    backgroundColor: '#fff1f2',
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  lowStockAlertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lowStockAlertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lowStockAlertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#b91c1c',
  },
  lowStockAlertBadge: {
    minWidth: 32,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
  },
  lowStockAlertBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b91c1c',
  },
  lowStockAlertRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  lowStockAlertName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  lowStockAlertMeta: {
    fontSize: 12,
    color: '#374151',
    marginTop: 2,
  },
  lowStockAlertAction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  lowStockAlertFooter: {
    fontSize: 12,
    color: '#374151',
    fontStyle: 'italic',
  },
  quickActionSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  quickGroup: {
    marginBottom: 12,
  },
  quickGroupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickActionCard: {
    width: '48%',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    alignSelf: 'center',
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
  },
  quickActionMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
  },
  recentSalesSection: {
    marginBottom: 20,
  },
  saleCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 12,
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  saleTitleBlock: {
    flex: 1,
    paddingRight: 12,
  },
  saleCustomer: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  saleDate: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },
  saleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  saleItems: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyStateCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 24,
    alignItems: 'center',
  },
  emptyStateIconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  emptyStateText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
});



