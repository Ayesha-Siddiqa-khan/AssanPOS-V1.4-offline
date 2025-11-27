import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import { DataProvider } from '../contexts/DataContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { ShopProvider } from '../contexts/ShopContext';
import { PosProvider } from '../contexts/PosContext';
import { View, ActivityIndicator, Text, StyleSheet, Animated, TouchableWithoutFeedback, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { KeyLoginScreen } from '../components/auth/KeyLoginScreen';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initCrashLogger } from '../lib/crashLogger';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { db } from '../lib/database';

export default function RootLayout() {
  useEffect(() => {
    initCrashLogger();
  }, []);

  useEffect(() => {
    const originalShow = Toast.show;
    // Wrap Toast.show to enforce a shorter default visibility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Toast.show = ((options: any) => {
      const next = { visibilityTime: 2000, ...options };
      return originalShow(next);
    }) as typeof Toast.show;
    return () => {
      Toast.show = originalShow;
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <View style={{ flex: 1 }}>
          <AuthProvider>
            <DataProvider>
              <LanguageProvider>
                <ShopProvider>
                  <PosProvider>
                    <AppNavigation />
                  </PosProvider>
                </ShopProvider>
              </LanguageProvider>
            </DataProvider>
          </AuthProvider>
          <Toast />
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const AppNavigation = () => {
  const { isLoading, user } = useAuth();
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeAnim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<NodeJS.Timeout | null>(null);
  const [welcomeDisabled, setWelcomeDisabled] = useState(false);
  const lastWelcomeUserId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    db.getSetting('welcome:disable')
      .then((value) => {
        if (!mounted) return;
        setWelcomeDisabled(value === '1');
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const hideWelcome = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(welcomeAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setShowWelcome(false));
  }, [welcomeAnim]);

  useEffect(() => {
    const userId = user?.id ? String(user.id) : null;
    const justLoggedIn = userId && lastWelcomeUserId.current !== userId;

    if (justLoggedIn && !welcomeDisabled) {
      lastWelcomeUserId.current = userId;
      setShowWelcome(true);
      Animated.timing(welcomeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
      hideTimer.current = setTimeout(hideWelcome, 6000);
    } else {
      setShowWelcome(false);
    }

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [user, welcomeAnim, hideWelcome, welcomeDisabled]);

  const handleDeveloperPress = () => {
    hideWelcome();
    router.push('/modals/about-developer');
  };

  const toggleWelcomeDisabled = async () => {
    const next = !welcomeDisabled;
    setWelcomeDisabled(next);
    try {
      await db.setSetting('welcome:disable', next ? '1' : '0');
    } catch {
      // ignore persistence failures
    }
    if (next) {
      hideWelcome();
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loaderText}>Preparing your register...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <>
        <StatusBar style="dark" />
        <KeyLoginScreen />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        
        {/* Standalone Routes */}
        <Stack.Screen
          name="credit-ledger"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="expenditures"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="pending-payments"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="vendors"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="calculator"
          options={{
            headerShown: false,
          }}
        />

        {/* Modal Routes */}
        <Stack.Screen
          name="modals/product-selection"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Walk-in Customer',
          }}
        />
        <Stack.Screen
          name="modals/payment"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Payment',
          }}
        />
        <Stack.Screen
          name="modals/sale-success"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Sale Completed',
          }}
        />
        <Stack.Screen
          name="modals/customer-account"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Customer Account',
          }}
        />
        <Stack.Screen
          name="modals/customer-lookup"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Customer Lookup',
          }}
        />
        <Stack.Screen
          name="modals/vendor-account"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Vendor Account',
          }}
        />
        <Stack.Screen
          name="modals/expenditure"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Expenditure',
          }}
        />
        <Stack.Screen
          name="modals/purchase-entry"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Purchase Entry',
          }}
        />
        <Stack.Screen
          name="modals/product-entry"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Add New Product',
          }}
        />
        <Stack.Screen
          name="modals/product-variants"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Add Variants',
          }}
        />
        <Stack.Screen
          name="modals/stock-adjustment"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Adjust Stock',
          }}
        />
        <Stack.Screen
          name="modals/variant-edit"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'Edit Variant',
          }}
        />
        <Stack.Screen
          name="modals/about-developer"
          options={{
            presentation: 'modal',
            headerShown: true,
            headerTitle: 'About the Developer',
          }}
        />
      </Stack>
      {showWelcome && (
        <TouchableWithoutFeedback onPress={hideWelcome}>
          <View style={styles.welcomeOverlay}>
            <Animated.View
              style={[
                styles.welcomeCard,
                {
                  opacity: welcomeAnim,
                  transform: [
                    {
                      scale: welcomeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <TouchableOpacity
                style={styles.welcomeClose}
                onPress={hideWelcome}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <Ionicons name="close" size={18} color="#475569" />
              </TouchableOpacity>
              <View style={styles.welcomeIcon}>
                <Ionicons name="checkmark-circle" size={42} color="#22c55e" />
              </View>
              <Text style={styles.welcomeTitle}>Welcome, {user?.name ?? 'there'}!</Text>
              <Text style={styles.welcomeSubtitle}>Thanks for using AsaanPOS.</Text>
              <View style={styles.welcomeDivider} />
              <TouchableOpacity style={styles.devBlock} onPress={handleDeveloperPress} activeOpacity={0.85}>
                <Text style={styles.devName}>Developed by M. Abubakar Siddique</Text>
                <View style={styles.devPhoneRow}>
                  <Ionicons name="call-outline" size={16} color="#2563eb" />
                  <Text style={styles.devPhone}>03066987888</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.welcomeCheckboxRow}
                onPress={toggleWelcomeDisabled}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.welcomeCheckbox,
                    welcomeDisabled && styles.welcomeCheckboxChecked,
                  ]}
                >
                  {welcomeDisabled && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.welcomeCheckboxLabel}>Don't show again</Text>
              </TouchableOpacity>
              <Text style={styles.welcomeHint}>Tap anywhere to continue</Text>
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
  },
  loaderText: {
    fontSize: 13,
    color: '#64748b',
  },
  welcomeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  welcomeCard: {
    width: '96%',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    alignItems: 'center',
  },
  welcomeClose: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#ecfdf3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  welcomeDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    width: '100%',
    marginVertical: 14,
  },
  devBlock: {
    alignItems: 'center',
    gap: 6,
  },
  devName: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '600',
  },
  devPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  devPhone: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '700',
  },
  welcomeCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  welcomeCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  welcomeCheckboxChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  welcomeCheckboxLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  welcomeHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#94a3b8',
  },
});


