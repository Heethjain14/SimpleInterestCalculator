import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import ViewShot, { captureRef, ViewShotRef } from 'react-native-view-shot';
import { CalculationResult } from '../screens/SimpleInterestCalculator';

interface Props {
  result: CalculationResult;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Renders a shareable PNG card for simple interest results using ViewShot + expo-sharing. */
export default function ShareResultCard({ result }: Props) {
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<ViewShotRef>(null);

  const totalAmount = result.principal + result.interest;

  const rows: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Principal Amount', value: `₹${formatCurrency(result.principal)}` },
    { label: 'Interest Rate', value: `${result.interestRate}% per month` },
    { label: 'Start Date', value: formatDate(result.startDate) },
    { label: 'End Date', value: formatDate(result.endDate) },
    { label: 'Number of Days', value: `${result.days} days` },
    { label: 'Interest Earned', value: `₹${formatCurrency(result.interest)}` },
    { label: 'Total Amount', value: `₹${formatCurrency(totalAmount)}`, highlight: true },
  ];

  const handleShare = async () => {
    setSharing(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'Your device does not support sharing.');
        return;
      }

      // Capture the card as a PNG image
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share Interest Calculation',
      });
    } catch (e) {
      Alert.alert('Error', 'Could not share the result. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View>
      {/* ViewShot wraps only the card visuals, not the button */}
      <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.title}>Simple Interest Calculation</Text>
          </View>

          {rows.map(({ label, value, highlight }) => (
            <View key={label} style={[styles.row, highlight && styles.rowHighlight]}>
              <Text style={[styles.rowLabel, highlight && styles.rowLabelHighlight]}>
                {label}
              </Text>
              <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]}>
                {value}
              </Text>
            </View>
          ))}

          <View style={styles.cardFooter}>
            <Text style={styles.footerText}>Simple Interest Calculator</Text>
          </View>
        </View>
      </ViewShot>

      {/* Share button is outside ViewShot so it won't appear in the snapshot */}
      <TouchableOpacity
        style={[styles.shareButton, sharing && styles.shareButtonDisabled]}
        onPress={handleShare}
        disabled={sharing}
      >
        <Text style={styles.shareButtonText}>
          {sharing ? 'Capturing…' : '⬆ Share as Image'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    marginBottom: 12,
  },
  cardHeader: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowHighlight: {
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 20,
    marginTop: 4,
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 15,
    color: '#666',
    flex: 1,
  },
  rowLabelHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  rowValueHighlight: {
    fontSize: 17,
    fontWeight: '700',
    color: '#007AFF',
  },
  cardFooter: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerText: {
    fontSize: 12,
    color: '#aaa',
  },
  shareButton: {
    backgroundColor: '#34C759',
    paddingVertical: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
