import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import DatePicker from '../components/DatePicker';
import { formatCurrency } from '../utils/format';
import SavedParticularPicker from '../components/SavedParticularPicker';
import { SavedParticular, useSavedParticulars } from '../hooks/useSavedParticulars';
import { saveAndShareBinary, XLSX_MIME } from '../utils/exportFile';
import {
  StatementParticular, computeStatement, buildStatementXlsx, statementFileName,
  formatStatementDate, isValidPan,
} from '../utils/statementXlsx';
import { colors, radii } from '../theme/tokens';

interface ParticularForm {
  key: number;
  name: string;
  amount: string;
  rate: string;
  pan: string;
}

const MAX_TENURE_MONTHS = 600;

const toNumber = (s: string) => parseFloat(s.replace(/,/g, ''));
const toPositive = (s: string): number | null => {
  const n = toNumber(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const toTenure = (s: string): number | null => {
  const n = /^\d+$/.test(s.trim()) ? parseInt(s, 10) : NaN;
  return n > 0 && n <= MAX_TENURE_MONTHS ? n : null;
};

let nextKey = 1;
const newParticular = (rate = ''): ParticularForm => ({ key: nextKey++, name: '', amount: '', rate, pan: '' });

/** EMI statement generator: splits a loan across particulars (cutting mode) and exports the Excel statement. */
export default function EmiCalculator() {
  const [clientName, setClientName] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [tenure, setTenure] = useState('');
  const [particulars, setParticulars] = useState<ParticularForm[]>(() => [newParticular()]);
  const [busy, setBusy] = useState(false);
  const saved = useSavedParticulars();
  /** Which particular card the saved-names picker is open for. */
  const [pickerKey, setPickerKey] = useState<number | null>(null);
  /** Cards whose current name/PAN were just saved (shows a tick until they're edited). */
  const [savedKeys, setSavedKeys] = useState<number[]>([]);

  const updateParticular = (key: number, patch: Partial<ParticularForm>) => {
    setParticulars((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    if ('name' in patch || 'pan' in patch) setSavedKeys((keys) => keys.filter((k) => k !== key));
  };

  const handlePick = async (item: SavedParticular) => {
    const key = pickerKey;
    setPickerKey(null);
    if (key === null) return;
    const pan = await saved.getPan(item.id);
    updateParticular(key, { name: item.name, pan: pan ?? '' });
  };

  const handleSaveForReuse = async (p: ParticularForm) => {
    const name = p.name.trim();
    const pan = p.pan.trim().toUpperCase();
    if (!name) { Alert.alert('Error', 'Enter a name to save'); return; }
    if (pan && !isValidPan(pan)) { Alert.alert('Error', 'PAN must look like ABCDE1234F'); return; }
    try {
      const { panSaved } = await saved.save(name, pan);
      setSavedKeys((keys) => [...keys, p.key]);
      if (pan && !panSaved) {
        Alert.alert('Name saved', saved.requiresUnlock ? 'PAN was not saved because the PAN vault was not unlocked.' : 'PAN was not saved: secure storage is not available on this platform.');
      }
    } catch (e) {
      console.warn('Saving particular failed');
      Alert.alert('Error', 'Could not save this name right now.');
    }
  };

  const addParticular = () =>
    setParticulars((list) => [...list, newParticular(list[list.length - 1]?.rate ?? '')]);

  const removeParticular = (key: number) =>
    setParticulars((list) => (list.length > 1 ? list.filter((p) => p.key !== key) : list));

  const handleClear = () => {
    setClientName(''); setDate(null); setTenure(''); setParticulars([newParticular()]); setSavedKeys([]);
  };

  /** Live preview from whatever is filled in and valid so far. */
  const preview = useMemo(() => {
    const months = toTenure(tenure);
    if (!date || !months) return null;
    const ready: StatementParticular[] = [];
    for (const p of particulars) {
      const amount = toPositive(p.amount);
      const ratePct = toPositive(p.rate);
      if (amount && ratePct) ready.push({ name: p.name, amount, ratePct, pan: p.pan });
    }
    if (ready.length === 0) return null;
    return computeStatement({ clientName, date, tenure: months, particulars: ready });
  }, [clientName, date, tenure, particulars]);

  /** Returns the validated statement input, or alerts and returns null. */
  const validate = () => {
    const fail = (msg: string) => { Alert.alert('Error', msg); return null; };
    if (!clientName.trim()) return fail('Please enter the client name');
    if (!date) return fail('Please select the statement date');
    const months = toTenure(tenure);
    if (!months) return fail(`Tenure must be a whole number of months (1-${MAX_TENURE_MONTHS})`);

    const rows: StatementParticular[] = [];
    for (let i = 0; i < particulars.length; i++) {
      const p = particulars[i];
      const label = `Particular ${i + 1}`;
      const amount = toPositive(p.amount);
      const ratePct = toPositive(p.rate);
      const pan = p.pan.trim().toUpperCase();
      if (!p.name.trim()) return fail(`${label}: please enter a name`);
      if (!amount) return fail(`${label}: amount must be a positive number`);
      if (!ratePct || ratePct > 100) return fail(`${label}: monthly interest rate must be between 0 and 100`);
      if (pan && !isValidPan(pan)) return fail(`${label}: PAN must look like ABCDE1234F`);
      rows.push({ name: p.name.trim(), amount, ratePct, pan });
    }
    return { clientName: clientName.trim(), date, tenure: months, particulars: rows };
  };

  const handleGenerate = async () => {
    const input = validate();
    if (!input) return;
    setBusy(true);
    try {
      const bytes = buildStatementXlsx(computeStatement(input));
      await saveAndShareBinary(bytes, statementFileName(input), XLSX_MIME, `${input.clientName} statement`);
    } catch (e) {
      console.warn('Statement export failed', e);
      Alert.alert('Export failed', 'Unable to generate the Excel statement right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Client Name</Text>
          <TextInput style={styles.input} value={clientName} onChangeText={setClientName}
            placeholder="Enter client name" placeholderTextColor={colors.ink3} />
        </View>
        <DatePicker label="Date" value={date} onChange={setDate} placeholder="Select statement date" />
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tenure (months)</Text>
          <TextInput style={styles.input} value={tenure} onChangeText={setTenure}
            placeholder="Enter tenure in months" placeholderTextColor={colors.ink3} keyboardType="numeric" />
          <Text style={styles.hint}>Due dates fall monthly, starting one month after the date.</Text>
        </View>
      </View>

      {particulars.map((p, index) => (
        <View key={p.key} style={styles.form}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Particular {index + 1}</Text>
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => setPickerKey(p.key)} hitSlop={8}>
                <Text style={styles.linkText}>Saved names ▾</Text>
              </TouchableOpacity>
              {particulars.length > 1 && (
                <TouchableOpacity onPress={() => removeParticular(p.key)} hitSlop={8}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={p.name} onChangeText={(v) => updateParticular(p.key, { name: v })}
              placeholder="Particular name" placeholderTextColor={colors.ink3} maxLength={80} />
          </View>
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>Amount</Text>
              <TextInput style={styles.input} value={p.amount} onChangeText={(v) => updateParticular(p.key, { amount: v })}
                placeholder="Loan amount" placeholderTextColor={colors.ink3} keyboardType="numeric" />
            </View>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>Interest (% / month)</Text>
              <TextInput style={styles.input} value={p.rate} onChangeText={(v) => updateParticular(p.key, { rate: v })}
                placeholder="e.g. 1.4" placeholderTextColor={colors.ink3} keyboardType="numeric" />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>PAN No</Text>
            <TextInput style={styles.input} value={p.pan} onChangeText={(v) => updateParticular(p.key, { pan: v.toUpperCase() })}
              placeholder="ABCDE1234F" placeholderTextColor={colors.ink3} autoCapitalize="characters"
              autoCorrect={false} maxLength={10} />
          </View>
          <View style={styles.saveRow}>
            <TouchableOpacity onPress={() => handleSaveForReuse(p)} hitSlop={8}>
              <Text style={styles.linkText}>{savedKeys.includes(p.key) ? '✓ Saved' : 'Save for reuse'}</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              {saved.panSupported
                ? (saved.requiresUnlock
                  ? 'Name syncs to your account; PAN is encrypted with your vault passphrase.'
                  : 'Name syncs to your account; PAN stays on this device only.')
                : 'Name syncs; PAN cannot be saved on this platform.'}
            </Text>
          </View>
        </View>
      ))}

      <SavedParticularPicker
        visible={pickerKey !== null}
        items={saved.items}
        onSelect={handlePick}
        onDelete={(item) => saved.remove(item.id)}
        onClose={() => setPickerKey(null)}
      />

      <TouchableOpacity style={styles.addButton} onPress={addParticular}>
        <Text style={styles.addButtonText}>+ Add particular</Text>
      </TouchableOpacity>

      {preview && (
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Statement preview (cutting mode)</Text>
          {preview.rows.map((r, i) => (
            <View key={i} style={styles.previewRow}>
              <Text style={styles.previewName}>{r.name.trim() || `Particular ${i + 1}`}</Text>
              <PreviewLine label="Amount" value={r.amount} />
              <PreviewLine label={`Interest (${r.ratePct}% x ${preview.input.tenure})`} value={r.interest} />
              <PreviewLine label="Amount received (RTGS)" value={r.rtgs} strong />
              <PreviewLine label="EMI" value={r.emi} />
            </View>
          ))}
          <View style={styles.totals}>
            <PreviewLine label="Total amount" value={preview.totals.amount} />
            <PreviewLine label="Total interest" value={preview.totals.interest} />
            <PreviewLine label="Total RTGS" value={preview.totals.rtgs} strong />
            <PreviewLine label="Total EMI" value={preview.totals.emi} />
            <Text style={styles.dueRange}>
              Due {formatStatementDate(preview.firstDue)}{preview.input.tenure > 1 ? ` to ${formatStatementDate(preview.lastDue)}` : ''}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.calculateButton, busy && styles.disabled]} onPress={handleGenerate} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.calculateButtonText}>Generate Excel</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearButton} onPress={handleClear} disabled={busy}>
          <Text style={styles.clearButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function PreviewLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, strong && { color: colors.success }]}>₹{formatCurrency(value)}</Text>
    </View>
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
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.ink2 },
  hint: { fontSize: 11.5, color: colors.ink3 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    padding: 12, fontSize: 14.5, backgroundColor: colors.surface, color: colors.ink,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  cardActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  linkText: { fontSize: 12.5, fontWeight: '700', color: colors.accent },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  removeText: { fontSize: 12.5, fontWeight: '700', color: colors.danger },
  addButton: {
    borderWidth: 1, borderColor: colors.accentSoftBorder, backgroundColor: colors.accentSoft,
    borderRadius: radii.md, paddingVertical: 12, marginBottom: 16,
  },
  addButtonText: { color: colors.accent, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  previewCard: {
    backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border,
    padding: 16, marginBottom: 16, gap: 12,
  },
  previewTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  previewRow: { gap: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  previewName: { fontSize: 13.5, fontWeight: '700', color: colors.accent, marginBottom: 2 },
  totals: { gap: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  lineLabel: { fontSize: 12, color: colors.ink2, flexShrink: 1 },
  lineValue: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  dueRange: { marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.ink2 },
  buttonContainer: { flexDirection: 'row', gap: 8 },
  calculateButton: { backgroundColor: colors.accent, paddingVertical: 12, borderRadius: radii.md, flex: 1, justifyContent: 'center' },
  calculateButtonText: { color: '#fff', fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.7 },
  clearButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, borderRadius: radii.md, flex: 1 },
  clearButtonText: { color: colors.ink, fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
});
