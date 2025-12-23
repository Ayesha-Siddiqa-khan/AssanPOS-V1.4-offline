import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { useData } from '../../contexts/DataContext';
import { usePos } from '../../contexts/PosContext';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';

const PAYMENT_OPTIONS = [
  { label: 'Cash', value: 'Cash' },
  { label: 'Online', value: 'Online' },
  { label: 'Customer Credit', value: 'Customer Credit' },
];

export default function PaymentModal() {
  const router = useRouter();
  const { t } = useLanguage();
  const { customers, addSale } = useData();
  const {
    cart,
    discount,
    taxRate,
    selectedCustomerId,
    setSelectedCustomerId,
    walkInCustomerName,
    setWalkInCustomerName,
    resetSale,
  } = usePos();

  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountPaidInput, setAmountPaidInput] = useState('');
  const [amountReceivedInput, setAmountReceivedInput] = useState('');
  const [creditUsedInput, setCreditUsedInput] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountReceivedRef = useRef<TextInput>(null);
  const creditUsedRef = useRef<TextInput>(null);

  const filteredCustomers = useMemo(
    () =>
      customers.map((customer) => ({
        label: `${customer.name} (${customer.phone})`,
        value: customer.id.toString(),
      })),
    [customers]
  );

  const selectedCustomer = selectedCustomerId
    ? customers.find((customer) => customer.id === selectedCustomerId)
    : undefined;

  const subtotal = useMemo(
    () =>
      cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0),
    [cart]
  );

  const discountAmount = Math.min(discount, subtotal);
  const taxableAmount = Math.max(subtotal - discountAmount, 0);
  const taxAmount = Number(((taxableAmount * taxRate) / 100).toFixed(2));
  const totalDue = taxableAmount + taxAmount;

  useEffect(() => {
    setAmountPaidInput(totalDue.toString());
  }, [totalDue]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCreditUsedInput('');
    }
  }, [selectedCustomer]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedCustomer && selectedCustomer.credit > 0) {
        creditUsedRef.current?.focus();
      } else {
        amountReceivedRef.current?.focus();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedCustomer]);

  const parsedAmountPaid = useMemo(() => {
    const normalized = amountPaidInput.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [amountPaidInput]);

  const parsedAmountReceived = useMemo(() => {
    const normalized = amountReceivedInput.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [amountReceivedInput]);

  const parsedCreditUsed = useMemo(() => {
    const normalized = creditUsedInput.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [creditUsedInput]);

  const maxCustomerCredit =
    selectedCustomer ? Math.max(selectedCustomer.credit, 0) : 0;
  const allowableCredit = Math.min(maxCustomerCredit, totalDue);
  const creditUsed = Math.min(parsedCreditUsed, allowableCredit);

  const amountAfterCredit = Math.max(totalDue - creditUsed, 0);
  const hasAmountReceivedInput = amountReceivedInput.trim().length > 0;
  const cashReceived = hasAmountReceivedInput ? Math.max(parsedAmountReceived, 0) : 0;
  const appliedTender = Math.min(cashReceived, amountAfterCredit);
  const changeAmount = Math.max(cashReceived - amountAfterCredit, 0);
  const remainingBalance = Math.max(amountAfterCredit - appliedTender, 0);

  const summaryAmountPaid = Math.max(parsedAmountPaid, 0);
  const summaryAmountReceived = hasAmountReceivedInput
    ? Math.max(parsedAmountReceived, 0)
    : creditUsed;
  const summaryDifference = summaryAmountReceived - summaryAmountPaid;
  const summaryDueAmount = Math.max(-summaryDifference, 0);
  const summaryReturnChange = Math.max(summaryDifference, 0);

  const itemsCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      Toast.show({ type: 'error', text1: t('Select at least one item') });
      return;
    }

    if (creditUsed > 0 && !selectedCustomer) {
      Toast.show({ type: 'error', text1: t('Please select a customer first') });
      return;
    }

    if (creditUsed > allowableCredit + 0.01) {
      Toast.show({ type: 'error', text1: t('Insufficient credit available') });
      return;
    }

    let normalizedDueDate: string | undefined;
    if (dueDate.trim()) {
      const sanitized = dueDate.trim().replace(/[./]/g, '-');
      const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(sanitized);
      if (!match) {
        Toast.show({ type: 'error', text1: t('Enter due date in DD-MM-YYYY format') });
        return;
      }
      const [, day, month, year] = match;
      const isoCandidate = `${year}-${month}-${day}`;
      const parsed = new Date(isoCandidate);
      if (Number.isNaN(parsed.getTime())) {
        Toast.show({ type: 'error', text1: t('Enter a valid due date') });
        return;
      }
      normalizedDueDate = isoCandidate;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 8);
      const amountReceivedValue = parsedAmountReceived;
      const walkInName = walkInCustomerName.trim();
      const customerPayload = selectedCustomer
        ? {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
          }
        : walkInName
        ? {
            name: walkInName,
            type: 'walk-in',
          }
        : undefined;

      const hasCreditOnly = creditUsed > 0 && appliedTender <= 0;
      const normalizedPaymentMethod = hasCreditOnly ? 'Customer Credit' : paymentMethod;

      const saleId = await addSale({
        customer: customerPayload,
        cart: cart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          name: item.name,
          variantName: item.variantName,
          variantAttributes: item.variantAttributes ?? null,
          price: item.price,
          costPrice: item.costPrice,
          quantity: item.quantity,
        })),
        subtotal,
        taxRate,
        tax: taxAmount,
        total: totalDue,
        creditUsed,
        amountAfterCredit,
        paidAmount: appliedTender,
        changeAmount,
        remainingBalance,
        paymentMethod: normalizedPaymentMethod,
        dueDate: normalizedDueDate,
        date,
        time,
        status:
          remainingBalance === 0
            ? 'Paid'
            : appliedTender > 0
            ? 'Partially Paid'
            : 'Due',
        items: itemsCount,
        amount: totalDue,
      });

      resetSale();
      setTimeout(() => {
        router.replace({
          pathname: '/modals/sale-success',
          params: {
            saleId: saleId.toString(),
            amountReceived: amountReceivedValue.toString(),
            amountPaidDisplay: summaryAmountPaid.toString(),
          },
        });
      }, 50);
    } catch (error) {
      console.error('Error completing sale', error);
      Toast.show({ type: 'error', text1: t('Something went wrong') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCart = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('Payment')}</Text>

        <View style={[styles.section, styles.cartSection]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Cart Summary')}</Text>
            <TouchableOpacity style={styles.linkButton} onPress={handleEditCart}>
              <Ionicons name="create-outline" size={16} color="#2563eb" />
              <Text style={styles.linkButtonText}>{t('Edit Cart')}</Text>
            </TouchableOpacity>
          </View>

          {cart.map((item) => (
            <View
              key={`${item.productId}-${item.variantId ?? 'base'}`}
              style={styles.cartRow}
            >
              <View>
                <Text style={styles.cartName}>
                  {item.name}
                  {item.variantName ? ` • ${item.variantName}` : ''}
                </Text>
                <Text style={styles.cartLine}>
                  {item.quantity} × Rs. {item.price.toLocaleString()} →{' '}
                  <Text style={styles.cartLineTotal}>
                    Rs. {((item.price || 0) * item.quantity).toLocaleString()}
                  </Text>
                </Text>
              </View>
            </View>
          ))}

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('Subtotal')}</Text>
              <Text style={styles.totalValue}>Rs. {subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('Discount')}</Text>
              <Text style={styles.totalValue}>Rs. {discountAmount.toLocaleString()}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('Tax')}</Text>
              <Text style={styles.totalValue}>Rs. {taxAmount.toLocaleString()}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, styles.totalDueLabel]}>
                {t('Total Due')}
              </Text>
              <Text style={[styles.totalValue, styles.totalDueLabel]}>
                Rs. {totalDue.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Customer')}</Text>
          </View>
          <Select
            value={selectedCustomerId ? selectedCustomerId.toString() : ''}
            onValueChange={(value) => {
              if (!value) {
                setSelectedCustomerId(null);
                return;
              }
              setSelectedCustomerId(Number(value));
              setWalkInCustomerName('');
            }}
            options={filteredCustomers}
            placeholder={t('Select Customer')}
          />
          <Text style={styles.helperText}>
            {t('Choose a saved customer, or leave empty for walk-in.')}
          </Text>
          <Input
            label={t('Walk-in Customer Name (optional)')}
            value={walkInCustomerName}
            onChangeText={setWalkInCustomerName}
            placeholder={t('Enter name')}
          />
          {selectedCustomer ? (
            <Text style={styles.customerInfo}>
              {t('Credit Available')}: Rs. {selectedCustomer.credit.toLocaleString()}
            </Text>
          ) : (
            <Text style={styles.helperText}>
              {t('Walk-in customers are not saved to the customer list.')}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Payment Method')}</Text>
            <Ionicons name="information-circle-outline" size={18} color="#94a3b8" />
          </View>
          <Select
            value={paymentMethod}
            onValueChange={(value) => {
              if (value) {
                setPaymentMethod(value);
              }
            }}
            options={PAYMENT_OPTIONS}
          />
          <Text style={styles.subSectionLabel}>{t('Amounts')}</Text>
          <Input
            label={t('Amount Paid')}
            value={amountPaidInput}
            keyboardType="numeric"
            onChangeText={setAmountPaidInput}
            placeholder="0"
          />
          <View>
            <View style={styles.inputWithButton}>
              <Text style={styles.inputLabel}>{t('Amount Received (Rs.)')}</Text>
              {amountPaidInput ? (
                <TouchableOpacity
                  style={styles.quickFillButton}
                  onPress={() => setAmountReceivedInput(amountPaidInput)}
                >
                  <Text style={styles.quickFillText}>Rs. {amountPaidInput}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Input
              ref={amountReceivedRef}
              value={amountReceivedInput}
              keyboardType="numeric"
              onChangeText={setAmountReceivedInput}
              placeholder="0"
            />
            <Text style={styles.helperText}>
              {t('Tap the suggested amount to auto-fill.')}
            </Text>
          </View>
          <View>
            <View style={styles.inputWithButton}>
              <Text style={styles.inputLabel}>{t('Credit Used')}</Text>
              {allowableCredit > 0 ? (
                <TouchableOpacity
                  style={styles.quickFillButton}
                  onPress={() => setCreditUsedInput(allowableCredit.toString())}
                >
                  <Text style={styles.quickFillText}>Rs. {allowableCredit}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Input
              ref={creditUsedRef}
              value={creditUsedInput}
              keyboardType="numeric"
              onChangeText={setCreditUsedInput}
              editable={!!selectedCustomer}
              placeholder={allowableCredit > 0 ? allowableCredit.toString() : '0'}
            />
          </View>
          <View style={styles.inputWithButton}>
            <Text style={styles.inputLabel}>{t('Due Date (optional)')}</Text>
            <Ionicons name="calendar-outline" size={16} color="#94a3b8" />
          </View>
          <Input
            value={dueDate}
            placeholder="DD-MM-YYYY"
            onChangeText={setDueDate}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Remaining Balance')}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Amount Received')}</Text>
            <Text style={styles.summaryValue}>
              Rs. {summaryAmountReceived.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Amount Paid')}</Text>
            <Text style={styles.summaryValue}>
              Rs. {summaryAmountPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Credit Used')}</Text>
            <Text style={styles.summaryValue}>
              Rs. {creditUsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text
              style={[
                styles.summaryLabel,
                remainingBalance > 0 && styles.duePendingLabel,
              ]}
            >
              {t('Due Amount')}
            </Text>
            <Text
              style={[
                styles.summaryValue,
                remainingBalance > 0 && styles.duePendingValue,
              ]}
            >
              Rs. {summaryDueAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('Return Change')}</Text>
            <Text
              style={[
                styles.summaryValue,
                summaryReturnChange > 0 && styles.changePositive,
              ]}
            >
              Rs. {summaryReturnChange.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        <View style={styles.footerActions}>
          <Button
            onPress={handleCompleteSale}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={styles.submitButton}
          >
            {t('Complete Sale')}
          </Button>
          <Button
            variant="outline"
            onPress={() => router.back()}
            style={styles.cancelButton}
          >
            {t('Cancel')}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  cartSection: {
    backgroundColor: '#f8fafc',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  subSectionLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563eb',
  },
  cartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cartName: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  cartLine: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  cartLineTotal: {
    fontWeight: '700',
    color: '#2563eb',
  },
  totals: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  totalDueLabel: {
    color: '#2563eb',
    fontWeight: '700',
  },
  customerInfo: {
    fontSize: 13,
    color: '#0f766e',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
  },
  inputWithButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  quickFillButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
    backgroundColor: '#eef2ff',
  },
  quickFillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#4b5563',
  },
  duePendingLabel: {
    color: '#ef4444',
    fontWeight: '700',
  },
  duePendingValue: {
    color: '#ef4444',
    fontWeight: '700',
  },
  changePositive: {
    color: '#16a34a',
    fontWeight: '700',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  footerActions: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16,
    gap: 8,
  },
  submitButton: {
    marginTop: 12,
  },
  cancelButton: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
});
