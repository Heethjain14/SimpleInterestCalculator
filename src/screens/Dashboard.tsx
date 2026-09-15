import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useStorageContext } from '../context/StorageContext';
import { computePortfolioMetrics } from '../utils/portfolioMetrics';
import { getDuePayments } from '../utils/duePayments';
import { formatCurrency } from '../utils/format';
import RefreshButton from '../components/RefreshButton';
import { colors, radii, priorityColor } from '../theme/tokens';

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

/** Portfolio dashboard with exposure, weighted rate, collection metrics, and a due-soon preview. */
export default function Dashboard() {
  const { borrowers, loading } = useStorageContext();

  const metrics = useMemo(() => computePortfolioMetrics(borrowers), [borrowers]);
  const dueSoon = useMemo(() => getDuePayments(borrowers).slice(0, 3), [borrowers]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
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
          sub="Yet to be collected"
        />
        <MetricCard
          label="Collected"
          value={`₹${formatCurrency(metrics.totalCollected)}`}
          sub={`${metrics.collectionRate.toFixed(1)}% collection rate`}
        />
        <MetricCard
          label="Overdue"
          value={`₹${formatCurrency(metrics.overdueAmount)}`}
          accent={colors.danger}
          sub={`${metrics.overdueCount} installment${metrics.overdueCount !== 1 ? 's' : ''}`}
        />
        <MetricCard
          label="Active Loans"
          value={String(metrics.activeLoans)}
          sub={`${metrics.activeBorrowers} client${metrics.activeBorrowers !== 1 ? 's' : ''}`}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>DUE SOON</Text>
        {dueSoon.length === 0 ? (
          <View style={styles.list}>
            <Text style={styles.emptyRow}>No overdue installments right now</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {dueSoon.map((item, index) => (
              <View
                key={`${item.borrowerId}-${item.payment.id}`}
                style={[styles.row, index === dueSoon.length - 1 && styles.rowLast]}
              >
                <View style={[styles.dot, { backgroundColor: priorityColor(item.daysOverdue) }]} />
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{item.borrowerName}</Text>
                  <Text style={styles.rowSub}>
                    {item.daysOverdue} day{item.daysOverdue !== 1 ? 's' : ''} late · ₹{formatCurrency(item.amountDue)}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            ))}
          </View>
        )}
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
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  heroCard: {
    backgroundColor: colors.accent,
    borderRadius: radii.xxl,
    padding: 20,
    marginBottom: 12,
  },
  heroLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 8, letterSpacing: -0.4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 10, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  metricLabel: { fontSize: 11.5, color: colors.ink2, fontWeight: '600', marginBottom: 6 },
  metricValue: { fontSize: 18, fontWeight: '800', color: colors.ink },
  metricSub: { fontSize: 11, color: colors.ink3, marginTop: 4 },
  block: { marginBottom: 16 },
  blockTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  emptyRow: { padding: 16, fontSize: 13, color: colors.ink2, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.ink2, marginTop: 3 },
  chevron: { fontSize: 18, color: colors.ink3, fontWeight: '700' },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: { fontSize: 13.5, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  infoText: { fontSize: 12.5, color: colors.ink2, lineHeight: 20 },
});
