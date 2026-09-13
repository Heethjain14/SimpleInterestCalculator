import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, Modal,
} from 'react-native';
import { Loan, Payment, PaymentMode } from '../types';
import DatePicker from './DatePicker';
import { getAmountDue } from '../utils/duePayments';

interface Props {
  loan: Loan;
  visible: boolean;
  /** When set, records this specific installment instead of the next unpaid one. */
  paymentId?: string;
  onSave: (payment: Payment) => void;
  onCancel: () => void;
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_MODES: PaymentMode[] = ['Cash', 'UPI', 'Bank Transfer', 'Cheque','RTGS'];

/** Bottom-sheet modal to record an installment payment, including delay interest. */
export default function PaymentRecorder({ loan, visible, paymentId, onSave, onCancel }: Props) {
  const targetPayment = loan.payments
    ? (paymentId
      ? loan.payments.find(p => p.id === paymentId)
      : loan.payments.find(p => getAmountDue(p) > 0))
    : null;
  const [paidDate, setPaidDate] = useState<Date | null>(new Date());
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');

  const handleQuickAmount = (percentage: number) => {
    if (!targetPayment) return;
    const amount = getAmountDue(targetPayment) * percentage;
    setPaidAmount(amount.toFixed(2));
  };

  const handleSave = () => {
    if (!targetPayment) {
      Alert.alert('No pending payment', 'All payments for this loan are complete.');
      onCancel();
      return;
    }

    if (!paidDate || !paidAmount.trim()) {
      Alert.alert('Error', 'Please enter payment date and amount');
      return;
    }

    const amt = parseFloat(paidAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Error', 'Payment amount must be positive');
      return;
    }

    const dueTotal = getAmountDue(targetPayment);
    if (amt > dueTotal) {
      Alert.alert('Error', `Payment cannot exceed the due amount of ₹${formatCurrency(dueTotal)}.`);
      return;
    }

    const dueDate = new Date(targetPayment.dueDate);
    const paidDateObj = new Date(paidDate);
    const delayMs = paidDateObj.getTime() - dueDate.getTime();
    const delayDays = Math.max(0, Math.ceil(delayMs / (1000 * 60 * 60 * 24)));

    const dailyRate = (loan.interestRate / 100) / 30;
    const delayInterest = dueTotal * dailyRate * delayDays;
    const remainingAmount = Math.max(0, dueTotal - amt);

    if (amt < dueTotal) {
      Alert.alert(
        'Partial payment recorded',
        `₹${formatCurrency(amt)} was recorded. Remaining due is ₹${formatCurrency(remainingAmount)}.`
      );
    }

    const updatedPayment: Payment = {
      ...targetPayment,
      paidDate: paidDate.toISOString(),
      paidAmount: (targetPayment.paidAmount ?? 0) + amt,
      remainingAmount,
      delayDays,
      delayInterest,
      paymentMode,
    };

    onSave(updatedPayment);
    setPaidDate(new Date());
    setPaidAmount('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {targetPayment ? (
            <>
              <View style={styles.headerRow}>
                <Text style={styles.title}>Record payment</Text>
                <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
                  <Text style={styles.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Amount due</Text>
                <Text style={styles.summaryAmount}>₹{formatCurrency(getAmountDue(targetPayment))}</Text>
                <View style={styles.summaryMeta}>
                  <Text style={styles.metaText}>Due {new Date(targetPayment.dueDate).toLocaleDateString()}</Text>
                  <Text style={styles.metaText}>Installment #{targetPayment.dueNumber}</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Quick amount</Text>
              <View style={styles.quickRow}>
                {[0.25, 0.5, 1].map((value) => (
                  <TouchableOpacity
                    key={value}
                    activeOpacity={0.8}
                    style={styles.quickBtn}
                    onPress={() => handleQuickAmount(value)}
                  >
                    <Text style={styles.quickBtnText}>{Math.round(value * 100)}%</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <DatePicker
                label="Payment date"
                value={paidDate}
                onChange={setPaidDate}
                placeholder="Select date"
              />

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Mode of payment</Text>
                <View style={styles.modeRow}>
                  {PAYMENT_MODES.map(mode => (
                    <TouchableOpacity
                      key={mode}
                      style={[styles.modeBtn, paymentMode === mode && styles.modeBtnActive]}
                      onPress={() => setPaymentMode(mode)}
                    >
                      <Text style={[styles.modeBtnText, paymentMode === mode && styles.modeBtnTextActive]}>{mode}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Amount paid</Text>
                <TextInput
                  style={styles.input}
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                  placeholder="Enter payment amount"
                  placeholderTextColor="#aaa"
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>Record payment</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>All payments recorded for this loan</Text>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#dfe3eb',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: '#374151',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#f6f8ff',
    borderColor: '#dfe7ff',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1d4ed8',
    marginTop: 4,
  },
  summaryMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickBtnText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 18,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    marginBottom: 8,
  },
  modeBtnActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  modeBtnTextActive: {
    color: '#166534',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    color: '#111827',
  },
  actions: {
    gap: 10,
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#4b5563',
    marginBottom: 20,
    textAlign: 'center',
  },
});
