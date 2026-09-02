import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Borrower } from '../types';
import { useStorage } from '../hooks/useStorage';
import { useNotifications } from '../hooks/useNotifications';
import RefreshButton from './RefreshButton';
import BorrowerDetail from './BorrowerDetail';
import BorrowerForm from './BorrowerForm';
interface Props {
  /** Pre-select a borrower when navigating from Due Payments or Dashboard. */
  initialSelectedId?: string | null;
  onSelectedClientHandled?: () => void;
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
        <ActivityIndicator size="large" color="#007AFF" />
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
          placeholderTextColor="#aaa"
        />
        <RefreshButton compact />
        <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No clients yet</Text>
          <Text style={styles.emptySubtitle}>Tap + Add to create your first borrower profile</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={b => b.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
              <View style={styles.cardAvatar}>
                <Text style={styles.cardAvatarText}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardPhone}>{item.phone}</Text>
                <Text style={styles.cardLoans}>
                  {item.loans.length} loan{item.loans.length !== 1 ? 's' : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item)}
              >
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  search: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 10, fontSize: 15, backgroundColor: '#fafafa', color: '#333',
  },
  addButton: {
    backgroundColor: '#007AFF', borderRadius: 8,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 3,
  },
  cardAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  cardAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cardBody: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#333' },
  cardPhone: { fontSize: 13, color: '#666', marginTop: 2 },
  cardLoans: { fontSize: 12, color: '#007AFF', marginTop: 4, fontWeight: '600' },
  deleteBtn: { padding: 8 },
  deleteBtnText: { color: '#FF3B30', fontSize: 16, fontWeight: '700' },
});
