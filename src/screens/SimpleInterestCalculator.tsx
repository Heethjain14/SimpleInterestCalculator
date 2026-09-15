import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
} from 'react-native';
import DatePicker from '../components/DatePicker';
import ShareResultCard from '../components/ShareResultCard';
import { colors, radii } from '../theme/tokens';

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
            placeholder="Enter principal amount" placeholderTextColor={colors.ink3} keyboardType="numeric" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Interest Rate (%)</Text>
          <TextInput style={styles.input} value={interestRate} onChangeText={setInterestRate}
            placeholder="Enter interest rate" placeholderTextColor={colors.ink3} keyboardType="numeric" />
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
});
