import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';

import { useData } from '../contexts/DataContext';
import { useLanguage } from '../contexts/LanguageContext';
import { fuzzySearch } from '../lib/searchUtils';

const formatCurrency = (value: number | null | undefined) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 'Rs. 0';
  }
  return `Rs. ${amount.toLocaleString()}`;
};

type VendorItem = ReturnType<typeof useData>['vendors'][number];

const getInitial = (name?: string) => (name ? name.trim().charAt(0).toUpperCase() : '?');

export default function VendorsScreen() {
  const router = useRouter();
  const { vendors: rawVendors, deleteVendor } = useData();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const vendors = rawVendors ?? [];

  const summary = useMemo(() => {
    const totalVendors = vendors.length;
    const totalPayable = vendors.reduce(
      (sum, vendor) => sum + (Number(vendor.payable) || 0),
      0
    );
    const totalPurchases = vendors.reduce(
      (sum, vendor) => sum + (Number(vendor.totalPurchases) || 0),
      0
    );

    return {
      totalVendors,
      totalPayable,
      totalPurchases,
    };
  }, [vendors]);

  const filteredVendors: VendorItem[] = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) {
      return vendors;
    }

    return fuzzySearch(vendors, query, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'phone', weight: 1.5 },
        { name: 'company', weight: 1.2 },
        { name: 'email', weight: 1 },
      ],
      threshold: 0.3,
      adaptiveScoring: true,
    });
  }, [vendors, searchQuery]);

  const openVendor = (vendorId?: number) => {
    const params: Record<string, string> = {};
    if (vendorId) {
      params.vendorId = String(vendorId);
    }
    router.push({ pathname: '/modals/vendor-account', params });
  };

  const openHistory = (vendorId?: number) => {
    const params = vendorId ? { vendorId: String(vendorId) } : undefined;
    router.push({ pathname: '/vendor-history', params });
  };

  const confirmDelete = (vendorId: number) => {
    Alert.alert(
      t('Delete vendor?'),
      t('This will remove the vendor and related payable balance.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVendor(vendorId);
              Toast.show({ type: 'success', text1: t('Vendor deleted') });
            } catch (error) {
              console.error('Failed to delete vendor', error);
              Toast.show({ type: 'error', text1: t('Unable to delete vendor') });
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.headerTitle}>{t('Vendors / Suppliers')}</Text>
            <Text style={styles.headerSubtitle}>{t('Manage your suppliers')}</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('Search vendors by name, phone, or company')}
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statBlue]}>
            <Text style={styles.statLabel}>{t('Total vendors')}</Text>
            <Text style={styles.statValue}>{summary.totalVendors}</Text>
          </View>
          <View style={[styles.statCard, styles.statPeach]}>
            <Text style={styles.statLabel}>{t('Total payable')}</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.totalPayable)}</Text>
          </View>
        </View>

        {filteredVendors.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={44} color="#cbd5f5" />
            <Text style={styles.emptyTitle}>{t('No vendors yet')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('Add a vendor to track purchases and outstanding payables.')}
            </Text>
          </View>
        ) : (
          filteredVendors.map((vendor) => (
            <TouchableOpacity
              key={vendor.id}
              style={styles.vendorCard}
              activeOpacity={0.9}
              onPress={() => openHistory(vendor.id)}
            >
              <View style={styles.vendorRow}>
                <View style={styles.avatar}>
                  {vendor.imageUri ? (
                    <Image source={{ uri: vendor.imageUri }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarText}>{getInitial(vendor.name)}</Text>
                  )}
                </View>
                <View style={styles.vendorInfo}>
                  <Text style={styles.vendorName}>{vendor.name}</Text>
                  {vendor.phone ? (
                    <Text style={styles.vendorMeta}>{vendor.phone}</Text>
                  ) : null}
                  {vendor.lastPurchase ? (
                    <Text style={styles.vendorMeta}>
                      {t('Last purchase')}: {vendor.lastPurchase}
                    </Text>
                  ) : null}
                  <Text style={styles.vendorMeta}>
                    {t('Total Purchases')}: {formatCurrency(vendor.totalPurchases)}
                  </Text>
                </View>
                <View style={styles.vendorRight}>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.iconAction}
                      onPress={() => openVendor(vendor.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="pencil-outline" size={18} color="#2563eb" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconAction, styles.deleteAction]}
                      onPress={() => confirmDelete(vendor.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.payableBlock}>
                    <Text style={styles.payableLabel}>{t('Payable')}</Text>
                    <Text style={styles.payableAmount}>{formatCurrency(vendor.payable)}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.vendorActions}>
                <TouchableOpacity
                  style={styles.secondaryAction}
                  onPress={() =>
                    router.push({
                      pathname: '/modals/purchase-entry',
                      params: { vendorId: String(vendor.id) },
                    })
                  }
                  activeOpacity={0.9}
                >
                  <Ionicons name="bag-handle-outline" size={16} color="#2563eb" />
                  <Text style={styles.secondaryActionText}>{t('New Purchase')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryActionGhost}
                  onPress={() => openHistory(vendor.id)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="time-outline" size={16} color="#2563eb" />
                  <Text style={styles.secondaryActionGhostText}>{t('View History')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={styles.quickActionsCard}>
          <Text style={styles.quickTitle}>{t('Quick Actions')}</Text>
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={styles.quickButtonPrimary}
              activeOpacity={0.9}
              onPress={() => router.push('/modals/purchase-entry')}
            >
              <Ionicons name="bag-handle-outline" size={18} color="#ffffff" />
              <Text style={styles.quickButtonPrimaryText}>{t('New Purchase')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLink}
              activeOpacity={0.9}
              onPress={() => openHistory()}
            >
              <Text style={styles.quickLinkText}>{t('View Purchase History')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.fab}
        onPress={() => openVendor()}
      >
        <Ionicons name="add" size={22} color="#ffffff" />
        <Text style={styles.fabText}>{t('Add Vendor')}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statBlue: {
    backgroundColor: '#e8f0ff',
  },
  statPeach: {
    backgroundColor: '#fef2e8',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  quickActionsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 16,
  },
  quickTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  quickButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  vendorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 10,
  },
  vendorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vendorRight: {
    alignItems: 'flex-end',
    gap: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e7edff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  vendorInfo: {
    flex: 1,
    gap: 2,
  },
  vendorName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  vendorMeta: {
    fontSize: 13,
    color: '#6b7280',
  },
  payableBlock: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 96,
  },
  payableLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  payableAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#dc2626',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAction: {
    borderColor: '#fee2e2',
    backgroundColor: '#fef2f2',
  },
  vendorActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#eef2ff',
  },
  secondaryActionText: {
    color: '#2563eb',
    fontWeight: '700',
  },
  secondaryActionGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryActionGhostText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  quickButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 10,
  },
  quickButtonPrimaryText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  quickLink: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  quickLinkText: {
    color: '#2563eb',
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
