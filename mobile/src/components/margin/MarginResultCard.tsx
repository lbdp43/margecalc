import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MarginResult, formatPrice, formatPercent, formatCoefficient, MARGIN_COLOR_MAP } from '@margebar/shared';
import { Card } from '../ui/Card';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface MarginResultCardProps {
  result: MarginResult | null;
}

export function MarginResultCard({ result }: MarginResultCardProps) {
  if (!result) {
    return (
      <Card style={styles.card}>
        <Text style={styles.placeholder}>
          Remplissez les champs pour voir le calcul de marge
        </Text>
      </Card>
    );
  }

  const accentColor = MARGIN_COLOR_MAP[result.colorCode];

  return (
    <Card style={[styles.card, { borderLeftColor: accentColor, borderLeftWidth: 4 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Résultat</Text>
        <View style={[styles.badge, { backgroundColor: accentColor }]}>
          <Text style={styles.badgeText}>{formatPercent(result.marginPercent)}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Prix de vente TTC</Text>
          <Text style={styles.gridValue}>{formatPrice(result.sellingPriceTTC)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Prix de vente HT</Text>
          <Text style={styles.gridValue}>{formatPrice(result.sellingPriceHT)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Coût par dose</Text>
          <Text style={styles.gridValue}>{formatPrice(result.costPerDoseHT)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Marge par dose</Text>
          <Text style={[styles.gridValue, { color: accentColor }]}>
            {formatPrice(result.marginPerDoseHT)}
          </Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Coefficient</Text>
          <Text style={styles.gridValue}>{formatCoefficient(result.coefficient)}</Text>
        </View>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Verres / contenant</Text>
          <Text style={styles.gridValue}>{Math.floor(result.glassesPerContainer)}</Text>
        </View>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Marge totale par contenant</Text>
        <Text style={[styles.totalValue, { color: accentColor }]}>
          {formatPrice(result.marginPerContainer)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  placeholder: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textLight,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '50%',
    paddingVertical: spacing.sm,
  },
  gridLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  gridValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
  },
  totalLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  totalValue: {
    ...typography.h3,
    fontWeight: '700',
  },
});
