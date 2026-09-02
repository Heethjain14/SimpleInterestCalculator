import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useStorageContext } from '../context/StorageContext';
import { computePortfolioMetrics } from '../utils/portfolioMetrics';
import { formatCurrency } from '../utils/format';
import RefreshButton from './RefreshButton';

interface MetricCardProps {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}

function MetricCard({ label, value, accent, sub }: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent ? { color: accent } : null]}>{value}</Text>
      {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
    </View>
  );
}

/** Portfolio dashboard with exposure, weighted rate, and collection metrics. */
export default function Dashboard() {
  const { borrowers, loading } = useStorageContext();

  const metrics = useMemo(() => computePortfolioMetrics(borrowers), [borrowers]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Portfolio Overview</Text>
        <RefreshButton compact />
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Total Exposure</Text>
        <Text style={styles.heroValue}>₹{formatCurrency(metrics.totalExposure)}</Text>
        <Text style={styles.heroSub}>
          Weighted avg rate: {metrics.weightedAvgRate.toFixed(2)}% / month
        </Text>
      </View>

      <View style={styles.grid}>
        <MetricCard
          label="Outstanding"
          value={`₹${formatCurrency(metrics.totalOutstanding)}`}
          accent="#FF9500"
          sub="Yet to be collected"
        />
        <MetricCard
          label="Collected"
          value={`₹${formatCurrency(metrics.totalCollected)}`}
          accent="#34C759"
          sub={`${metrics.collectionRate.toFixed(1)}% collection rate`}
        />
        <MetricCard
          label="Overdue"
          value={`₹${formatCurrency(metrics.overdueAmount)}`}
          accent="#FF3B30"
          sub={`${metrics.overdueCount} installment${metrics.overdueCount !== 1 ? 's' : ''}`}
        />
        <MetricCard
          label="Active Loans"
          value={String(metrics.activeLoans)}
          sub={`${metrics.activeBorrowers} client${metrics.activeBorrowers !== 1 ? 's' : ''}`}
        />
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>How metrics are calculated</Text>
        <Text style={styles.infoText}>
          • Exposure = sum of all loan principals{'\n'}
          • Weighted avg rate = Σ(principal × rate) ÷ total exposure{'\n'}
          • Outstanding = unpaid or partially paid installments{'\n'}
          • Overdue = past-due installments not fully settled
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  heroCard: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 6 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 8, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  metricCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 3,
  },
  metricLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  metricSub: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8 },
  infoText: { fontSize: 13, color: '#64748b', lineHeight: 20 },
});
