import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, Modal, ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Loan, Payment, PaymentMode, PartialPayment } from '../types';
import DatePicker from './DatePicker';
import { getAmountDue, isPaymentOverdue, calendarDaysBetween } from '../utils/duePayments';
import { generateId } from '../utils/id';
import { colors, radii } from '../theme/tokens';

interface Props {
  loan: Loan;
  visible: boolean;
  /** Installment selected when the sheet opens; the user can still switch. Defaults to the first unpaid one. */
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
export default function PaymentRecorder(props: Props) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onCancel}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {/* A Modal is its own native window, so it needs its own provider for correct insets. */}
      <SafeAreaProvider>
        <Sheet {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Sheet({ loan, paymentId, onSave, onCancel }: Props) {
  const insets = useSafeAreaInsets();

  // Every installment that still has money owed, so a payment can go to any of them
  // (e.g. finish installment 1 after installment 2 has already been cleared).
  const openInstallments = useMemo(
    () => (loan.payments ?? []).filter(p => getAmountDue(p) > 0).sort((a, b) => a.dueNumber - b.dueNumber),
    [loan.payments],
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(paymentId);
  const targetPayment: Payment | undefined =
    openInstallments.find(p => p.id === selectedId)
    ?? openInstallments.find(p => p.id === paymentId)
    ?? openInstallments[0];

  const [paidDate, setPaidDate] = useState<Date | null>(new Date());
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [chunkNotes, setChunkNotes] = useState('');

  const handleSelectInstallment = (id: string) => {
    setSelectedId(id);
    setPaidAmount(''); // a typed / quick amount was worked out for the previous installment
  };

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
    <KeyboardAvoidingView style={styles.overlay} behavior="padding">
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />

        {targetPayment ? (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Record payment</Text>
              <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {openInstallments.length > 1 && (
                <View style={styles.block}>
                  <Text style={styles.sectionLabel}>Apply to installment</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.installmentRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    {openInstallments.map(p => {
                      const selected = p.id === targetPayment.id;
                      const overdue = isPaymentOverdue(p);
                      const due = new Date(p.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                      return (
                        <TouchableOpacity
                          key={p.id}
                          activeOpacity={0.8}
                          style={[styles.instChip, selected && styles.instChipActive]}
                          onPress={() => handleSelectInstallment(p.id)}
                        >
                          <Text style={[styles.instChipTitle, selected && styles.instChipTitleActive]}>
                            #{p.dueNumber}{p.partialPayments.length > 0 ? ' · part paid' : ''}
                          </Text>
                          <Text style={[styles.instChipAmount, selected && styles.instChipAmountActive]}>
                            ₹{formatCurrency(getAmountDue(p))}
                          </Text>
                          <Text style={[styles.instChipMeta, overdue && styles.instChipMetaOverdue]}>
                            {overdue ? 'Overdue · ' : 'Due '}{due}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Amount due</Text>
                <Text style={styles.summaryAmount}>₹{formatCurrency(getAmountDue(targetPayment))}</Text>
                <View style={styles.summaryMeta}>
                  <Text style={styles.metaText}>Due {new Date(targetPayment.dueDate).toLocaleDateString()}</Text>
                  <Text style={styles.metaText}>Installment #{targetPayment.dueNumber} of {loan.payments.length}</Text>
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

              <View style={styles.block}>
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
              </View>

              <DatePicker
                label="Payment date"
                value={paidDate}
                onChange={setPaidDate}
                placeholder="Select date"
                containerStyle={styles.block}
              />

              <View style={styles.block}>
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

              <View style={styles.block}>
                <Text style={styles.sectionLabel}>Amount paid</Text>
                <TextInput
                  style={styles.input}
                  value={paidAmount}
                  onChangeText={setPaidAmount}
                  placeholder="Enter payment amount"
                  placeholderTextColor={colors.ink3}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.block}>
                <Text style={styles.sectionLabel}>Notes (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={chunkNotes}
                  onChangeText={setChunkNotes}
                  placeholder="e.g. cheque number, reason for split"
                  placeholderTextColor={colors.ink3}
                />
              </View>
            </ScrollView>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Record payment</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>All payments recorded for this loan</Text>
            <TouchableOpacity style={[styles.cancelBtn, styles.closeFull]} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
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
    // Cap the height so the header and buttons always stay on screen; the body scrolls.
    maxHeight: '92%',
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
    marginBottom: 12,
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
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  bodyContent: {
    paddingBottom: 4,
  },
  // One consistent rhythm between every section of the form.
  block: {
    marginBottom: 16,
  },
  installmentRow: {
    gap: 8,
    paddingRight: 4,
  },
  instChip: {
    minWidth: 112,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  instChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  instChipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink2,
  },
  instChipTitleActive: {
    color: colors.accent,
  },
  instChipAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  instChipAmountActive: {
    color: colors.accent,
  },
  instChipMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.ink3,
  },
  instChipMetaOverdue: {
    color: colors.danger,
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
    marginBottom: 7,
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
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
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
    fontSize: 14.5,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  saveBtn: {
    flex: 2,
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
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.ink2,
    fontSize: 14.5,
    fontWeight: '600',
  },
  closeFull: {
    flex: 0,
    alignSelf: 'stretch',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 10,
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    color: colors.ink2,
    textAlign: 'center',
  },
});
