import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
} from 'react-native';
import DatePicker from '../components/DatePicker';
import { formatCurrency, formatDate } from '../utils/format';
import { colors, radii } from '../theme/tokens';

export interface EMIRow {
  installmentNo: number;
  date: Date;
  remainingPrincipal: number;
  monthlyInterest: number;
}

type EMIMode = 'cutting' | 'adding';

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

const RATE_PRESETS = [1.5, 1.75, 2];
const PRESET_STRINGS = RATE_PRESETS.map(String);

/** EMI schedule generator tab with Cutting and Adding modes. */
export default function EmiCalculator() {
  const [emiPrincipal, setEmiPrincipal] = useState('');
  const [emiRate, setEmiRate] = useState('');
  const [emiStartDate, setEmiStartDate] = useState<Date | null>(null);
  const [emiTenure, setEmiTenure] = useState('');
  const [emiMode, setEmiMode] = useState<EMIMode>('cutting');
  const [emiEndDate, setEmiEndDate] = useState<Date | null>(null);
  const [emiSchedule, setEmiSchedule] = useState<EMIRow[] | null>(null);
  const [totalInterest, setTotalInterest] = useState(0);

  const handleTenureChange = (val: string) => {
    setEmiTenure(val);
    setEmiSchedule(null);
    const months = parseInt(val);
    setEmiEndDate(emiStartDate && !isNaN(months) && months > 0 ? addMonths(emiStartDate, months) : null);
  };

  const handleEmiStartDateChange = (date: Date) => {
    setEmiStartDate(date);
    setEmiSchedule(null);
    const months = parseInt(emiTenure);
    setEmiEndDate(!isNaN(months) && months > 0 ? addMonths(date, months) : null);
  };

  const validateEmi = () => {
    if (!emiPrincipal || !emiRate || !emiStartDate || !emiTenure) {
      Alert.alert('Error', 'Please fill in all fields'); return false;
    }
    if (isNaN(parseFloat(emiPrincipal)) || parseFloat(emiPrincipal) <= 0) {
      Alert.alert('Error', 'Principal must be a positive number'); return false;
    }
    if (isNaN(parseFloat(emiRate)) || parseFloat(emiRate) <= 0) {
      Alert.alert('Error', 'Interest rate must be a positive number'); return false;
    }
    if (isNaN(parseInt(emiTenure)) || parseInt(emiTenure) <= 0) {
      Alert.alert('Error', 'Tenure must be a positive number of months'); return false;
    }
    return true;
  };

  const handleEmiCalculate = () => {
    if (!validateEmi()) return;
    const p = parseFloat(emiPrincipal);
    const r = parseFloat(emiRate);
    const months = parseInt(emiTenure);
    const schedule: EMIRow[] = [];

    if (emiMode === 'cutting') {
      const totalInterestValue = p * (r / 100) * months;
      const monthlyRepayment = p / months;

      for (let i = 1; i <= months; i++) {
        schedule.push({
          installmentNo: i,
          date: addMonths(emiStartDate!, i),
          remainingPrincipal: monthlyRepayment,
          monthlyInterest: 0,
        });
      }

      setEmiSchedule(schedule);
      setTotalInterest(totalInterestValue);
      return;
    }

    const totalInterestValue = p * (r / 100) * months;
    const monthlyRepayment = p / months;
    const monthlyInterest = totalInterestValue / months;

    for (let i = 1; i <= months; i++) {
      schedule.push({
        installmentNo: i,
        date: addMonths(emiStartDate!, i),
        remainingPrincipal: monthlyRepayment + monthlyInterest,
        monthlyInterest,
      });
    }

    setEmiSchedule(schedule);
    setTotalInterest(totalInterestValue);
  };

  const handleEmiClear = () => {
    setEmiPrincipal(''); setEmiRate(''); setEmiStartDate(null);
    setEmiTenure(''); setEmiEndDate(null); setEmiSchedule(null); setTotalInterest(0);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Principal Amount</Text>
          <TextInput style={styles.input} value={emiPrincipal} onChangeText={setEmiPrincipal}
            placeholder="Enter principal amount" placeholderTextColor={colors.ink3} keyboardType="numeric" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Interest Rate (% per month)</Text>
          <TextInput style={styles.input} value={emiRate} onChangeText={setEmiRate}
            placeholder="Enter monthly interest rate" placeholderTextColor={colors.ink3} keyboardType="numeric" />
          <View style={styles.rateButtonsRow}>
            {RATE_PRESETS.map(r => {
              const label = String(r);
              const selected = emiRate === label;
              return (
                <TouchableOpacity key={label} style={[styles.rateButton, selected && styles.rateButtonSelected]} onPress={() => setEmiRate(label)}>
                  <Text style={[styles.rateButtonText, selected && styles.rateButtonTextSelected]}>{label}%</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.rateButton, emiRate.length > 0 && !PRESET_STRINGS.includes(emiRate) && styles.rateButtonSelected]}
              onPress={() => setEmiRate('')}
            >
              <Text style={[styles.rateButtonText, emiRate.length > 0 && !PRESET_STRINGS.includes(emiRate) && styles.rateButtonTextSelected]}>Custom</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>EMI Mode</Text>
          <View style={styles.modeRow}>
            {(['cutting', 'adding'] as const).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.modeButton, emiMode === mode && styles.modeButtonSelected]}
                onPress={() => setEmiMode(mode)}
              >
                <Text style={[styles.modeButtonText, emiMode === mode && styles.modeButtonTextSelected]}>
                  {mode === 'cutting' ? 'Cutting' : 'Adding'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <DatePicker label="Start Date" value={emiStartDate} onChange={handleEmiStartDateChange} placeholder="Select start date" />
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tenure (months)</Text>
          <TextInput style={styles.input} value={emiTenure} onChangeText={handleTenureChange}
            placeholder="Enter tenure in months" placeholderTextColor={colors.ink3} keyboardType="numeric" />
        </View>
        {emiEndDate && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>End Date (auto calculated)</Text>
            <View style={styles.readonlyField}>
              <Text style={styles.readonlyText}>{formatDate(emiEndDate)}</Text>
              <Text style={styles.readonlyBadge}>Auto</Text>
            </View>
          </View>
        )}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.calculateButton} onPress={handleEmiCalculate}>
            <Text style={styles.calculateButtonText}>Generate Schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearButton} onPress={handleEmiClear}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      {emiSchedule && (
        <>
          <View style={styles.tableWrap}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.colNo]}>#</Text>
              <Text style={[styles.th, styles.colDate]}>Date</Text>
              <Text style={[styles.th, styles.colAmt]}>Principal</Text>
              <Text style={[styles.th, styles.colAmt]}>Interest</Text>
            </View>
            {emiSchedule.map((row, index) => (
              <View key={row.installmentNo} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
                <Text style={[styles.td, styles.colNo]}>{row.installmentNo}</Text>
                <Text style={[styles.td, styles.colDate]}>{formatDate(row.date)}</Text>
                <Text style={[styles.td, styles.colAmt]}>₹{formatCurrency(row.remainingPrincipal)}</Text>
                <Text style={[styles.td, styles.colAmt, styles.interestValue]}>₹{formatCurrency(row.monthlyInterest)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Principal</Text>
              <Text style={styles.summaryValue}>₹{formatCurrency(parseFloat(emiPrincipal))}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total interest</Text>
              <Text style={[styles.summaryValue, { color: colors.accent }]}>₹{formatCurrency(totalInterest)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{emiMode === 'adding' ? 'Total payable' : 'Total due'}</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                ₹{formatCurrency(emiMode === 'adding' ? parseFloat(emiPrincipal) + totalInterest : parseFloat(emiPrincipal))}
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingBottom: 30 },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  inputGroup: { gap: 7 },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.ink2 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    padding: 12, fontSize: 14.5, backgroundColor: colors.surface, color: colors.ink,
  },
  readonlyField: {
    borderWidth: 1, borderColor: colors.accentSoftBorder, borderRadius: radii.md, padding: 12,
    backgroundColor: colors.accentSoft, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  readonlyText: { fontSize: 14.5, color: colors.accent, fontWeight: '700' },
  readonlyBadge: {
    fontSize: 10.5, color: '#fff', backgroundColor: colors.accent,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, fontWeight: '700',
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: {
    flex: 1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 11, alignItems: 'center', backgroundColor: colors.surface,
  },
  modeButtonSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  modeButtonText: { fontSize: 13.5, color: colors.ink2, fontWeight: '700' },
  modeButtonTextSelected: { color: colors.accent },
  rateButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  rateButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rateButtonSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  rateButtonText: { fontSize: 13, color: colors.ink2, fontWeight: '700' },
  rateButtonTextSelected: { color: '#fff' },
  buttonContainer: { flexDirection: 'row', gap: 8 },
  calculateButton: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: radii.md, flex: 1 },
  calculateButtonText: { color: '#fff', fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  clearButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, borderRadius: radii.md, flex: 1 },
  clearButtonText: { color: colors.ink, fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  tableWrap: {
    backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden', marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  tableHeader: { flexDirection: 'row', backgroundColor: colors.accentSoft, paddingVertical: 9, paddingHorizontal: 8 },
  th: { fontSize: 11, fontWeight: '700', color: colors.accent, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: colors.border },
  tableRowEven: { backgroundColor: colors.bg },
  td: { fontSize: 12, color: colors.ink, textAlign: 'center' },
  interestValue: { color: colors.ink2 },
  colNo: { width: 26 },
  colDate: { flex: 2, textAlign: 'left' },
  colAmt: { flex: 2, textAlign: 'right' },
  summaryCard: {
    flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radii.xl,
    borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 20,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 10.5, color: colors.ink2, marginBottom: 4, fontWeight: '600' },
  summaryValue: { fontSize: 13, fontWeight: '700', color: colors.ink },
});
