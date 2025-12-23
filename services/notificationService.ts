import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { db } from '../lib/database';

type NotificationPreferences = {
  lowStockEnabled: boolean;
  lowStockThreshold: number;
  backupReminderEnabled: boolean;
  backupReminderHour?: number;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const PREFS_KEY = 'notification.preferences';
const TOKENS_KEY = 'notification.tokens';

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const prefs = (await db.getSetting(PREFS_KEY)) as NotificationPreferences | null;
  return (
    prefs || {
      lowStockEnabled: true,
      lowStockThreshold: 3,
      backupReminderEnabled: true,
      backupReminderHour: 21,
    }
  );
}

export async function saveNotificationPreferences(prefs: NotificationPreferences) {
  await db.setSetting(PREFS_KEY, prefs);
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device.');
    return null;
  }

  const existingStatus = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus.status;

  if (existingStatus.status !== 'granted') {
    const requestStatus = await Notifications.requestPermissionsAsync();
    finalStatus = requestStatus.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  const token = tokenResponse.data;

  const storedTokens: string[] = (await db.getSetting(TOKENS_KEY)) || [];
  if (!storedTokens.includes(token)) {
    storedTokens.push(token);
    await db.setSetting(TOKENS_KEY, storedTokens);
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  return token;
}

export async function notifyLowStock(products: Array<{ name: string; stock?: number; minStock?: number }>) {
  const prefs = await getNotificationPreferences();
  if (!prefs.lowStockEnabled) {
    return;
  }

  const criticalProducts = products.filter((product) => {
    const stock = product.stock ?? 0;
    const minStock = product.minStock ?? prefs.lowStockThreshold;
    return stock <= minStock;
  });

  if (!criticalProducts.length) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Low stock alert',
      body: criticalProducts.map((item) => `${item.name} (${item.stock ?? 0} left)`).join(', '),
    },
    trigger: null,
  });
}

export async function scheduleBackupReminder() {
  const prefs = await getNotificationPreferences();
  if (!prefs.backupReminderEnabled || prefs.backupReminderHour === undefined) {
    return;
  }

  const existingId: string | null = (await db.getSetting('notification.backupReminderId')) ?? null;
  if (existingId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    } catch (error) {
      console.warn('Failed to cancel existing backup reminder notification', error);
    }
  }

  const triggerDate = new Date();
  triggerDate.setHours(prefs.backupReminderHour);
  triggerDate.setMinutes(0);
  triggerDate.setSeconds(0);
  if (triggerDate <= new Date()) {
    triggerDate.setDate(triggerDate.getDate() + 1);
  }

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Backup reminder',
      body: 'Your POS data backup is scheduled now.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  await db.setSetting('notification.backupReminderId', identifier);
}
