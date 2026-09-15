import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Borrower } from '../types';
import { useStorage } from '../hooks/useStorage';
import { useNotifications } from '../hooks/useNotifications';
import RefreshButton from '../components/RefreshButton';
import BorrowerDetail from './BorrowerDetail';
import BorrowerForm from '../components/BorrowerForm';
import { isPaymentOverdue } from '../utils/duePayments';
import { colors, radii, priorityColor } from '../theme/tokens';

interface Props {
  /** Pre-select a borrower when navigating from Due Payments or Dashboard. */
  initialSelectedId?: string | null;
  onSelectedClientHandled?: () => void;
}

/** Worst-case days-overdue across a borrower's installments, or null if none are overdue. */
function maxOverdueDays(borrower: Borrower): number | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let worst: number | null = null;
  for (const loan of borrower.loans) {
    for (const payment of loan.payments ?? []) {
      if (!isPaymentOverdue(payment, today)) continue;
      const due = new Date(payment.dueDate);
      due.setHours(0, 0, 0, 0);
      const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
      if (worst === null || days > worst) worst = days;
    }
  }
  return worst;
}

/** Client list with search, Sheets refresh, and navigation to detail/form views. */
export default function BorrowerList({ initialSelectedId, onSelectedClientHandled }: Props) {
  const { borrowers, loading, saveBorrower, deleteBorrower } = useStorage();
  const { cancelRemindersForBorrower } = useNotifications();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Borrower | null>(null);
  const [editing, setEditing] = useState<Borrower | null>(null);

  React.useEffect(() => {
    if (initialSelectedId && borrowers.length > 0) {
      const match = borrowers.find(b => b.id === initialSelectedId);
      if (match) {
        setSelected(match);
        onSelectedClientHandled?.();
      }
    }
  }, [initialSelectedId, borrowers, onSelectedClientHandled]);

  const filtered = borrowers.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.phone.includes(search)
  );

  const handleDelete = (b: Borrower) => {
    Alert.alert(
      'Delete Borrower',
      `Remove ${b.name} and all their loans?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await cancelRemindersForBorrower(b.id);
            await deleteBorrower(b.id);
            if (selected?.id === b.id) setSelected(null);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  // Show detail view
  if (selected) {
    return (
      <BorrowerDetail
        borrower={selected}
        onBack={() => setSelected(null)}
        onEdit={(b) => { setEditing(b); setSelected(null); setShowForm(true); }}
        onSave={saveBorrower}
      />
    );
  }

  // Show add/edit form
  if (showForm) {
    return (
      <BorrowerForm
        initial={editing ?? undefined}
        onSave={async (b) => {
          await saveBorrower(b);
          setShowForm(false);
          setEditing(null);
        }}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Search + Add */}
      <View style={styles.topRow}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or phone…"
          placeholderTextColor={colors.ink3}
        />
        <RefreshButton compact />
        <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No clients yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to create your first borrower profile</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={b => b.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => {
            const overdueDays = maxOverdueDays(item);
            return (
              <TouchableOpacity
                style={[styles.row, index === filtered.length - 1 && styles.rowLast]}
                onPress={() => setSelected(item)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowSub}>
                    {item.phone} · {item.loans.length} loan{item.loans.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                {overdueDays !== null && (
                  <View style={[styles.dot, { backgroundColor: priorityColor(overdueDays) }]} />
                )}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(item)}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  search: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    padding: 11, fontSize: 14.5, backgroundColor: colors.surface, color: colors.ink,
  },
  addButton: {
    width: 42, height: 42, borderRadius: radii.md,
    backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '800', fontSize: 20, lineHeight: 22 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  emptySubtitle: { fontSize: 13.5, color: colors.ink2, textAlign: 'center' },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  deleteBtn: { paddingLeft: 6, paddingVertical: 4 },
  deleteBtnText: { color: colors.ink3, fontSize: 14, fontWeight: '700' },
});
