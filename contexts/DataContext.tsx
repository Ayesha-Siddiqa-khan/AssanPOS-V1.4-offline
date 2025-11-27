import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import * as SQLite from 'expo-sqlite';
import { db } from '../lib/database';
import { syncService, synchronizeNow } from '../services/syncService';
import { notifyLowStock } from '../services/notificationService';
import { registerExportTask } from '../services/importExportService';
import { registerAutomatedBackups, getBackupScheduleSetting, unregisterAutomatedBackups } from '../services/backupService';

interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  imageUri?: string | null;
  credit: number;
  note?: string;
  totalPurchases: number;
  lastPurchase?: string;
  dueAmount: number;
}

interface Variant {
  id: number;
  name: string;
  design?: string;
  size?: string;
  color?: string;
  material?: string;
  price: number;
  stock: number;
  minStock: number;
  barcode?: string;
  costPrice: number;
  customAttributeLabel?: string;
  customAttributeValue?: string;
}

interface Product {
  id: number;
  name: string;
  category: string;
  hasVariants: boolean;
  variants?: Variant[];
  price?: number;
  stock?: number;
  minStock?: number;
  barcode?: string;
  unit?: string;
  costPrice?: number;
}

interface CreditTransaction {
  id: number;
  customerId: number;
  customerName: string;
  customerPhone: string;
  amount: number;
  type: 'add' | 'deduct' | 'use';
  date: string;
  time: string;
  description: string;
  linkedSaleId?: number;
}

interface Sale {
  id: number;
  customer?: any;
  date: string;
  time: string;
  amount: number;
  status: string;
  items: number;
  paymentMethod: string;
  dueDate?: string;
  paidAmount?: number;
  cart: any[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  creditUsed: number;
  amountAfterCredit: number;
  changeAmount: number;
  remainingBalance: number;
}

interface Vendor {
  id: number;
  name: string;
  phone: string;
  email?: string;
  imageUri?: string | null;
  company?: string;
  address?: string;
  note?: string;
  totalPurchases: number;
  lastPurchase?: string;
  payable: number;
}

interface Purchase {
  id: number;
  vendor?: any;
  items: any[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  paidAmount: number;
  remainingBalance: number;
  paymentMethod: string;
  invoiceNumber?: string;
  date: string;
  time: string;
  status: string;
  note?: string;
}

interface Expenditure {
  id: number;
  category: string;
  amount: number;
  description: string;
  date: string;
  time: string;
}

interface JazzCashTransaction {
  id: number;
  flow: 'send' | 'receive';
  customerName: string;
  customerPhone: string;
  customerCnic: string;
  amount: number;
  baseAmount?: number;
  profitAmount?: number;
  note?: string | null;
  createdAt: string;
}

export type JazzCashProfitMode = 'flat' | 'percent';

export interface JazzCashProfitConfig {
  mode: JazzCashProfitMode;
  value: number;
}

export interface JazzCashProfitSettings {
  send: JazzCashProfitConfig;
  receive: JazzCashProfitConfig;
}

const DEFAULT_JAZZCASH_PROFIT_SETTINGS: JazzCashProfitSettings = {
  send: { mode: 'flat', value: 0 },
  receive: { mode: 'flat', value: 0 },
};

const normalizeProfitSettings = (
  raw?: Partial<JazzCashProfitSettings> | null
): JazzCashProfitSettings => {
  const sanitize = (entry?: Partial<JazzCashProfitConfig>): JazzCashProfitConfig => {
    const mode: JazzCashProfitMode =
      entry?.mode === 'percent' || entry?.mode === 'flat' ? entry.mode : 'flat';
    const parsed = Number(entry?.value);
    return {
      mode,
      value: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    };
  };

  return {
    send: sanitize(raw?.send),
    receive: sanitize(raw?.receive),
  };
};

interface OwnerFundTransaction {
  id: number;
  type: 'add' | 'receive';
  amount: number;
  note?: string | null;
  createdAt: string;
}

const cloneProduct = (product: Product): Product => ({
  ...product,
  variants: product.variants ? product.variants.map((variant) => ({ ...variant })) : undefined,
});

const normalizeVendorRecord = (vendor: Vendor): Vendor => ({
  ...vendor,
  imageUri: vendor?.imageUri ?? null,
  totalPurchases: Number(vendor?.totalPurchases) || 0,
  payable: Number(vendor?.payable) || 0,
  lastPurchase: vendor?.lastPurchase || undefined,
});

const normalizeCustomerRecord = (customer: Customer): Customer => ({
  ...customer,
  imageUri: customer?.imageUri ?? null,
  totalPurchases: Number(customer?.totalPurchases) || 0,
  credit: Number(customer?.credit) || 0,
  dueAmount: Number(customer?.dueAmount) || 0,
  lastPurchase: customer?.lastPurchase || undefined,
});

const normalizePurchaseRecord = (purchase: Purchase): Purchase => ({
  ...purchase,
  subtotal: Number(purchase?.subtotal) || 0,
  taxRate: Number(purchase?.taxRate) || 0,
  tax: Number(purchase?.tax) || 0,
  total: Number(purchase?.total) || 0,
  paidAmount: Number(purchase?.paidAmount) || 0,
  remainingBalance: Number(purchase?.remainingBalance ?? 0) || 0,
  paymentMethod: purchase?.paymentMethod || 'Cash',
  invoiceNumber: purchase?.invoiceNumber || undefined,
  note: purchase?.note || undefined,
  items: Array.isArray(purchase?.items) ? purchase.items : [],
  date: purchase?.date || '',
  time: purchase?.time || '',
  status: purchase?.status || 'Due',
});

interface DataContextType {
  customers: Customer[];
  sales: Sale[];
  products: Product[];
  creditTransactions: CreditTransaction[];
  vendors: Vendor[];
  purchases: Purchase[];
  expenditures: Expenditure[];
  jazzCashTransactions: JazzCashTransaction[];
  ownerFundTransactions: OwnerFundTransaction[];
  jazzCashProfitSettings: JazzCashProfitSettings;
  isLoading: boolean;
  
