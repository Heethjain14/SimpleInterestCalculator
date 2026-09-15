import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useStorageContext } from '../context/StorageContext';
import { getDuePayments, DuePaymentItem } from '../utils/duePayments';
import { formatCurrency, formatDateIso } from '../utils/format';
import PaymentRecorder from '../components/PaymentRecorder';
import RefreshButton from '../components/RefreshButton';
import { useNotifications } from '../hooks/useNotifications';
import { Borrower, Loan, Payment } from '../types';
import { colors, radii, priorityColor } from '../theme/tokens';

interface Props {
  onOpenClient?: (borrowerId: string) => void;
}

function chipStyle(days: number) {
  if (days >= 14) return { bg: colors.dangerSoft, fg: colors.danger };
  if (days >= 1) return { bg: colors.warningSoft, fg: colors.warning };
  return { bg: colors.surface2, fg: colors.ink2 };
}

/** Lists overdue installments sorted by most late first, with quick payment recording. */
export default function DuePaymentsList({ onOpenClient }: Props) {
  const { borrowers, loading, saveBorrower, getBorrower } = useStorageContext();
  const { scheduleRemindersForBorrower } = useNotifications();
  const [recording, setRecording] = useState<DuePaymentItem | null>(null);

  const dueItems = useMemo(() => getDuePayments(borrowers), [borrowers]);

  const handlePaymentSave = async (payment: Payment) => {
    if (!recording) return;

    const borrower = getBorrower(recording.borrowerId);
    if (!borrower) return;

    const updatedLoans = borrower.loans.map((loan: Loan) => {
      if (loan.id !== recording.loan.id) return loan;
      return {
        ...loan,
        payments: loan.payments.map(p => (p.id === payment.id ? payment : p)),
      };
    });

    const updated: Borrower = { ...borrower, loans: updatedLoans };
    await saveBorrower(updated);
    await scheduleRemindersForBorrower(updated);

    setRecording(null);
    Alert.alert('Success', 'Payment recorded successfully');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Due Payments</Text>
            <Text style={styles.subtitle}>Most overdue shown first</Text>
          </View>
          <RefreshButton compact />
        </View>

        {dueItems.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptySub}>No overdue installments right now</Text>
          </View>
        ) : (
          dueItems.map((item, index) => {
            const chip = chipStyle(item.daysOverdue);
            return (
              <View
                key={`${item.borrowerId}-${item.payment.id}`}
                style={[styles.card, index === 0 && styles.priorityCard]}
              >
                {index === 0 && (
                  <View style={styles.priorityBadge}>
                    <Text style={styles.priorityBadgeText}>HIGHEST PRIORITY</Text>
                  </View>
                )}

                <View style={styles.cardTop}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.borrowerName}>{item.borrowerName}</Text>
                    <Text style={styles.borrowerPhone}>{item.borrowerPhone}</Text>
                  </View>
                  <View style={[styles.daysBadge, { backgroundColor: chip.bg }]}>
                    <Text style={[styles.daysText, { color: chip.fg }]}>
                      {item.daysOverdue}d late
                    </Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.meta}>Due #{item.payment.dueNumber}</Text>
                  <Text style={styles.meta}>Due {formatDateIso(item.payment.dueDate)}</Text>
                </View>

                <View style={styles.amountRow}>
                  <Text style={styles.amountLabel}>Amount due</Text>
                  <Text style={[styles.amountValue, index === 0 && { color: colors.danger }]}>
                    ₹{formatCurrency(item.amountDue)}
                  </Text>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.recordBtn}
                    onPress={() => setRecording(item)}
                  >
                    <Text style={styles.recordBtnText}>Record Payment</Text>
                  </TouchableOpacity>
                  {onOpenClient && (
                    <TouchableOpacity
                      style={styles.viewBtn}
                      onPress={() => onOpenClient(item.borrowerId)}
                    >
                      <Text style={styles.viewBtnText}>View Client</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {recording && (
        <PaymentRecorder
          loan={recording.loan}
          paymentId={recording.payment.id}
          visible
          onSave={handlePaymentSave}
          onCancel={() => setRecording(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 12.5, color: colors.ink2, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, color: colors.success, marginBottom: 12, fontWeight: '800' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  emptySub: { fontSize: 13, color: colors.ink2, marginTop: 6 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  priorityCard: { borderColor: colors.danger },
  priorityBadge: {
    backgroundColor: colors.danger,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    marginBottom: 10,
  },
  priorityBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { flex: 1 },
  borrowerName: { fontSize: 15.5, fontWeight: '700', color: colors.ink },
  borrowerPhone: { fontSize: 12.5, color: colors.ink2, marginTop: 2 },
  daysBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill },
  daysText: { fontSize: 11, fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: 14, marginTop: 12 },
  meta: { fontSize: 11.5, color: colors.ink2, fontWeight: '600' },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  amountLabel: { fontSize: 13, color: colors.ink2, fontWeight: '600' },
  amountValue: { fontSize: 19, fontWeight: '800', color: colors.ink },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  recordBtn: {
    flex: 1,
    backgroundColor: colors.success,
    borderRadius: radii.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  recordBtnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  viewBtn: {
    flex: 1,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
  },
  viewBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13.5 },
});
