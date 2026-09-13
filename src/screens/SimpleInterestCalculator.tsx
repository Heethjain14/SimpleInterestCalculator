import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
} from 'react-native';
import DatePicker from '../components/DatePicker';
import ShareResultCard from '../components/ShareResultCard';
import { formatCurrency } from '../utils/format';

export interface CalculationResult {
  principal: number;
  interestRate: number;
  startDate: Date;
  endDate: Date;
  days: number;
  interest: number;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function calculateSimpleInterest(principal: number, ratePercent: number, days: number): number {
  return (principal * ratePercent * days) / 3000;
}

const RATE_PRESETS = [1.5, 1.75, 2];
const PRESET_STRINGS = RATE_PRESETS.map(String);

/** Simple interest calculator tab with shareable result card. */
export default function SimpleInterestCalculator() {
  const [principal, setPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);

  const validate = () => {
    if (!principal || !interestRate || !startDate || !endDate) {
      Alert.alert('Error', 'Please fill in all fields'); return false;
    }
    if (isNaN(parseFloat(principal)) || parseFloat(principal) <= 0) {
      Alert.alert('Error', 'Principal must be a positive number'); return false;
    }
    if (isNaN(parseFloat(interestRate)) || parseFloat(interestRate) <= 0) {
      Alert.alert('Error', 'Interest rate must be a positive number'); return false;
    }
    if (startDate > endDate) {
      Alert.alert('Error', 'Start date must be before end date'); return false;
    }
    return true;
  };

  const handleCalculate = () => {
    if (!validate()) return;
    const p = parseFloat(principal);
    const r = parseFloat(interestRate);
    const days = daysBetween(startDate!, endDate!);
    setResult({
      principal: p, interestRate: r, startDate: startDate!, endDate: endDate!,
      days, interest: calculateSimpleInterest(p, r, days),
    });
  };

  const handleClear = () => {
    setPrincipal(''); setInterestRate('');
    setStartDate(null); setEndDate(null); setResult(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Principal Amount</Text>
          <TextInput style={styles.input} value={principal} onChangeText={setPrincipal}
            placeholder="Enter principal amount" placeholderTextColor="#aaa" keyboardType="numeric" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Interest Rate (%)</Text>
          <TextInput style={styles.input} value={interestRate} onChangeText={setInterestRate}
            placeholder="Enter interest rate" placeholderTextColor="#aaa" keyboardType="numeric" />
          <View style={styles.rateButtonsRow}>
            {RATE_PRESETS.map(r => {
              const label = String(r);
              const selected = interestRate === label;
              return (
                <TouchableOpacity key={label} style={[styles.rateButton, selected && styles.rateButtonSelected]} onPress={() => setInterestRate(label)}>
                  <Text style={[styles.rateButtonText, selected && styles.rateButtonTextSelected]}>{label}%</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.rateButton, interestRate.length > 0 && !PRESET_STRINGS.includes(interestRate) && styles.rateButtonSelected]}
              onPress={() => setInterestRate('')}
            >
              <Text style={[styles.rateButtonText, interestRate.length > 0 && !PRESET_STRINGS.includes(interestRate) && styles.rateButtonTextSelected]}>Custom</Text>
            </TouchableOpacity>
          </View>
        </View>
        <DatePicker label="Start Date" value={startDate} onChange={setStartDate} placeholder="Select start date" />
        <DatePicker label="End Date" value={endDate} onChange={setEndDate} placeholder="Select end date" />
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.calculateButton} onPress={handleCalculate}>
            <Text style={styles.calculateButtonText}>Calculate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>
      {result && <ShareResultCard result={result} />}
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
});
