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
import { colors, radii } from '../theme/tokens';

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

/** Renders a shareable PNG result card for simple interest results using ViewShot + expo-sharing. */
export default function ShareResultCard({ result }: Props) {
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<ViewShotRef>(null);

  const totalAmount = result.principal + result.interest;

  const handleShare = async () => {
    setSharing(true);
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'Your device does not support sharing.');
        return;
      }

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
          <Text style={styles.resultLabel}>Interest earned</Text>
          <Text style={styles.resultValue}>₹{formatCurrency(result.interest)}</Text>
          <Text style={styles.rangeText}>
            {result.interestRate}%/month · {formatDate(result.startDate)} – {formatDate(result.endDate)}
          </Text>

          <View style={styles.footer}>
            <View style={styles.footerItem}>
              <Text style={styles.footerLabel}>Days</Text>
              <Text style={styles.footerValue}>{result.days}</Text>
            </View>
            <View style={styles.footerItem}>
              <Text style={styles.footerLabel}>Principal</Text>
              <Text style={styles.footerValue}>₹{formatCurrency(result.principal)}</Text>
            </View>
            <View style={styles.footerItem}>
              <Text style={styles.footerLabel}>Total</Text>
              <Text style={[styles.footerValue, { color: colors.success }]}>₹{formatCurrency(totalAmount)}</Text>
            </View>
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
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentSoftBorder,
    borderRadius: radii.xl,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  resultValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  rangeText: {
    fontSize: 12,
    color: colors.ink2,
    marginTop: 6,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.accentSoftBorder,
  },
  footerItem: { flex: 1, alignItems: 'center' },
  footerLabel: { fontSize: 10.5, color: colors.ink2, marginBottom: 3, fontWeight: '600' },
  footerValue: { fontSize: 13, fontWeight: '700', color: colors.ink },
  shareButton: {
    backgroundColor: colors.success,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: 20,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
