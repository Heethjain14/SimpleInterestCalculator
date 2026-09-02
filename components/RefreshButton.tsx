import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useStorageContext, RefreshResult } from '../context/StorageContext';

interface Props {
  compact?: boolean;
}

type RefreshFailure = Extract<RefreshResult, { ok: false }>;

const ERROR_MESSAGES: Record<RefreshFailure['reason'], string> = {
  no_url: 'Google Sheets URL is not configured in app.json.',
  network: 'Network error while contacting Google Sheets.',
  invalid_response: 'Sheets returned an unexpected response format.',
  api_error: 'Sheets API reported an error. Check your Apps Script deployment.',
};

/** Pulls latest borrower data from Google Sheets with user feedback. */
export default function RefreshButton({ compact }: Props) {
  const { refreshFromSheet } = useStorageContext();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    const result = await refreshFromSheet();
    setRefreshing(false);

    if (__DEV__) {
      console.log('[RefreshButton] Refresh result:', result);
    }

    if (result.ok) {
      Alert.alert(
        'Refresh complete',
        result.count === 0
          ? 'Connected successfully. No borrower sheets found in the workbook yet.'
          : `Loaded ${result.count} borrower${result.count !== 1 ? 's' : ''} from Google Sheets.`,
      );
      return;
    }

    Alert.alert('Refresh failed', ERROR_MESSAGES[result.reason]);
  };

  return (
    <TouchableOpacity
      style={[styles.button, compact && styles.compact]}
      onPress={handleRefresh}
      disabled={refreshing}
    >
      {refreshing ? (
        <ActivityIndicator size="small" color="#1d4ed8" />
      ) : (
        <Text style={styles.text}>{compact ? '↻' : 'Refresh Sheets'}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#eaf2ff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cfe0ff',
  },
  compact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  text: { color: '#1d4ed8', fontWeight: '700', fontSize: 14 },
});
