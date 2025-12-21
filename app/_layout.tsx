import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';
import { DataProvider } from '../contexts/DataContext';
import { LanguageProvider } from '../contexts/LanguageContext';
import { ShopProvider } from '../contexts/ShopContext';
import { PosProvider } from '../contexts/PosContext';
import { View, ActivityIndicator, Text, StyleSheet, Animated, TouchableWithoutFeedback, TouchableOpacity, LogBox } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { KeyLoginScreen } from '../components/auth/KeyLoginScreen';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ReceiptBitmapRenderer } from '../components/printing/ReceiptBitmapRenderer';
import { initCrashLogger } from '../lib/crashLogger';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { db } from '../lib/database';
import { startPrintQueueWorker, stopPrintQueueWorker } from '../services/printQueueService';

// Ignore specific warnings related to Text rendering in LogBox
LogBox.ignoreLogs([
  'Text strings must be rendered within a <Text> component',
]);

export default function RootLayout() {
  useEffect(() => {
    initCrashLogger();
  }, []);

  useEffect(() => {
    startPrintQueueWorker();
    return () => {
      stopPrintQueueWorker();
    };
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
          <ReceiptBitmapRenderer />
          <Toast />
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const AppNavigation = () => {
  const { isLoading, user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const [showWelcome, setShowWelcome] = useState(false);
  const welcomeAnim = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<NodeJS.Timeout | null>(null);
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  const lastWelcomeUserId = useRef<string | null>(null);
  const [backupChoice, setBackupChoice] = useState<'local' | 'cloud' | null>(null);

  useEffect(() => {
    let mounted = true;
    db.getSetting('welcome:seen')
      .then((value) => {
        if (!mounted) return;
        setWelcomeSeen(value === '1');
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

    if (justLoggedIn && !welcomeSeen) {
      lastWelcomeUserId.current = userId;
      // Temporarily disabled to prevent infinite loop
      // setShowWelcome(true);
      // Animated.timing(welcomeAnim, {
      //   toValue: 1,
      //   duration: 220,
      //   useNativeDriver: true,
      // }).start();
    }

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [user, welcomeSeen]);

  const handleDeveloperPress = () => {
    hideWelcome();
    router.push('/modals/about-developer');
  };

  const handleBackupChoice = async (choice: 'local' | 'cloud') => {
    setBackupChoice(choice);
    if (choice === 'cloud') {
      Toast.show({ type: 'info', text1: 'Upgrade your tier' });
    } else {
      Toast.show({ type: 'success', text1: 'Data will be saved on your device' });
    }
  };

  const handleWelcomeContinue = async () => {
    setWelcomeSeen(true);
    try {
      await db.setSetting('welcome:seen', '1');
    } catch {
      // ignore
    }
    hideWelcome();
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
        <Stack.Screen
          name="print-center"
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
      {!(segments[0] === '(tabs)') && (
        <View pointerEvents="box-none" style={styles.globalHomeWrap}>
          <TouchableOpacity
            style={[
              styles.globalHomeButton,
              { bottom: Math.max(insets.bottom + 24, 96), right: 16 },
            ]}
            activeOpacity={0.85}
            onPress={() => router.replace('/')}
          >
            <Ionicons name="home" size={18} color="#0f172a" />
          </TouchableOpacity>
        </View>
      )}
      {showWelcome && (
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
            <View style={styles.welcomeChoiceRow}>
              <TouchableOpacity
                style={[
                  styles.choiceCard,
                  backupChoice === 'local' && styles.choiceCardActive,
                ]}
                onPress={() => handleBackupChoice('local')}
                activeOpacity={0.9}
              >
                <Ionicons name="phone-portrait-outline" size={22} color="#2563eb" />
                <View style={styles.choiceTextBlock}>
                  <Text style={styles.choiceTitle}>Save data on device</Text>
                  <Text style={styles.choiceSubtitle}>Store locally on this phone</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.choiceCard,
                  backupChoice === 'cloud' && styles.choiceCardActive,
                ]}
                onPress={() => handleBackupChoice('cloud')}
                activeOpacity={0.9}
              >
                <Ionicons name="cloud-outline" size={22} color="#2563eb" />
                <View style={styles.choiceTextBlock}>
                  <Text style={styles.choiceTitle}>Save to cloud</Text>
                  <Text style={styles.choiceSubtitle}>Secure online backup</Text>
                </View>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[
                styles.welcomeContinueButton,
                !backupChoice && styles.welcomeContinueButtonDisabled,
              ]}
              disabled={!backupChoice}
              onPress={handleWelcomeContinue}
            >
              <Text
                style={[
                  styles.welcomeContinueText,
                  !backupChoice && styles.welcomeContinueTextDisabled,
                ]}
              >
                Continue to app
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.devBlock} onPress={handleDeveloperPress} activeOpacity={0.85}>
              <Text style={styles.devName}>Developed by M. Abubakar Siddique</Text>
              <View style={styles.devPhoneRow}>
                <Ionicons name="call-outline" size={16} color="#2563eb" />
                <Text style={styles.devPhone}>03066987888</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
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
  globalHomeWrap: {
    position: 'absolute',
    right: 0,
    left: 0,
    bottom: 0,
    alignItems: 'flex-end',
    paddingRight: 0,
    paddingBottom: 0,
    zIndex: 999,
  },
  globalHomeButton: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  welcomeChoiceRow: {
    width: '100%',
    gap: 10,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  choiceCardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  choiceTextBlock: {
    flex: 1,
  },
  choiceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  choiceSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  welcomeContinueButton: {
    marginTop: 12,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  welcomeContinueButtonDisabled: {
    backgroundColor: '#cbd5f5',
  },
  welcomeContinueText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  welcomeContinueTextDisabled: {
    color: '#e5e7eb',
  },
});
