import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

interface VariantAttribute {
  label: string;
  value: string;
}

interface PosCartItem {
  productId: number;
  variantId?: number | null;
  name: string;
  variantName?: string;
  variantAttributes?: VariantAttribute[];
  price: number;
  costPrice?: number;
  quantity: number;
}

interface PosContextValue {
  cart: PosCartItem[];
  selectedCustomerId: number | null;
  walkInCustomerName: string;
  discount: number;
  taxRate: number;
  quickPaymentEnabled: boolean;
  setSelectedCustomerId: (id: number | null) => void;
  setWalkInCustomerName: (name: string) => void;
  setDiscount: (value: number) => void;
  setTaxRate: (value: number) => void;
  setQuickPaymentEnabled: (value: boolean) => void;
  addItem: (item: Omit<PosCartItem, 'quantity'>, quantity?: number) => void;
  updateQuantity: (productId: number, variantId: number | null, quantity: number) => void;
  removeItem: (productId: number, variantId: number | null) => void;
  resetSale: () => void;
}

const PosContext = createContext<PosContextValue | undefined>(undefined);

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [walkInCustomerName, setWalkInCustomerName] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [quickPaymentEnabled, setQuickPaymentEnabled] = useState<boolean>(true);

  const addItem = useCallback(
    (item: Omit<PosCartItem, 'quantity'>, quantity = 1) => {
      if (quantity <= 0) {
        return;
      }

      // Validate price is a valid number
      const safePrice = typeof item.price === 'number' && Number.isFinite(item.price) ? item.price : 0;
      const safeCostPrice = typeof item.costPrice === 'number' && Number.isFinite(item.costPrice) ? item.costPrice : 0;
      
      if (safePrice <= 0) {
        console.warn('[PosContext] Cannot add item with invalid price:', item.name);
        return;
      }

      setCart((prev) => {
        const variantKey = item.variantId ?? null;
        const existingIndex = prev.findIndex(
          (cartItem) =>
            cartItem.productId === item.productId &&
            (cartItem.variantId ?? null) === variantKey
        );

        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + quantity,
            price: safePrice,
            costPrice: safeCostPrice,
            variantAttributes: item.variantAttributes ?? updated[existingIndex].variantAttributes,
          };
          return updated;
        }

        return [...prev, { 
          ...item, 
          variantId: variantKey, 
          quantity,
          price: safePrice,
          costPrice: safeCostPrice,
        }];
      });
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: number, variantId: number | null, quantity: number) => {
      setCart((prev) => {
        const matchIndex = prev.findIndex(
          (item) =>
            item.productId === productId &&
            (item.variantId ?? null) === (variantId ?? null)
        );

        if (matchIndex === -1) {
          return prev;
        }

        if (quantity <= 0) {
          return prev.filter((_, index) => index !== matchIndex);
        }

        const updated = [...prev];
        updated[matchIndex] = { ...updated[matchIndex], quantity };
        return updated;
      });
    },
    []
  );

  const removeItem = useCallback((productId: number, variantId: number | null) => {
    setCart((prev) =>
      prev.filter(
        (item) =>
          item.productId !== productId ||
          (item.variantId ?? null) !== (variantId ?? null)
      )
    );
  }, []);

  const resetSale = useCallback(() => {
    try {
      console.log('[PosContext] Resetting sale state');
      setCart([]);
      setSelectedCustomerId(null);
      setWalkInCustomerName('');
      setDiscount(0);
      setTaxRate(0);
      setQuickPaymentEnabled(true);
      console.log('[PosContext] Sale state reset complete');
    } catch (error) {
      console.error('[PosContext] Error resetting sale:', error);
      // Force reset even if error occurs
      setCart([]);
      setSelectedCustomerId(null);
      setWalkInCustomerName('');
      setDiscount(0);
      setTaxRate(0);
      setQuickPaymentEnabled(true);
    }
  }, []);

  const value = useMemo<PosContextValue>(
    () => ({
      cart,
      selectedCustomerId,
      walkInCustomerName,
      discount,
      taxRate,
      quickPaymentEnabled,
      setSelectedCustomerId,
      setWalkInCustomerName,
      setDiscount,
      setTaxRate,
      setQuickPaymentEnabled,
      addItem,
      updateQuantity,
      removeItem,
      resetSale,
    }),
    [
      cart,
      selectedCustomerId,
      walkInCustomerName,
      discount,
      taxRate,
      quickPaymentEnabled,
      addItem,
      updateQuantity,
      removeItem,
      resetSale,
    ]
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
};

export const usePos = () => {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error('usePos must be used within a PosProvider');
  }
  return context;
};

export type { PosCartItem };
