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
  const { saveBorrower, deleteBorrower } = useStorage();
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
          await saveBorrower(updated);
          await scheduleRemindersForBorrower(updated);
          try {
            const url = (globalThis as any).SHEETS_WEBAPP_URL;
            if (url) {
              const sheetsSync = (await import('../services/sheetsSync')).default;
              await sheetsSync.postToSheet(url, { type: 'update_borrower', payload: updated });
            }
          } catch (e) {
            console.warn('Failed to update Sheets after loan delete', e);
          }
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

    try {
      const url = (globalThis as any).SHEETS_WEBAPP_URL;
      if (url) {
        const sheetsSync = (await import('../services/sheetsSync')).default;
        await sheetsSync.postToSheet(url, { type: 'update_borrower', payload: updated });
      }
    } catch (e) {
      console.warn('Failed to update Sheets after payment', e);
    }

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
        <Text style={styles.backBtnText}>← Back</Text>
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
          <Text style={styles.summaryLabel}>Active Loans</Text>
          <Text style={styles.summaryValue}>{current.loans.length}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Total Principal</Text>
          <Text style={styles.summaryValue}>₹{formatCurrency(totalPrincipal)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Total Interest</Text>
          <Text style={[styles.summaryValue, { color: '#007AFF' }]}>₹{formatCurrency(totalInterest)}</Text>
        </View>
      </View>

      {/* Loans */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Loans</Text>
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
                  <Text style={styles.loanDue}>
                    Paid: ₹{formatCurrency(paidAmount)} / Total: ₹{formatCurrency(loan.repaymentMode === 'adding' ? loan.principal + totalLoanInterest : loan.principal)}
                  </Text>
                </View>
                <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.scheduleContainer}>
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

                  <View style={styles.paymentTrackerHeader}>
                    <Text style={styles.paymentTrackerTitle}>Payment Tracking</Text>
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.shareBtn} onPress={() => handleShareLoanStatement(loan)}>
                        <Text style={styles.shareBtnText}>Export CSV</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.recordPaymentBtn} onPress={() => setPaymentRecorderLoan(loan)}>
                        <Text style={styles.recordPaymentBtnText}>+ Record Payment</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={styles.tableScroll}>
                    <View style={styles.tableBlock}>
                      <View style={styles.paymentTableHeader}>
                        <Text style={[styles.pth, styles.colPNo]}>Due No</Text>
                        <Text style={[styles.pth, styles.colDate]}>Paid Date</Text>
                        <Text style={[styles.pth, styles.colAmt]}>Paid Amount</Text>
                        <Text style={[styles.pth, styles.colAmt]}>Remaining</Text>
                        <Text style={[styles.pth, styles.colAmt]}>Delay Days</Text>
                        <Text style={[styles.pth, styles.colAmt]}>Delay Interest</Text>
                        <Text style={[styles.pth, styles.colAmt]}>Mode</Text>
                      </View>

                      {payments.map((p, i) => (
                        <View key={p.id} style={[styles.paymentRow, i % 2 === 0 && styles.tableRowEven]}>
                          <Text style={[styles.td, styles.colPNo]}>{p.dueNumber}</Text>
                          <Text style={[styles.td, styles.colDate]}>{p.paidDate ? formatDate(p.paidDate) : '-'}</Text>
                          <Text style={[styles.td, styles.colAmt, p.paidAmount ? styles.paidTd : {}]}>
                            {p.paidAmount ? `₹${formatCurrency(p.paidAmount)}` : '-'}
                          </Text>
                          <Text style={[styles.td, styles.colAmt, (p.remainingAmount ?? 0) > 0 ? styles.partialTd : {}]}>
                            {(p.remainingAmount ?? 0) > 0 ? `₹${formatCurrency(p.remainingAmount ?? 0)}` : (p.paidAmount ? '₹0.00' : '-')}
                          </Text>
                          <Text style={[styles.td, styles.colAmt]}>{p.delayDays > 0 ? p.delayDays : '-'}</Text>
                          <Text style={[styles.td, styles.colAmt]}>{p.delayInterest > 0 ? `₹${formatCurrency(p.delayInterest)}` : '-'}</Text>
                          <Text style={[styles.td, styles.colAmt]}>{p.paymentMode ?? '-'}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>

                  <View style={styles.loanFooter}>
                    <Text style={styles.loanFooterText}>
                      Total Interest: <Text style={styles.loanFooterValue}>₹{formatCurrency(totalLoanInterest)}</Text>
                    </Text>
                    <Text style={styles.loanFooterText}>
                      Total Payable: <Text style={[styles.loanFooterValue, { color: '#34C759' }]}>
                        ₹{formatCurrency(loan.repaymentMode === 'adding' ? loan.principal + totalLoanInterest : loan.principal)}
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
  backBtn: { marginBottom: 16 },
  backBtnText: { fontSize: 16, color: '#007AFF', fontWeight: '600' },

  profileCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 3,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700', color: '#333' },
  profilePhone: { fontSize: 14, color: '#666', marginTop: 2 },
  profileNotes: { fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' },
  editBtn: {
    backgroundColor: '#f0f0f0', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  editBtnText: { fontSize: 14, fontWeight: '600', color: '#333' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12,
    alignItems: 'center', shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
    shadowRadius: 2, elevation: 2,
  },
  summaryLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'center' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  addLoanBtn: {
    backgroundColor: '#007AFF', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  addLoanBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  emptyLoans: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { color: '#888', fontSize: 14, textAlign: 'center' },

  loanCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 12,
    overflow: 'hidden', shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08,
    shadowRadius: 3, elevation: 3,
  },
  statementCard: {
    backgroundColor: '#fff',
  },
  loanHeader: {
    padding: 14, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  loanHeaderLeft: { flex: 1 },
  loanPrincipal: { fontSize: 17, fontWeight: '700', color: '#333' },
  loanMeta: { fontSize: 13, color: '#666', marginTop: 3 },
  loanDue: { fontSize: 12, color: '#FF9500', marginTop: 3, fontWeight: '600' },
  expandIcon: { fontSize: 12, color: '#888', marginLeft: 8 },

  scheduleContainer: { borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  tableScroll: { paddingBottom: 8 },
  tableBlock: { minWidth: 520 },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#007AFF',
    paddingVertical: 8, paddingHorizontal: 10,
  },
  th: { fontSize: 11, fontWeight: '700', color: '#fff', textAlign: 'center' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  tableRowEven: { backgroundColor: '#fafafa' },
  td: { fontSize: 11, color: '#333', textAlign: 'center' },
  totalTd: { color: '#007AFF', fontWeight: '600' },
  colNo: { width: 32 },
  colDate: { flex: 2, textAlign: 'left' },
  colAmt: { flex: 1.5, textAlign: 'right' },
  colPNo: { width: 32 },
  paidTd: { color: '#34C759', fontWeight: '600' },
  partialTd: { color: '#FF9500', fontWeight: '600' },

  paymentTrackerHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 12, backgroundColor: '#f8f9fa',
    borderTopWidth: 2, borderTopColor: '#007AFF',
  },
  paymentTrackerTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBtn: {
    backgroundColor: '#5B5CE6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  shareBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  recordPaymentBtn: {
    backgroundColor: '#34C759', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  recordPaymentBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  paymentTableHeader: {
    flexDirection: 'row', backgroundColor: '#34C759',
    paddingVertical: 8, paddingHorizontal: 10,
  },
  pth: { fontSize: 11, fontWeight: '700', color: '#fff', textAlign: 'center' },
  paymentRow: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },

  loanFooter: {
    padding: 12, backgroundColor: '#f8f9fa',
    borderTopWidth: 1, borderTopColor: '#eee', gap: 4,
  },
  loanFooterText: { fontSize: 13, color: '#666' },
  loanFooterValue: { fontWeight: '700', color: '#333' },

  deleteLoanBtn: {
    margin: 12, marginTop: 4, backgroundColor: '#fff0f0',
    borderRadius: 8, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: '#ffcdd2',
  },
  deleteLoanBtnText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },
});
