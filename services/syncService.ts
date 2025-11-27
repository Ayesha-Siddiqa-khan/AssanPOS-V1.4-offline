import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/database';

const DEVICE_ID_KEY = 'pos.device.id';
const COMPANY_KEY = process.env.EXPO_PUBLIC_SUPABASE_COMPANY_KEY || 'default';
const SNAPSHOT_TABLE = process.env.EXPO_PUBLIC_SUPABASE_SNAPSHOT_TABLE || 'pos_sync_snapshots';

type DatasetShape = {
  products: any[];
  customers: any[];
  sales: any[];
  vendors: any[];
  purchases: any[];
  expenditures: any[];
  creditTransactions: any[];
  settings: Record<string, any>;
};

class CloudSyncService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;
  private readonly intervalMs: number = Number(process.env.EXPO_PUBLIC_SYNC_INTERVAL_MS || 30000);

  async start() {
    // Cloud sync disabled - Supabase is used only for authentication
    // Enable this when you're ready to set up data synchronization
    console.log('[cloud-sync] Cloud sync is disabled. Using local SQLite only.');
    return;
    
    /* Uncomment to enable cloud sync
    if (!supabase) {
      return;
    }
    if (this.timer) {
      return;
    }

    await this.syncNow();
    this.timer = setInterval(() => {
      this.syncNow().catch((error) => {
        console.warn('[cloud-sync] Periodic sync failed', error);
      });
    }, this.intervalMs);
    */
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncNow() {
    // Cloud sync disabled - Supabase is used only for authentication
    // To enable cloud sync, you need to create the pos_sync_snapshots table in Supabase
    console.log('[cloud-sync] Sync skipped - feature disabled');
    return;
  }

  // Original syncNow implementation (disabled)
  private async _syncNow_disabled() {
    if (!supabase || this.syncing) {
      return;
    }

    this.syncing = true;
    try {
      const deviceId = await getDeviceId();
      await this.pushSnapshot(deviceId);
      await this.pullSnapshot(deviceId);
    } catch (error) {
      console.warn('[cloud-sync] Sync error', error);
    } finally {
      this.syncing = false;
    }
  }

  private async pushSnapshot(deviceId: string) {
    const dataset = await exportDataset();
    const payload = {
      company_key: COMPANY_KEY,
      device_id: deviceId,
      payload: dataset,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase!
      .from(SNAPSHOT_TABLE)
      .upsert(payload, { onConflict: 'company_key' });

    if (error) {
      throw error;
    }

    await db.upsertSyncState('snapshot', {
      lastPushedAt: payload.updated_at,
    });
  }

  private async pullSnapshot(deviceId: string) {
    const { data, error } = await supabase!
      .from(SNAPSHOT_TABLE)
      .select('payload, updated_at, device_id')
      .eq('company_key', COMPANY_KEY)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return;
      }
      throw error;
    }

    const syncState = await db.getSyncState('snapshot');
    if (syncState?.lastPulledAt && data.updated_at <= syncState.lastPulledAt) {
      return;
    }

    if (data.device_id === deviceId) {
      await db.upsertSyncState('snapshot', { lastPulledAt: data.updated_at });
      return;
    }

    await importDataset(data.payload as DatasetShape);
    await db.upsertSyncState('snapshot', { lastPulledAt: data.updated_at });
  }
}

async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const installationId =
    Application.getAndroidId() ||
    Application.getIosIdForVendorAsync?.()
      ?.then((value) => value ?? undefined)
      .catch(() => undefined);

  let resolved: string | undefined;
  if (typeof installationId === 'string') {
    resolved = installationId;
  } else if (installationId instanceof Promise) {
    resolved = await installationId;
  }

  const fallback = `${Application.applicationName || 'pos-app'}-${Date.now()}`;
  const identifier = resolved || fallback;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, identifier);
  return identifier;
}

async function exportDataset(): Promise<DatasetShape> {
  const [
    products,
    customers,
    sales,
    vendors,
    purchases,
    expenditures,
    creditTransactions,
  ] = await Promise.all([
    db.getAllProducts(),
    db.getAllCustomers(),
    db.getAllSales(),
    db.getAllVendors(),
    db.getAllPurchases(),
    db.getAllExpenditures(),
    db.getAllCreditTransactions(),
  ]);

  const relevantSettingsKeys = [
    'language',
    'backup.schedule',
    'backup.lastRun',
    'notification.tokens',
    'role.permissions',
  ];

  const settingsEntries = await Promise.all(
    relevantSettingsKeys.map(async (key) => [key, await db.getSetting(key)] as const)
  );

  const settings: Record<string, any> = {};
  settingsEntries.forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      settings[key] = value;
    }
  });

  return {
    products,
    customers,
    sales,
    vendors,
    purchases,
    expenditures,
    creditTransactions,
    settings,
  };
}