  // Customer methods
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<void>;
  updateCustomer: (id: number, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: number) => Promise<void>;
  getCustomerById: (id: number) => Customer | undefined;
  
  // Product methods
  addProduct: (product: Omit<Product, 'id'>) => Promise<number>;
  updateProduct: (
    id: number,
    updates: Partial<Product>,
    options?: { connection?: SQLite.SQLiteDatabase | null; skipRefresh?: boolean }
  ) => Promise<void>;
  deleteProduct: (id: number) => Promise<void>;
  clearProducts: () => Promise<void>;
  getProductById: (id: number) => Product | undefined;
  updateProductStock: (
    productId: number,
    variantId: number | null,
    quantityChange: number,
    options?: { connection?: SQLite.SQLiteDatabase | null; skipRefresh?: boolean }
  ) => Promise<void>;
  
  // Sale methods
  addSale: (sale: Omit<Sale, 'id'>) => Promise<number>;
  updateSale: (id: number, updates: Partial<Sale>) => Promise<void>;
  deleteSale: (id: number) => Promise<void>;
  
  // Credit methods
  addCreditTransaction: (transaction: Omit<CreditTransaction, 'id'>) => Promise<void>;
  updateCreditTransaction: (id: number, updates: Partial<CreditTransaction>) => Promise<void>;
  deleteCreditTransaction: (id: number) => Promise<void>;
  getCustomerCreditTransactions: (customerId: number) => CreditTransaction[];
  
  // Vendor methods
  addVendor: (vendor: Omit<Vendor, 'id'>) => Promise<void>;
  updateVendor: (id: number, updates: Partial<Vendor>) => Promise<void>;
  deleteVendor: (id: number) => Promise<void>;
  getVendorById: (id: number) => Vendor | undefined;
  
  // Purchase methods
  addPurchase: (purchase: Omit<Purchase, 'id'>) => Promise<void>;
  updatePurchase: (id: number, updates: Partial<Purchase>) => Promise<void>;
  deletePurchase: (id: number) => Promise<void>;
  getVendorPurchases: (vendorId: number) => Purchase[];
  
  // Expenditure methods
  addExpenditure: (expenditure: Omit<Expenditure, 'id'>) => Promise<void>;
  updateExpenditure: (id: number, updates: Partial<Expenditure>) => Promise<void>;
  deleteExpenditure: (id: number) => Promise<void>;
  
