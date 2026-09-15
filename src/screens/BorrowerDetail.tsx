import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Borrower, Loan } from '../types';
import { useStorage } from '../hooks/useStorage';
import { useNotifications } from '../hooks/useNotifications';
import BorrowerForm from '../components/BorrowerForm';
import PaymentRecorder from '../components/PaymentRecorder';
import { isPaymentOverdue } from '../utils/duePayments';
import { colors, radii } from '../theme/tokens';

function daysOverdue(dueDateIso: string): number {
  const due = new Date(dueDateIso);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

interface Props {
  borrower: Borrower;
  onBack: () => void;
  onEdit: (b: Borrower) => void;
  onSave: (b: Borrower) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatCurrency(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Borrower profile screen: loan list, payment tracking, CSV export, and payment recording. */
export default function BorrowerDetail({ borrower, onBack, onEdit, onSave }: Props) {
  const { saveBorrower, deleteBorrower, deleteLoan: deleteLoanFromServer } = useStorage();
  const { scheduleRemindersForBorrower, cancelRemindersForBorrower } = useNotifications();
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [current, setCurrent] = useState<Borrower>(borrower);
  const [paymentRecorderLoan, setPaymentRecorderLoan] = useState<Loan | null>(null);
  const statementRefs = useRef<Record<string, View | null>>({});

  const handleDeleteLoan = (loan: Loan) => {
    Alert.alert('Delete Loan', `Remove this loan of ₹${formatCurrency(loan.principal)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const updated = { ...current, loans: current.loans.filter(l => l.id !== loan.id) };
          await deleteLoanFromServer(current.id, loan.id);
          await scheduleRemindersForBorrower(updated);
          setCurrent(updated);
          onSave(updated);
        },
      },
    ]);
  };

  /** Builds a CSV from loan/payment rows and opens the system share sheet. */
  const handleShareLoanStatement = async (loan: Loan) => {
    try {
      const rows = [
        ['Borrower', current.name],
        ['Phone', current.phone],
        ['Loan Principal', String(loan.principal)],
        ['Interest Rate %', String(loan.interestRate)],
        ['Tenure Months', String(loan.tenure)],
        ['EMI Mode', loan.repaymentMode === 'adding' ? 'Adding' : 'Cutting'],
        ['Start Date', formatDate(loan.startDate)],
        [],
        ['Due No', 'Due Date', 'Principal', 'Interest', 'Total', 'Paid Amount', 'Remaining', 'Paid Date', 'Delay Days', 'Delay Interest', 'Payment Mode'],
        ...loan.payments.map((p) => [
          String(p.dueNumber),
          formatDate(p.dueDate),
          String(p.principal),
          String(p.interest),
          String(p.totalAmount),
          p.paidAmount ? String(p.paidAmount) : '',
          p.remainingAmount ? String(p.remainingAmount) : '',
          p.paidDate ? formatDate(p.paidDate) : '',
          String(p.delayDays),
          String(p.delayInterest),
          p.paymentMode ?? '',
        ]),
      ];

      const csvContent = rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const fileName = `${current.name.replace(/\s+/g, '_')}_${loan.id}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: `${current.name} loan statement`,
        UTI: 'public.comma-separated-values-text',
      });
    } catch (e) {
      console.warn('Share failed', e);
      Alert.alert('Share failed', 'Unable to export the loan statement file right now.');
    }
  };

  /** Updates one payment in the loan, persists locally, and syncs update_borrower to Sheets. */
  const handlePaymentSave = async (payment: any) => {
    if (!paymentRecorderLoan) return;

    const updatedLoans = current.loans.map(l => {
      if (l.id !== paymentRecorderLoan.id) return l;
      return {
        ...l,
        payments: l.payments.map(p => (p.id === payment.id ? payment : p)),
      };
    });

    const updated = { ...current, loans: updatedLoans };
    await saveBorrower(updated);
    await scheduleRemindersForBorrower(updated);

    setCurrent(updated);
    onSave(updated);
    setPaymentRecorderLoan(null);
    Alert.alert('Success', 'Payment recorded successfully');
  };

  if (showAddLoan) {
    return (
      <BorrowerForm
        initial={current}
        allowLoanFields
        onSave={async (updated) => {
          const merged = {
            ...current,
            name: updated.name,
            phone: updated.phone,
            notes: updated.notes,
            loans: updated.loans,
          };
          await saveBorrower(merged);
          await scheduleRemindersForBorrower(merged);
          setCurrent(merged);
          onSave(merged);
          setShowAddLoan(false);
        }}
        onCancel={() => setShowAddLoan(false)}
      />
    );
  }

  const totalPrincipal = current.loans.reduce((s, l) => s + l.principal, 0);
  const totalInterest = current.loans.reduce((s, l) => {
    return s + (l.payments?.reduce((si, p) => si + p.interest, 0) ?? 0);
  }, 0);

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>‹ Back</Text>
      </TouchableOpacity>

      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{current.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{current.name}</Text>
          <Text style={styles.profilePhone}>{current.phone}</Text>
          {current.notes ? <Text style={styles.profileNotes}>{current.notes}</Text> : null}
        </View>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => onEdit(current)}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Loans</Text>
          <Text style={styles.summaryValue}>{current.loans.length}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Principal</Text>
          <Text style={styles.summaryValue}>₹{formatCurrency(totalPrincipal)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Interest</Text>
          <Text style={[styles.summaryValue, { color: colors.accent }]}>₹{formatCurrency(totalInterest)}</Text>
        </View>
      </View>

      {/* Loans */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>LOANS</Text>
        <TouchableOpacity style={styles.addLoanBtn} onPress={() => setShowAddLoan(true)}>
          <Text style={styles.addLoanBtnText}>+ Add Loan</Text>
        </TouchableOpacity>
      </View>

      {current.loans.length === 0 ? (
        <View style={styles.emptyLoans}>
          <Text style={styles.emptyText}>No loans yet. Tap + Add Loan to create one.</Text>
        </View>
      ) : (
        current.loans.map(loan => {
          const isExpanded = expandedLoan === loan.id;
          const payments = loan.payments || [];
          const totalLoanInterest = payments.reduce((s, p) => s + p.interest, 0);
          const paidAmount = payments.reduce((s, p) => s + (p.paidAmount || 0), 0);
          const totalPayable = loan.repaymentMode === 'adding' ? loan.principal + totalLoanInterest : loan.principal;
          const progress = totalPayable > 0 ? Math.min(1, paidAmount / totalPayable) : 0;

          return (
            <View key={loan.id} style={styles.loanCard}>
              <View
                ref={(node) => {
                  statementRefs.current[loan.id] = node;
                }}
                collapsable={false}
                style={styles.statementCard}
              >
              <TouchableOpacity
                style={styles.loanHeader}
                onPress={() => setExpandedLoan(isExpanded ? null : loan.id)}
              >
                <View style={styles.loanHeaderLeft}>
                  <Text style={styles.loanPrincipal}>₹{formatCurrency(loan.principal)}</Text>
                  <Text style={styles.loanMeta}>
                    {loan.interestRate}% · {loan.tenure} months · {loan.repaymentMode === 'adding' ? 'Adding' : 'Cutting'} EMI · from {formatDate(loan.startDate)}
                  </Text>
                  <View style={styles.progressRow}>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                    <Text style={styles.progressLabel}>₹{formatCurrency(paidAmount)} / ₹{formatCurrency(totalPayable)}</Text>
                  </View>
                </View>
                <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.scheduleContainer}>
                  <Text style={styles.subsectionLabel}>INSTALLMENT SCHEDULE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={styles.tableScroll}>
                    <View style={styles.tableBlock}>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.th, styles.colNo]}>Due No</Text>
                        <Text style={[styles.th, styles.colDate]}>Due Date</Text>
                        <Text style={[styles.th, styles.colAmt]}>Principal</Text>
                        <Text style={[styles.th, styles.colAmt]}>Interest</Text>
                        <Text style={[styles.th, styles.colAmt]}>Total</Text>
                      </View>

                      {payments.map((p, i) => (
                        <View key={p.id} style={[styles.tableRow, i % 2 === 0 && styles.tableRowEven]}>
                          <Text style={[styles.td, styles.colNo]}>{p.dueNumber}</Text>
                          <Text style={[styles.td, styles.colDate]}>{formatDate(p.dueDate)}</Text>
                          <Text style={[styles.td, styles.colAmt]}>₹{formatCurrency(p.principal)}</Text>
                          <Text style={[styles.td, styles.colAmt]}>₹{formatCurrency(p.interest)}</Text>
                          <Text style={[styles.td, styles.colAmt, styles.totalTd]}>₹{formatCurrency(p.totalAmount)}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={styles.subsectionLabel}>PAYMENT TRACKING</Text>
                  <View style={styles.paymentList}>
                    {payments.map((p) => {
                      const paid = !!p.paidAmount;
                      const overdue = !paid && isPaymentOverdue(p);
                      const overdueDays = overdue ? daysOverdue(p.dueDate) : 0;
                      return (
                        <View key={p.id} style={[styles.paymentTrackRow, overdue && styles.paymentTrackRowUnpaid]}>
                          <View style={[styles.trackDot, { backgroundColor: paid ? colors.success : overdue ? colors.danger : colors.ink3 }]} />
                          <View style={styles.rowMain}>
                            <Text style={styles.paymentTrackTitle}>
                              Due #{p.dueNumber} · {paid ? `Paid ${formatDate(p.paidDate!)}` : 'Unpaid'}
                            </Text>
                            <Text style={styles.paymentTrackSub}>
                              {paid
                                ? (p.paymentMode ?? '')
                                : overdue
                                  ? `${overdueDays} day${overdueDays !== 1 ? 's' : ''} overdue`
                                  : `Due ${formatDate(p.dueDate)}`}
                            </Text>
                          </View>
                          <View style={[styles.chip, paid ? styles.chipSuccess : overdue ? styles.chipDanger : styles.chipNeutral]}>
                            <Text style={[styles.chipText, { color: paid ? colors.success : overdue ? colors.danger : colors.ink2 }]}>
                              ₹{formatCurrency(paid ? p.paidAmount! : p.totalAmount)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.shareBtn} onPress={() => handleShareLoanStatement(loan)}>
                      <Text style={styles.shareBtnText}>Export CSV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.recordPaymentBtn} onPress={() => setPaymentRecorderLoan(loan)}>
                      <Text style={styles.recordPaymentBtnText}>Record Payment</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.loanFooter}>
                    <Text style={styles.loanFooterText}>
                      Total Interest: <Text style={styles.loanFooterValue}>₹{formatCurrency(totalLoanInterest)}</Text>
                    </Text>
                    <Text style={styles.loanFooterText}>
                      Total Payable: <Text style={[styles.loanFooterValue, { color: colors.success }]}>
                        ₹{formatCurrency(totalPayable)}
                      </Text>
                    </Text>
                  </View>

                  <TouchableOpacity style={styles.deleteLoanBtn} onPress={() => handleDeleteLoan(loan)}>
                    <Text style={styles.deleteLoanBtnText}>Delete this loan</Text>
                  </TouchableOpacity>
                </View>
              )}
              </View>
            </View>
          );
        })
      )}
      </ScrollView>

      {paymentRecorderLoan && (
        <PaymentRecorder
          loan={paymentRecorderLoan}
          visible={!!paymentRecorderLoan}
          onSave={handlePaymentSave}
          onCancel={() => setPaymentRecorderLoan(null)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  backBtn: { marginBottom: 14 },
  backBtnText: { fontSize: 15, color: colors.accent, fontWeight: '700' },

  profileCard: {
    backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border,
    padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 14,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentSoft,
    justifyContent: 'center', alignItems: 'center', marginRight: 13,
  },
  avatarText: { color: colors.accent, fontSize: 19, fontWeight: '800' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '800', color: colors.ink },
  profilePhone: { fontSize: 12.5, color: colors.ink2, marginTop: 3 },
  profileNotes: { fontSize: 12.5, color: colors.ink3, marginTop: 4, fontStyle: 'italic' },
  editBtn: {
    backgroundColor: colors.surface2, borderRadius: radii.md,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  editBtnText: { fontSize: 13.5, fontWeight: '700', color: colors.ink },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  summaryBox: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: 12, alignItems: 'center',
  },
  summaryLabel: { fontSize: 11, color: colors.ink2, marginBottom: 5, fontWeight: '600' },
  summaryValue: { fontSize: 14, fontWeight: '800', color: colors.ink, textAlign: 'center' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 0.6 },
  addLoanBtn: {
    backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentSoftBorder,
    borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 7,
  },
  addLoanBtnText: { color: colors.accent, fontSize: 12.5, fontWeight: '700' },

  emptyLoans: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { color: colors.ink2, fontSize: 14, textAlign: 'center' },

  loanCard: {
    backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border,
    marginBottom: 12, overflow: 'hidden',
  },
  statementCard: {
    backgroundColor: colors.surface,
  },
  loanHeader: {
    padding: 14, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'flex-start',
  },
  loanHeaderLeft: { flex: 1 },
  loanPrincipal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  loanMeta: { fontSize: 12.5, color: colors.ink2, marginTop: 3 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.success, borderRadius: 3 },
  progressLabel: { fontSize: 11, color: colors.ink2, fontWeight: '600' },
  expandIcon: { fontSize: 12, color: colors.ink3, marginLeft: 8, marginTop: 2 },

  scheduleContainer: { borderTopWidth: 1, borderTopColor: colors.border },
  subsectionLabel: {
    fontSize: 10.5, fontWeight: '700', color: colors.ink2, letterSpacing: 0.6,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  tableScroll: { paddingBottom: 8 },
  tableBlock: { minWidth: 520 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: colors.accentSoft,
    paddingVertical: 8, paddingHorizontal: 10, marginHorizontal: 14, borderRadius: radii.sm,
  },
  th: { fontSize: 11, fontWeight: '700', color: colors.accent, textAlign: 'center' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10,
    marginHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tableRowEven: { backgroundColor: colors.bg },
  td: { fontSize: 11, color: colors.ink, textAlign: 'center' },
  totalTd: { color: colors.accent, fontWeight: '700' },
  colNo: { width: 32 },
  colDate: { flex: 2, textAlign: 'left' },
  colAmt: { flex: 1.5, textAlign: 'right' },

  paymentList: { paddingHorizontal: 14, gap: 8, paddingBottom: 4 },
  paymentTrackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: 10,
  },
  paymentTrackRowUnpaid: { borderColor: colors.danger },
  trackDot: { width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1 },
  paymentTrackTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  paymentTrackSub: { fontSize: 11, color: colors.ink2, marginTop: 2 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill },
  chipSuccess: { backgroundColor: colors.successSoft },
  chipDanger: { backgroundColor: colors.dangerSoft },
  chipNeutral: { backgroundColor: colors.surface2 },
  chipText: { fontSize: 11, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 8, padding: 14 },
  shareBtn: {
    flex: 1, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentSoftBorder,
    borderRadius: radii.md, paddingVertical: 10, alignItems: 'center',
  },
  shareBtnText: { color: colors.accent, fontSize: 12.5, fontWeight: '700' },
  recordPaymentBtn: {
    flex: 1, backgroundColor: colors.success, borderRadius: radii.md,
    paddingVertical: 10, alignItems: 'center',
  },
  recordPaymentBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },

  loanFooter: {
    paddingHorizontal: 14, paddingBottom: 10, gap: 4,
  },
  loanFooterText: { fontSize: 12.5, color: colors.ink2 },
  loanFooterValue: { fontWeight: '700', color: colors.ink },

  deleteLoanBtn: {
    margin: 14, marginTop: 4, backgroundColor: colors.dangerSoft,
    borderRadius: radii.md, paddingVertical: 10, alignItems: 'center',
  },
  deleteLoanBtnText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
});