async function importDataset(dataset: DatasetShape) {
  await db.runInTransaction(async (connection) => {
    await connection.execAsync('PRAGMA foreign_keys = OFF;');

    await connection.execAsync('DELETE FROM products;');
    for (const product of dataset.products) {
      await connection.runAsync(
        `
          INSERT OR REPLACE INTO products
          (id, name, category, hasVariants, variants, price, stock, minStock, barcode, unit, costPrice)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          product.id,
          product.name,
          product.category,
          product.hasVariants ? 1 : 0,
          product.variants ? JSON.stringify(product.variants) : null,
          product.price ?? null,
          product.stock ?? null,
          product.minStock ?? null,
          product.barcode || null,
          product.unit || null,
          product.costPrice ?? null,
        ]
      );
    }

    await connection.execAsync('DELETE FROM customers;');
    for (const customer of dataset.customers) {
      await connection.runAsync(
        `
          INSERT OR REPLACE INTO customers
          (id, name, phone, email, note, totalPurchases, lastPurchase, credit, dueAmount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          customer.id,
          customer.name,
          customer.phone,
          customer.email || null,
          customer.note || null,
          customer.totalPurchases || 0,
          customer.lastPurchase || null,
          customer.credit || 0,
          customer.dueAmount || 0,
        ]
      );
    }

    await connection.execAsync('DELETE FROM vendors;');
    for (const vendor of dataset.vendors) {
      await connection.runAsync(
        `
          INSERT OR REPLACE INTO vendors
          (id, name, phone, email, company, address, note, totalPurchases, lastPurchase, payable)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          vendor.id,
          vendor.name,
          vendor.phone,
          vendor.email || null,
          vendor.company || null,
          vendor.address || null,
          vendor.note || null,
          vendor.totalPurchases || 0,
          vendor.lastPurchase || null,
          vendor.payable || 0,
        ]
      );
    }

    await connection.execAsync('DELETE FROM sales;');
    for (const sale of dataset.sales) {
      await connection.runAsync(
        `
          INSERT OR REPLACE INTO sales
          (id, customer, cart, subtotal, taxRate, tax, total, creditUsed, amountAfterCredit, paidAmount, changeAmount, remainingBalance, paymentMethod, dueDate, date, time, status, items, amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          sale.id,
          sale.customer ? JSON.stringify(sale.customer) : null,
          JSON.stringify(sale.cart),
          sale.subtotal,
          sale.taxRate,
          sale.tax,
          sale.total,
          sale.creditUsed || 0,
          sale.amountAfterCredit,
          sale.paidAmount,
          sale.changeAmount || 0,
          sale.remainingBalance || 0,
          sale.paymentMethod,
          sale.dueDate || null,
          sale.date,
          sale.time,
          sale.status,
          sale.items,
          sale.amount,
        ]
      );
    }

    await connection.execAsync('DELETE FROM purchases;');
    for (const purchase of dataset.purchases) {
      await connection.runAsync(
        `
          INSERT OR REPLACE INTO purchases
          (id, vendor, items, subtotal, taxRate, tax, total, paidAmount, remainingBalance, paymentMethod, invoiceNumber, date, time, status, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          purchase.id,
          purchase.vendor ? JSON.stringify(purchase.vendor) : null,
          JSON.stringify(purchase.items),
          purchase.subtotal,
          purchase.taxRate,
          purchase.tax,
          purchase.total,
          purchase.paidAmount,
          purchase.remainingBalance || 0,
          purchase.paymentMethod,
          purchase.invoiceNumber || null,
          purchase.date,
          purchase.time,
          purchase.status,
          purchase.note || null,
        ]
      );
    }

    await connection.execAsync('DELETE FROM expenditures;');
    for (const exp of dataset.expenditures) {
      await connection.runAsync(
        `
          INSERT OR REPLACE INTO expenditures
          (id, category, amount, description, date, time)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        [exp.id, exp.category, exp.amount, exp.description, exp.date, exp.time]
      );
    }

    await connection.execAsync('DELETE FROM creditTransactions;');
    for (const credit of dataset.creditTransactions) {
      await connection.runAsync(
        `
          INSERT OR REPLACE INTO creditTransactions
          (id, customerId, customerName, customerPhone, amount, type, date, time, description, linkedSaleId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          credit.id,
          credit.customerId,
          credit.customerName,
          credit.customerPhone,
          credit.amount,
          credit.type,
          credit.date,
          credit.time,
          credit.description,
          credit.linkedSaleId || null,
        ]
      );
    }

    await connection.execAsync('DELETE FROM settings WHERE key IN ("language","backup.schedule","backup.lastRun","notification.tokens","role.permissions");');
    for (const [key, value] of Object.entries(dataset.settings || {})) {
      await connection.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, JSON.stringify(value)]
      );
    }

    await connection.execAsync('PRAGMA foreign_keys = ON;');
  });
}

export const syncService = new CloudSyncService();

export async function synchronizeNow() {
  await syncService.syncNow();
}