  // Finance tracking
  addJazzCashTransaction: (transaction: Omit<JazzCashTransaction, 'id' | 'createdAt'>) => Promise<void>;
  deleteJazzCashTransaction: (id: number) => Promise<void>;
  saveJazzCashProfitSettings: (settings: JazzCashProfitSettings) => Promise<void>;
  addOwnerFundTransaction: (transaction: Omit<OwnerFundTransaction, 'id' | 'createdAt'>) => Promise<void>;
  
  // Utility methods
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [jazzCashTransactions, setJazzCashTransactions] = useState<JazzCashTransaction[]>([]);
  const [ownerFundTransactions, setOwnerFundTransactions] = useState<OwnerFundTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [jazzCashProfitSettings, setJazzCashProfitSettings] = useState<JazzCashProfitSettings>(
    DEFAULT_JAZZCASH_PROFIT_SETTINGS
  );

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasBootstrappedRef = useRef(false);

  const queueCloudSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      synchronizeNow().catch((error) => {
        console.warn('Cloud sync failed', error);
      });
    }, 2000);
  }, []);

  // Initialize data from database
  useEffect(() => {
    // Ensure database is initialized before loading data
    const initializeData = async () => {
      try {
        await db.getDB(); // Ensure database is ready
        await loadAllData();
      } catch (error) {
        console.error('Failed to initialize database:', error);
        setIsLoading(false);
      }
    };
    
    initializeData();
  }, []);

  useEffect(() => {
    syncService.start();
    registerExportTask().catch((error) => console.warn('Failed to register export task', error));
    (async () => {
      try {
        const schedule = await getBackupScheduleSetting();
        if (schedule.enabled) {
          await unregisterAutomatedBackups();
          await registerAutomatedBackups(schedule.intervalHours);
        } else {
          await unregisterAutomatedBackups();
        }
      } catch (error) {
        console.warn('Failed to configure backup scheduler', error);
      }
    })();

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncService.stop();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const stored = (await db.getSetting(
          'jazzCash.profitSettings'
        )) as Partial<JazzCashProfitSettings> | null;
        if (stored && isMounted) {
          setJazzCashProfitSettings(normalizeProfitSettings(stored));
        }
      } catch (error) {
        console.warn('Failed to load JazzCash profit settings', error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadAllData = async () => {
    let succeeded = false;
    try {
      setIsLoading(true);
      
      const [dbCustomers, dbSales, dbProducts, dbCreditTxns, dbVendors, dbPurchases, dbExpenditures, dbJazzCash, dbOwnerFunds] = await Promise.all([
        db.getAllCustomers(),
        db.getAllSales(),
        db.getAllProducts(),
        db.getAllCreditTransactions(),
        db.getAllVendors(),
        db.getAllPurchases(),
        db.getAllExpenditures(),
        db.getAllJazzCashTransactions(),
        db.getAllOwnerFundTransactions(),
      ]);
      
      const customerList = Array.isArray(dbCustomers) ? (dbCustomers as Customer[]) : [];
      setCustomers(customerList.map(normalizeCustomerRecord));
      setSales(dbSales as Sale[]);
      setProducts(dbProducts as Product[]);
      setCreditTransactions(dbCreditTxns as CreditTransaction[]);
      const vendorList = Array.isArray(dbVendors) ? (dbVendors as Vendor[]) : [];
      const purchaseList = Array.isArray(dbPurchases) ? (dbPurchases as Purchase[]) : [];
      setVendors(vendorList.map(normalizeVendorRecord));
      setPurchases(purchaseList.map(normalizePurchaseRecord));
      setExpenditures(dbExpenditures as Expenditure[]);
      setJazzCashTransactions(dbJazzCash as JazzCashTransaction[]);
      setOwnerFundTransactions(dbOwnerFunds as OwnerFundTransaction[]);

      await notifyLowStock(dbProducts as Product[]).catch((error) => {
        console.warn('Failed to dispatch low stock notification', error);
      });
      succeeded = true;
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
      if (succeeded) {
        hasBootstrappedRef.current = true;
      }
    }
  };

  const refreshData = async () => {
    try {
      console.log('[DataContext] Refreshing all data');
      await loadAllData();
      if (hasBootstrappedRef.current) {
        queueCloudSync();
      }
      console.log('[DataContext] Data refresh complete');
    } catch (error) {
      console.error('[DataContext] Error refreshing data:', error);
      // Don't throw - data refresh failure shouldn't crash the app
    }
  };

  // Customer methods
  const addCustomer = async (customer: Omit<Customer, 'id'>) => {
    const id = await db.addCustomer(customer);
    await refreshData();
  };

  const updateCustomer = async (id: number, updates: Partial<Customer>) => {
    const customer = customers.find(c => c.id === id);
    if (customer) {
      await db.updateCustomer({ ...customer, ...updates });
      await refreshData();
    }
  };

  const deleteCustomer = async (id: number) => {
    await db.deleteCustomer(id);
    await refreshData();
  };

  const getCustomerById = (id: number) => {
    return customers.find(c => c.id === id);
  };

  // Product methods
  const addProduct = async (product: Omit<Product, 'id'>) => {
    const id = await db.addProduct(product);
    await refreshData();
    return id;
  };

  const updateProduct = async (
    id: number,
    updates: Partial<Product>,
    options?: { connection?: SQLite.SQLiteDatabase | null; skipRefresh?: boolean }
  ) => {
    const product = products.find(p => p.id === id);
    if (product) {
      const payload = { ...product, ...updates };
      await db.updateProduct(payload, { connection: options?.connection ?? undefined });
      if (!options?.skipRefresh) {
        await refreshData();
      }
    }
  };

  const deleteProduct = async (id: number) => {
    await db.deleteProduct(id);
    await refreshData();
  };

  const clearProducts = async () => {
    for (const product of products) {
      await db.deleteProduct(product.id);
    }
    await refreshData();
  };

  const getProductById = (id: number) => {
    return products.find(p => p.id === id);
  };

  const updateProductStock = async (
    productId: number,
    variantId: number | null,
    quantityChange: number,
    options?: { connection?: SQLite.SQLiteDatabase | null; skipRefresh?: boolean }
  ) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (product.hasVariants && variantId && product.variants) {
      const updatedVariants = product.variants.map(v =>
        v.id === variantId ? { ...v, stock: v.stock + quantityChange } : v
      );
      await updateProduct(productId, { variants: updatedVariants }, options);
    } else {
      const newStock = (product.stock || 0) + quantityChange;
      await updateProduct(productId, { stock: newStock }, options);
    }
  };

  // Sale methods
  const addSale = async (sale: Omit<Sale, 'id'>) => {
    try {
      console.log('[addSale] Starting sale transaction', { cartItems: sale.cart.length });
      
      const productCache = new Map<number, Product>();

      const getProductSnapshot = (productId: number): Product | null => {
        if (productCache.has(productId)) {
          return productCache.get(productId)!;
        }
        const product = products.find((p) => p.id === productId);
        if (!product) {
          console.warn('[addSale] Product not found in database - likely a custom/temporary product', { productId });
          return null; // This is OK - custom products don't need stock updates
        }
        const snapshot = cloneProduct(product);
        productCache.set(productId, snapshot);
        return snapshot;
      };

      const saleId = await db.runInTransaction(async (connection) => {
        console.log('[addSale] Creating sale record');
        const newSaleId = await db.addSale(sale, { connection });
        console.log('[addSale] Sale created with ID:', newSaleId);

        // Update product stock (only for products that exist in database)
        for (const item of sale.cart) {
          console.log('[addSale] Processing item:', { productId: item.productId, variantId: item.variantId, quantity: item.quantity, name: item.name });
          
          const productSnapshot = getProductSnapshot(item.productId);
          if (!productSnapshot) {
            console.log('[addSale] Skipping stock update - product not in database (custom product)');
            continue; // Skip stock update for custom/temporary products
          }

          try {
            if (productSnapshot.hasVariants && item.variantId && productSnapshot.variants) {
              const variant = productSnapshot.variants.find((v) => v.id === item.variantId);
              if (variant) {
                const oldStock = variant.stock || 0;
                variant.stock = Math.max(0, oldStock - item.quantity);
                console.log('[addSale] Updated variant stock', { variantId: item.variantId, oldStock, newStock: variant.stock });
              } else {
                console.warn('[addSale] Variant not found', {
                  productId: item.productId,
                  variantId: item.variantId,
                });
              }
            } else {
              const oldStock = productSnapshot.stock || 0;
              productSnapshot.stock = Math.max(0, oldStock - item.quantity);
              console.log('[addSale] Updated product stock', { productId: item.productId, oldStock, newStock: productSnapshot.stock });
            }

            console.log('[addSale] Saving product update to database');
            await db.updateProduct(productSnapshot, { connection });
            console.log('[addSale] Product updated successfully');
          } catch (error) {
            console.error('[addSale] Failed to update product:', error, { productId: item.productId });
            throw error; // Re-throw to rollback transaction
          }
        }

        // Update customer if applicable
        if (sale.customer && sale.customer.id) {
          console.log('[addSale] Updating customer', { customerId: sale.customer.id });
          const customer = customers.find((c) => c.id === sale.customer!.id);
          if (customer) {
            try {
              // Validate customer has required fields
              if (!customer.name) {
                console.error('[addSale] Customer missing name field');
                throw new Error('Customer missing required name field');
              }
              
              const updatedCustomer = {
                ...customer,
                name: customer.name,
                phone: customer.phone || '',
                email: customer.email || null,
                note: customer.note || null,
                totalPurchases: (customer.totalPurchases || 0) + sale.total,
                lastPurchase: sale.date,
                credit: Math.max(0, (customer.credit || 0) - (sale.creditUsed || 0)),
                dueAmount: (customer.dueAmount || 0) + (sale.remainingBalance || 0),
              };
              console.log('[addSale] Customer update data:', {
                id: updatedCustomer.id,
                totalPurchases: updatedCustomer.totalPurchases,
                credit: updatedCustomer.credit,
                dueAmount: updatedCustomer.dueAmount,
              });
              await db.updateCustomer(updatedCustomer, { connection });
              console.log('[addSale] Customer updated successfully');
            } catch (error) {
              console.error('[addSale] Failed to update customer:', error);
              throw error; // Re-throw to rollback transaction
            }
          } else {
            console.warn('[addSale] Customer not found in local state:', sale.customer.id);
          }
        }

        // Add credit transaction if applicable
        if (sale.creditUsed > 0 && sale.customer && sale.customer.id) {
          console.log('[addSale] Adding credit transaction');
          try {
            await db.addCreditTransaction(
              {
                customerId: sale.customer.id,
                customerName: sale.customer.name || '',
                customerPhone: sale.customer.phone || '',
                amount: sale.creditUsed,
                type: 'use',
                date: sale.date,
                time: sale.time,
                description: 'Credit used for sale',
                linkedSaleId: newSaleId,
              },
              { connection }
            );
            console.log('[addSale] Credit transaction added successfully');
          } catch (error) {
            console.error('[addSale] Failed to add credit transaction:', error);
            throw error; // Re-throw to rollback transaction
          }
        }

        console.log('[addSale] Transaction completed successfully');
        return newSaleId;
      });

      console.log('[addSale] Refreshing data');
      await refreshData();
      console.log('[addSale] Sale completed successfully');
      return saleId;
    } catch (error) {
      console.error('[addSale] Error completing sale:', error);
      throw error;
    }
  };

  const updateSale = async (id: number, updates: Partial<Sale>) => {
    const sale = sales.find(s => s.id === id);
    if (sale) {
      await db.updateSale({ ...sale, ...updates });
      await refreshData();
    }
  };

  const deleteSale = async (id: number) => {
    const sale = sales.find((s) => s.id === id);
    if (!sale) return;

    const productCache = new Map<number, Product>();

    const getProductSnapshot = (productId: number): Product | null => {
      if (productCache.has(productId)) {
        return productCache.get(productId)!;
      }
      const product = products.find((p) => p.id === productId);
      if (!product) {
        console.warn('Product not found while deleting sale', { productId });
        return null;
      }
      const snapshot = cloneProduct(product);
      productCache.set(productId, snapshot);
      return snapshot;
    };

    await db.runInTransaction(async (connection) => {
      for (const item of sale.cart) {
        const productSnapshot = getProductSnapshot(item.productId);
        if (!productSnapshot) {
          continue;
        }

        if (productSnapshot.hasVariants && item.variantId && productSnapshot.variants) {
          const variant = productSnapshot.variants.find((v) => v.id === item.variantId);
          if (variant) {
            variant.stock = (variant.stock || 0) + item.quantity;
          } else {
            console.warn('Variant not found while deleting sale', {
              productId: item.productId,
              variantId: item.variantId,
            });
          }
        } else {
          productSnapshot.stock = (productSnapshot.stock || 0) + item.quantity;
        }

        await db.updateProduct(productSnapshot, { connection });
      }

      if (sale.customer) {
        const customer = customers.find((c) => c.id === sale.customer!.id);
        if (customer) {
          const updatedCustomer = {
            ...customer,
            totalPurchases: Math.max(0, customer.totalPurchases - sale.total),
            credit: customer.credit + sale.creditUsed,
            dueAmount: Math.max(0, customer.dueAmount - (sale.remainingBalance || 0)),
          };
          await db.updateCustomer(updatedCustomer, { connection });
        }

        const linkedTx = creditTransactions.find(
          (tx) => tx.linkedSaleId === id && tx.type === 'use'
        );
        if (linkedTx) {
          await db.deleteCreditTransaction(linkedTx.id, { connection });
        }
      }

      await db.deleteSale(id, { connection });
    });

    await refreshData();
  };

  // Credit methods
  const addCreditTransaction = async (transaction: Omit<CreditTransaction, 'id'>) => {
    await db.runInTransaction(async (connection) => {
      await db.addCreditTransaction(transaction, { connection });

      const customer = customers.find((c) => c.id === transaction.customerId);
      if (customer) {
        let newCredit = customer.credit;
        if (transaction.type === 'add') {
          newCredit += transaction.amount;
        } else if (transaction.type === 'deduct') {
          newCredit = Math.max(0, newCredit - transaction.amount);
        }
        const updatedCustomer = { ...customer, credit: newCredit };
        await db.updateCustomer(updatedCustomer, { connection });
      }
    });

    await refreshData();
  };

  const updateCreditTransaction = async (id: number, updates: Partial<CreditTransaction>) => {
    const transaction = creditTransactions.find(t => t.id === id);
    if (transaction) {
      await db.updateCreditTransaction({ ...transaction, ...updates });
      await refreshData();
    }
  };

  const deleteCreditTransaction = async (id: number) => {
    const transaction = creditTransactions.find(t => t.id === id);
    if (!transaction) return;

    await db.runInTransaction(async (connection) => {
      const customer = customers.find((c) => c.id === transaction.customerId);
      if (customer) {
        let newCredit = customer.credit;
        if (transaction.type === 'add') {
          newCredit = Math.max(0, newCredit - transaction.amount);
        } else if (transaction.type === 'deduct') {
          newCredit += transaction.amount;
        }
        const updatedCustomer = { ...customer, credit: newCredit };
        await db.updateCustomer(updatedCustomer, { connection });
      }

      await db.deleteCreditTransaction(id, { connection });
    });

    await refreshData();
  };

  const getCustomerCreditTransactions = (customerId: number) => {
    return creditTransactions.filter(t => t.customerId === customerId);
  };

  // Vendor methods
  const addVendor = async (vendor: Omit<Vendor, 'id'>) => {
    await db.addVendor(vendor);
    await refreshData();
  };

  const updateVendor = async (id: number, updates: Partial<Vendor>) => {
    const vendor = vendors.find(v => v.id === id);
    if (vendor) {
      await db.updateVendor({ ...vendor, ...updates });
      await refreshData();
    }
  };

  const deleteVendor = async (id: number) => {
    await db.deleteVendor(id);
    await refreshData();
  };

  const getVendorById = (id: number) => {
    return vendors.find(v => v.id === id);
  };

  // Purchase methods
  const addPurchase = async (purchase: Omit<Purchase, 'id'>) => {
    const productCache = new Map<number, Product>();

    const getProductSnapshot = (productId: number): Product | null => {
      if (productCache.has(productId)) {
        return productCache.get(productId)!;
      }
      const product = products.find((p) => p.id === productId);
      if (!product) {
        console.warn('Product not found while adding purchase', { productId });
        return null;
      }
      const snapshot = cloneProduct(product);
      productCache.set(productId, snapshot);
      return snapshot;
    };

    await db.runInTransaction(async (connection) => {
      await db.addPurchase(purchase, { connection });

      for (const item of purchase.items) {
        const productSnapshot = getProductSnapshot(item.productId);
        if (!productSnapshot) {
          continue;
        }

        if (productSnapshot.hasVariants && item.variantId && productSnapshot.variants) {
          const variant = productSnapshot.variants.find((v) => v.id === item.variantId);
          if (variant) {
            variant.stock = (variant.stock || 0) + item.quantity;
          } else {
            console.warn('Variant not found while adding purchase', {
              productId: item.productId,
              variantId: item.variantId,
            });
          }
        } else {
          productSnapshot.stock = (productSnapshot.stock || 0) + item.quantity;
        }

        await db.updateProduct(productSnapshot, { connection });
      }

      if (purchase.vendor) {
        const vendor = vendors.find((v) => v.id === purchase.vendor!.id);
        if (vendor) {
          const vendorTotalPurchases = Number(vendor.totalPurchases) || 0;
          const vendorPayable = Number(vendor.payable) || 0;
          const updatedVendor = {
            ...vendor,
            totalPurchases: vendorTotalPurchases + purchase.total,
            lastPurchase: purchase.date,
            payable: vendorPayable + (purchase.remainingBalance || 0),
          };
          await db.updateVendor(updatedVendor, { connection });
        }
      }
    });

    await refreshData();
  };

  const updatePurchase = async (id: number, updates: Partial<Purchase>) => {
    const purchase = purchases.find(p => p.id === id);
    if (purchase) {
      await db.updatePurchase({ ...purchase, ...updates });
      await refreshData();
    }
  };

  const deletePurchase = async (id: number) => {
    await db.deletePurchase(id);
    await refreshData();
  };

  const getVendorPurchases = (vendorId: number) => {
    return purchases.filter(p => p.vendor && p.vendor.id === vendorId);
  };

  // Expenditure methods
  const addExpenditure = async (expenditure: Omit<Expenditure, 'id'>) => {
    await db.addExpenditure(expenditure);
    await refreshData();
  };

  const updateExpenditure = async (id: number, updates: Partial<Expenditure>) => {
    const expenditure = expenditures.find(e => e.id === id);
    if (expenditure) {
      await db.updateExpenditure({ ...expenditure, ...updates });
      await refreshData();
    }
  };

  const deleteExpenditure = async (id: number) => {
    await db.deleteExpenditure(id);
    await refreshData();
  };

  const addJazzCashTransaction = async (transaction: Omit<JazzCashTransaction, 'id' | 'createdAt'>) => {
    await db.addJazzCashTransaction({
      ...transaction,
      amount: Number(transaction.amount) || 0,
      baseAmount:
        transaction.baseAmount !== undefined
          ? Number(transaction.baseAmount) || 0
          : Number(transaction.amount) || 0,
      profitAmount: Number(transaction.profitAmount) || 0,
      createdAt: new Date().toISOString(),
    });
    await refreshData();
  };
  const deleteJazzCashTransaction = async (id: number) => {
    await db.deleteJazzCashTransaction(id);
    await refreshData();
  };

  const saveJazzCashProfitSettings = useCallback(async (settings: JazzCashProfitSettings) => {
    const normalized = normalizeProfitSettings(settings);
    setJazzCashProfitSettings(normalized);
    try {
      await db.setSetting('jazzCash.profitSettings', normalized);
    } catch (error) {
      console.warn('Failed to save JazzCash profit settings', error);
      throw error;
    }
  }, []);

  const addOwnerFundTransaction = async (transaction: Omit<OwnerFundTransaction, 'id' | 'createdAt'>) => {
    await db.addOwnerFundTransaction({
      ...transaction,
      amount: Number(transaction.amount) || 0,
      createdAt: new Date().toISOString(),
    });
    await refreshData();
  };

  const value: DataContextType = {
    customers,
    sales,
    products,
    creditTransactions,
    vendors,
    purchases,
    expenditures,
    jazzCashTransactions,
    ownerFundTransactions,
    jazzCashProfitSettings,
    isLoading,
    
    addCustomer,
    updateCustomer,
    deleteCustomer,
    getCustomerById,
    
    addProduct,
    updateProduct,
    deleteProduct,
    clearProducts,
    getProductById,
    updateProductStock,
    
    addSale,
    updateSale,
    deleteSale,
    
    addCreditTransaction,
    updateCreditTransaction,
    deleteCreditTransaction,
    getCustomerCreditTransactions,
    
    addVendor,
    updateVendor,
    deleteVendor,
    getVendorById,
    
    addPurchase,
    updatePurchase,
    deletePurchase,
    getVendorPurchases,
    
    addExpenditure,
    updateExpenditure,
    deleteExpenditure,
    addJazzCashTransaction,
    deleteJazzCashTransaction,
    saveJazzCashProfitSettings,
    addOwnerFundTransaction,
    
    refreshData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
