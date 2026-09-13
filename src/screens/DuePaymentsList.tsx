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
import sheetsSync from '../services/sheetsSync';
import { useNotifications } from '../hooks/useNotifications';
import { Borrower, Loan, Payment } from '../types';

interface Props {
  onOpenClient?: (borrowerId: string) => void;
}

function priorityColor(days: number): string {
  if (days >= 30) return '#FF3B30';
  if (days >= 14) return '#FF9500';
  if (days >= 7) return '#F59E0B';
  return '#64748b';
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

    try {
      const url = (globalThis as any).SHEETS_WEBAPP_URL;
      if (url) {
        await sheetsSync.postToSheet(url, { type: 'update_borrower', payload: updated });
      }
    } catch (e) {
      console.warn('Failed to update Sheets after payment', e);
    }

    setRecording(null);
    Alert.alert('Success', 'Payment recorded successfully');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
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
          dueItems.map((item, index) => (
            <View
              key={`${item.borrowerId}-${item.payment.id}`}
              style={[styles.card, index === 0 && styles.priorityCard]}
            >
              {index === 0 && (
                <View style={styles.priorityBadge}>
                  <Text style={styles.priorityBadgeText}>Highest priority</Text>
                </View>
              )}

              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <Text style={styles.borrowerName}>{item.borrowerName}</Text>
                  <Text style={styles.borrowerPhone}>{item.borrowerPhone}</Text>
                </View>
                <View style={[styles.daysBadge, { backgroundColor: priorityColor(item.daysOverdue) + '22' }]}>
                  <Text style={[styles.daysText, { color: priorityColor(item.daysOverdue) }]}>
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
                <Text style={styles.amountValue}>₹{formatCurrency(item.amountDue)}</Text>
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
          ))
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
  title: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, color: '#34C759', marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  emptySub: { fontSize: 14, color: '#888', marginTop: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 3,
  },
  priorityCard: { borderWidth: 2, borderColor: '#FF3B30' },
  priorityBadge: {
    backgroundColor: '#FF3B30',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
  },
  priorityBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { flex: 1 },
  borrowerName: { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  borrowerPhone: { fontSize: 13, color: '#64748b', marginTop: 2 },
  daysBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  daysText: { fontSize: 13, fontWeight: '800' },
  metaRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  meta: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  amountLabel: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  amountValue: { fontSize: 20, fontWeight: '800', color: '#FF3B30' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  recordBtn: {
    flex: 1,
    backgroundColor: '#34C759',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  recordBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  viewBtn: {
    flex: 1,
    backgroundColor: '#eaf2ff',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cfe0ff',
  },
  viewBtnText: { color: '#1d4ed8', fontWeight: '700', fontSize: 14 },
});
