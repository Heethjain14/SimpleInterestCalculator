import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
} from 'react-native';
import DatePicker from '../components/DatePicker';
import { formatCurrency, formatDate } from '../utils/format';

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
            placeholder="Enter principal amount" placeholderTextColor="#aaa" keyboardType="numeric" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Interest Rate (% per month)</Text>
          <TextInput style={styles.input} value={emiRate} onChangeText={setEmiRate}
            placeholder="Enter monthly interest rate" placeholderTextColor="#aaa" keyboardType="numeric" />
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

        <DatePicker label="Start Date" value={emiStartDate} onChange={handleEmiStartDateChange} placeholder="Select start date" />
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tenure (months)</Text>
          <TextInput style={styles.input} value={emiTenure} onChangeText={handleTenureChange}
            placeholder="Enter tenure in months" placeholderTextColor="#aaa" keyboardType="numeric" />
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
        <View style={styles.scheduleCard}>
          <Text style={styles.scheduleTitle}>EMI Schedule</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colNo]}>#</Text>
            <Text style={[styles.tableHeaderText, styles.colDate]}>Date</Text>
            <Text style={[styles.tableHeaderText, styles.colPrincipal]}>Principal</Text>
            <Text style={[styles.tableHeaderText, styles.colInterest]}>Interest</Text>
          </View>
          {emiSchedule.map((row, index) => (
            <View key={row.installmentNo} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
              <Text style={[styles.tableCell, styles.colNo]}>{row.installmentNo}</Text>
              <Text style={[styles.tableCell, styles.colDate]}>{formatDate(row.date)}</Text>
              <Text style={[styles.tableCell, styles.colPrincipal]}>₹{formatCurrency(row.remainingPrincipal)}</Text>
              <Text style={[styles.tableCell, styles.colInterest, styles.interestValue]}>₹{formatCurrency(row.monthlyInterest)}</Text>
            </View>
          ))}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Principal</Text>
              <Text style={styles.summaryValue}>₹{formatCurrency(parseFloat(emiPrincipal))}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Interest</Text>
              <Text style={[styles.summaryValue, styles.summaryInterest]}>₹{formatCurrency(totalInterest)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>{emiMode === 'adding' ? 'Total Payable' : 'Total Due'}</Text>
              <Text style={[styles.summaryValue, styles.summaryTotal]}>
                ₹{formatCurrency(emiMode === 'adding' ? parseFloat(emiPrincipal) + totalInterest : parseFloat(emiPrincipal))}
              </Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, paddingBottom: 30 },
  form: {
    backgroundColor: '#fff', borderRadius: 12, padding: 20, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5,
  },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, fontSize: 16, backgroundColor: '#fafafa', color: '#333',
  },
  readonlyField: {
    borderWidth: 1, borderColor: '#c8e6c9', borderRadius: 8, padding: 12,
    backgroundColor: '#f1f8f1', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  readonlyText: { fontSize: 16, color: '#2e7d32', fontWeight: '600' },
  readonlyBadge: {
    fontSize: 11, color: '#fff', backgroundColor: '#43a047',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontWeight: '700',
  },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  modeButton: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db',
    paddingVertical: 10, alignItems: 'center', backgroundColor: '#f8fafc',
  },
  modeButtonSelected: { backgroundColor: '#e0f2fe', borderColor: '#38bdf8' },
  modeButtonText: { fontSize: 14, color: '#374151', fontWeight: '600' },
  modeButtonTextSelected: { color: '#0369a1' },
  rateButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 10 },
  rateButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f7f7f7' },
  rateButtonSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  rateButtonText: { fontSize: 14, color: '#333', fontWeight: '600' },
  rateButtonTextSelected: { color: '#fff' },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  calculateButton: { backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, flex: 1, marginRight: 10 },
  calculateButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  clearButton: { backgroundColor: '#FF3B30', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, flex: 1, marginLeft: 10 },
  clearButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  scheduleCard: {
    backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5,
  },
  scheduleTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', padding: 16, textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#007AFF', paddingVertical: 10, paddingHorizontal: 8 },
  tableHeaderText: { fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  tableRowEven: { backgroundColor: '#fafafa' },
  tableCell: { fontSize: 12, color: '#333', textAlign: 'center' },
  interestValue: { color: '#007AFF', fontWeight: '600' },
  colNo: { width: 28 },
  colDate: { flex: 2, textAlign: 'left' },
  colPrincipal: { flex: 2, textAlign: 'right' },
  colInterest: { flex: 2, textAlign: 'right' },
  summaryRow: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderTopWidth: 2, borderTopColor: '#007AFF', padding: 16 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#ddd', marginVertical: 4 },
  summaryLabel: { fontSize: 11, color: '#888', marginBottom: 4, fontWeight: '500' },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#333' },
  summaryInterest: { color: '#007AFF' },
  summaryTotal: { color: '#34C759' },
});
