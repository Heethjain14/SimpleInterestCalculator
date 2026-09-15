import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useStorageContext, RefreshResult } from '../context/StorageContext';

interface Props {
  compact?: boolean;
}

type RefreshFailure = Extract<RefreshResult, { ok: false }>;

const ERROR_MESSAGES: Record<RefreshFailure['reason'], string> = {
  no_url: 'API server URL is not configured in app.json.',
  network: 'Network error while contacting the API server.',
  invalid_response: 'The API server returned an unexpected response format.',
  api_error: 'The API server reported an error. Check that it is running and reachable.',
};

/** Pulls the latest borrower data from the API server with user feedback. */
export default function RefreshButton({ compact }: Props) {
  const { refreshFromServer } = useStorageContext();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    const result = await refreshFromServer();
    setRefreshing(false);

    if (__DEV__) {
      console.log('[RefreshButton] Refresh result:', result);
    }

    if (result.ok) {
      Alert.alert(
        'Refresh complete',
        result.count === 0
          ? 'Connected successfully. No borrowers found on the server yet.'
          : `Loaded ${result.count} borrower${result.count !== 1 ? 's' : ''} from the server.`,
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
        <Text style={styles.text}>{compact ? '↻' : 'Refresh'}</Text>
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
