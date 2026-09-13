  import React, { useState } from 'react';
  import {
    View, Text, TextInput, TouchableOpacity,
    ScrollView, StyleSheet, Alert,
  } from 'react-native';
  import { Borrower, Loan, Payment } from '../types';
  import { useNotifications } from '../hooks/useNotifications';
  import DatePicker from './DatePicker';

  interface Props {
    initial?: Borrower;
    allowLoanFields?: boolean;
    onSave: (b: Borrower) => void;
    onCancel: () => void;
  }

  function addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  /** Builds the full installment schedule for a new loan in Cutting or Adding EMI mode. */
  function generatePaymentSchedule(
  principal: number,
  rate: number,
  tenure: number,
  startDate: Date,
  repaymentMode: 'cutting' | 'adding' = 'cutting',
): Payment[] {
  const payments: Payment[] = [];
 
  if (repaymentMode === 'cutting') {
    // Interest is deducted upfront and handed to the borrower as a discount,
    // but the borrower still owes the FULL principal back over the tenure.
    const totalDue = principal;
    const totalInterest = totalDue * (rate / 100) * tenure;
    const amountGiven = totalDue - totalInterest; // what's actually disbursed (informational)
 
    // FIX: repayment installments must total the full principal (totalDue),
    // not the discounted disbursed amount (amountGiven).
    const monthlyRepayment = totalDue / tenure;
    const monthlyInterest = totalInterest / tenure; // informational only, already collected upfront
 
    for (let i = 1; i <= tenure; i++) {
      const dueDate = addMonths(startDate, i);
      payments.push({
        id: generateId(),
        dueDate: dueDate.toISOString(),
        dueNumber: i,
        principal: monthlyRepayment,
        interest: monthlyInterest,
        totalAmount: monthlyRepayment,
        remainingAmount: monthlyRepayment,
        delayDays: 0,
        delayInterest: 0,
      });
    }
 
    return payments;
  }
 
  // 'adding' mode: repayment is set on principal + interest combined.
  const totalInterest = principal * (rate / 100) * tenure;
  const monthlyRepayment = principal / tenure;
  const monthlyInterest = totalInterest / tenure;
 
  for (let i = 1; i <= tenure; i++) {
    const dueDate = addMonths(startDate, i);
    const repaymentAmount = monthlyRepayment + monthlyInterest;
 
    payments.push({
      id: generateId(),
      dueDate: dueDate.toISOString(),
      dueNumber: i,
      // FIX: `principal` should hold only the principal portion of this
      // installment (to stay consistent with the 'cutting' branch above),
      // not the combined principal+interest amount.
      principal: monthlyRepayment,
      interest: monthlyInterest,
      totalAmount: repaymentAmount,
      remainingAmount: repaymentAmount,
      delayDays: 0,
      delayInterest: 0,
    });
  }
 
  return payments;
}
  /** Form to create/edit a borrower; optionally attaches a new loan with auto-generated payments. */
  export default function BorrowerForm({ initial, allowLoanFields = false, onSave, onCancel }: Props) {
    const { scheduleRemindersForBorrower } = useNotifications();

    const [name, setName] = useState(initial?.name ?? '');
    const [phone, setPhone] = useState(initial?.phone ?? '');
    const [notes, setNotes] = useState(initial?.notes ?? '');

    // Loan fields
    const [principal, setPrincipal] = useState('');
    const [rate, setRate] = useState('');
    const [tenure, setTenure] = useState('');
    const [loanStartDate, setLoanStartDate] = useState<Date | null>(null);
    const [loanRepaymentMode, setLoanRepaymentMode] = useState<'cutting' | 'adding'>('cutting');
    const [loanNotes, setLoanNotes] = useState('');

    const RATE_PRESETS = ['1.5', '1.75', '2'];

    const handleSave = async () => {
      if (!name.trim()) { Alert.alert('Error', 'Name is required'); return; }
      if (!phone.trim()) { Alert.alert('Error', 'Phone is required'); return; }

      const hasLoanData = principal.trim() || rate.trim() || tenure.trim() || !!loanStartDate;
      let newLoan: Loan | null = null;

      if (hasLoanData) {
        const p = parseFloat(principal);
        const r = parseFloat(rate);
        const t = parseInt(tenure, 10);

        if (!loanStartDate || !principal.trim() || !rate.trim() || !tenure.trim() || isNaN(p) || p <= 0 || isNaN(r) || r <= 0 || isNaN(t) || t <= 0) {
          Alert.alert('Error', 'Principal, interest rate, tenure, and start date are required for every new loan');
          return;
        }

        const nextDueDate = addMonths(loanStartDate, 1);
        const payments = generatePaymentSchedule(p, r, t, loanStartDate, loanRepaymentMode);
        newLoan = {
          id: generateId(),
          principal: p,
          interestRate: r,
          startDate: loanStartDate.toISOString(),
          tenure: t,
          nextDueDate: nextDueDate.toISOString(),
          repaymentMode: loanRepaymentMode,
          notes: loanNotes,
          payments,
        };
      }

      const borrower: Borrower = {
        id: initial?.id ?? generateId(),
        name: name.trim(),
        phone: phone.trim(),
        notes: notes.trim(),
        createdAt: initial?.createdAt ?? new Date().toISOString(),
        loans: newLoan
          ? [...(initial?.loans ?? []), newLoan]
          : (initial?.loans ?? []),
      };

      // Notifications are disabled; storage sync will handle Google Sheets updates.
      await scheduleRemindersForBorrower(borrower);
      // After saving locally, attempt to push this borrower to Google Sheets webapp
      try {
        const url = (globalThis as any).SHEETS_WEBAPP_URL;
        if (url) {
          const sheetsSync = (await import('../services/sheetsSync')).default;
          await sheetsSync.postToSheet(url, { type: 'add_borrower', payload: borrower });
        }
      } catch (e) {
        console.warn('Failed to push borrower to Sheets', e);
      }
      onSave(borrower);
    };

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.pageTitle}>{initial ? 'Edit Client' : 'New Client'}</Text>

        {/* Profile section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>

          <Text style={styles.label}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter full name"
            placeholderTextColor="#aaa"
          />

          <Text style={styles.label}>Phone Number *</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter phone number"
            placeholderTextColor="#aaa"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any additional notes…"
            placeholderTextColor="#aaa"
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Loan section — required when adding a loan to a borrower */}
        {(allowLoanFields || !initial) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add Loan (optional)</Text>

            <Text style={styles.label}>Principal Amount</Text>
            <TextInput
              style={styles.input}
              value={principal}
              onChangeText={setPrincipal}
              placeholder="Enter principal"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Interest Rate (% per month)</Text>
            <TextInput
              style={styles.input}
              value={rate}
              onChangeText={setRate}
              placeholder="Enter rate"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
            <View style={styles.rateRow}>
              {RATE_PRESETS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rateBtn, rate === r && styles.rateBtnActive]}
                  onPress={() => setRate(r)}
                >
                  <Text style={[styles.rateBtnText, rate === r && styles.rateBtnTextActive]}>
                    {r}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Tenure (months)</Text>
            <TextInput
              style={styles.input}
              value={tenure}
              onChangeText={setTenure}
              placeholder="Enter tenure"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />

            <Text style={styles.label}>EMI Mode</Text>
            <View style={styles.modeRow}>
              {(['cutting', 'adding'] as const).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.modeBtn, loanRepaymentMode === mode && styles.modeBtnActive]}
                  onPress={() => setLoanRepaymentMode(mode)}
                >
                  <Text style={[styles.modeBtnText, loanRepaymentMode === mode && styles.modeBtnTextActive]}>
                    {mode === 'cutting' ? 'Cutting' : 'Adding'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <DatePicker
              label="Loan Start Date"
              value={loanStartDate}
              onChange={setLoanStartDate}
              placeholder="Select start date"
            />

            <Text style={styles.label}>Loan Notes</Text>
            <TextInput
              style={styles.input}
              value={loanNotes}
              onChangeText={setLoanNotes}
              placeholder="Purpose, collateral, etc."
              placeholderTextColor="#aaa"
            />
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save Client</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const styles = StyleSheet.create({
    container: { padding: 20, paddingBottom: 40 },
    pageTitle: { fontSize: 24, fontWeight: '700', color: '#333', marginBottom: 20 },
    section: {
      backgroundColor: '#fff', borderRadius: 12, padding: 16,
      marginBottom: 16, shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08,
      shadowRadius: 3, elevation: 3,
    },
    sectionTitle: {
      fontSize: 14, fontWeight: '700', color: '#007AFF',
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
    },
    label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 10 },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    modeBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: '#d1d5db',
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: '#f8fafc',
    },
    modeBtnActive: {
      backgroundColor: '#e0f2fe',
      borderColor: '#38bdf8',
    },
    modeBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#374151',
    },
    modeBtnTextActive: {
      color: '#051219',
    },
    input: {
      borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
      padding: 11, fontSize: 15, backgroundColor: '#fafafa', color: '#333',
    },
    multiline: { height: 80, textAlignVertical: 'top' },
    rateRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    rateBtn: {
      paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20,
      borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f7f7f7',
    },
    rateBtnActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
    rateBtnText: { fontSize: 13, color: '#333', fontWeight: '600' },
    rateBtnTextActive: { color: '#fff' },
    actions: { gap: 10, marginTop: 4 },
    saveBtn: {
      backgroundColor: '#007AFF', borderRadius: 8,
      paddingVertical: 14, alignItems: 'center',
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    cancelBtn: {
      backgroundColor: '#f0f0f0', borderRadius: 8,
      paddingVertical: 14, alignItems: 'center',
    },
    cancelBtnText: { color: '#333', fontSize: 16, fontWeight: '600' },
  });
