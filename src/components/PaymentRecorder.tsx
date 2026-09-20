import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, Modal,
} from 'react-native';
import { Loan, Payment, PaymentMode, PartialPayment } from '../types';
import DatePicker from './DatePicker';
import { getAmountDue, calendarDaysBetween } from '../utils/duePayments';
import { generateId } from '../utils/id';
import { colors, radii } from '../theme/tokens';

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

/** Recomputes a payment's paidAmount/remainingAmount/paidDate/delay roll-ups from its partialPayments history. */
function recomputeRollups(payment: Payment, partialPayments: PartialPayment[]): Payment {
  const paidAmount = partialPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingAmount = Math.max(0, payment.totalAmount - paidAmount);
  const last = partialPayments[partialPayments.length - 1];
  const distinctModes = new Set(partialPayments.map(p => p.mode));

  return {
    ...payment,
    partialPayments,
    paidAmount,
    remainingAmount,
    paidDate: last?.date,
    delayDays: last?.delayDays ?? 0,
    delayInterest: partialPayments.reduce((sum, p) => sum + p.delayInterest, 0),
    paymentMode: distinctModes.size > 1 ? 'Mixed' : last?.mode,
  };
}

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
  const [chunkNotes, setChunkNotes] = useState('');

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
    const delayDays = Math.max(0, calendarDaysBetween(dueDate, paidDateObj));

    const dailyRate = (loan.interestRate / 100) / 30;
    const delayInterest = amt * dailyRate * delayDays;
    const remainingAmount = Math.max(0, dueTotal - amt);

    if (amt < dueTotal) {
      Alert.alert(
        'Partial payment recorded',
        `₹${formatCurrency(amt)} was recorded. Remaining due is ₹${formatCurrency(remainingAmount)}.`
      );
    }

    const chunk: PartialPayment = {
      id: generateId(),
      date: paidDate.toISOString(),
      amount: amt,
      mode: paymentMode,
      delayDays,
      delayInterest,
      notes: chunkNotes.trim() || undefined,
    };

    const updatedPayment = recomputeRollups(targetPayment, [...targetPayment.partialPayments, chunk]);

    onSave(updatedPayment);
    setPaidDate(new Date());
    setPaidAmount('');
    setChunkNotes('');
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

              {targetPayment.partialPayments.length > 0 && (
                <View style={styles.historyCard}>
                  <Text style={styles.sectionLabel}>Already recorded</Text>
                  {targetPayment.partialPayments.map(chunk => (
                    <View key={chunk.id} style={styles.historyRow}>
                      <Text style={styles.historyText}>
                        {new Date(chunk.date).toLocaleDateString()} · {chunk.mode}
                      </Text>
                      <Text style={styles.historyAmount}>₹{formatCurrency(chunk.amount)}</Text>
                    </View>
                  ))}
                </View>
              )}

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

              <View style={styles.inputGroup}>
                <Text style={styles.sectionLabel}>Notes (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={chunkNotes}
                  onChangeText={setChunkNotes}
                  placeholder="e.g. cheque number, reason for split"
                  placeholderTextColor="#aaa"
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
    backgroundColor: 'rgba(8,10,18,0.52)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
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
    backgroundColor: colors.border,
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
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: colors.ink2,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoftBorder,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.ink2,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.accent,
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
    color: colors.ink2,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.ink2,
    marginBottom: 8,
  },
  historyCard: {
    backgroundColor: colors.surface2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 16,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  historyText: {
    fontSize: 12.5,
    color: colors.ink2,
    fontWeight: '600',
  },
  historyAmount: {
    fontSize: 12.5,
    color: colors.ink,
    fontWeight: '700',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickBtn: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickBtnText: {
    color: colors.accent,
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
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  modeBtnActive: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink2,
  },
  modeBtnTextActive: {
    color: colors.success,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  actions: {
    gap: 10,
  },
  saveBtn: {
    backgroundColor: colors.success,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: colors.surface2,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.ink2,
    fontSize: 14.5,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: colors.ink2,
    marginBottom: 20,
    textAlign: 'center',
  },
});
