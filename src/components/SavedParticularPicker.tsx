import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SavedParticular } from '../hooks/useSavedParticulars';
import { colors, radii } from '../theme/tokens';

interface Props {
  visible: boolean;
  items: SavedParticular[];
  onSelect: (item: SavedParticular) => void;
  onDelete: (item: SavedParticular) => void;
  onClose: () => void;
}

/** Searchable list of saved names. Shows only whether a PAN is saved, never the PAN itself. */
export default function SavedParticularPicker({ visible, items, onSelect, onDelete, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const close = () => {
    setQuery('');
    setConfirmingId(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        {/* Inner Pressable swallows taps so touching the sheet doesn't dismiss it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Saved names</Text>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.ink3}
            autoCorrect={false}
          />
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {items.length === 0 && <Text style={styles.empty}>No saved names yet. Fill in a particular and tap "Save for reuse".</Text>}
            {items.length > 0 && shown.length === 0 && <Text style={styles.empty}>No matches.</Text>}
            {shown.map((item) => (
              <View key={item.id} style={styles.row}>
                <TouchableOpacity style={styles.rowMain} onPress={() => { setConfirmingId(null); setQuery(''); onSelect(item); }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.badge, item.hasPan ? styles.badgeOn : styles.badgeOff]}>
                    {item.hasPan ? 'PAN saved' : 'No PAN saved'}
                  </Text>
                </TouchableOpacity>
                {confirmingId === item.id ? (
                  <TouchableOpacity onPress={() => { setConfirmingId(null); onDelete(item); }} hitSlop={8}>
                    <Text style={styles.confirmText}>Confirm?</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setConfirmingId(item.id)} hitSlop={8}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.closeButton} onPress={close}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,17,22,0.45)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, maxHeight: '80%', gap: 12 },
  title: { fontSize: 15, fontWeight: '800', color: colors.ink },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    padding: 11, fontSize: 14, color: colors.ink, backgroundColor: colors.surface,
  },
  list: { flexGrow: 0 },
  empty: { fontSize: 12.5, color: colors.ink2, paddingVertical: 12, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, gap: 3 },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  badge: { fontSize: 11, fontWeight: '600' },
  badgeOn: { color: colors.success },
  badgeOff: { color: colors.ink3 },
  deleteText: { fontSize: 12.5, fontWeight: '700', color: colors.ink2 },
  confirmText: { fontSize: 12.5, fontWeight: '800', color: colors.danger },
  closeButton: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingVertical: 11,
  },
  closeText: { textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.ink },
});
