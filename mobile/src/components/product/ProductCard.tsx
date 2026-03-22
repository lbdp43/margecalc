import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin, formatPrice, formatPercent, MARGIN_COLOR_MAP,
  calculateServingMargin, CONTAINER_PRESETS,
} from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

function getContainerLabel(volumeCl: number): string {
  const preset = CONTAINER_PRESETS.find((p) => p.volumeCl === volumeCl);
  if (preset) return preset.label;
  if (volumeCl >= 100) return `${(volumeCl / 100).toFixed(volumeCl % 100 === 0 ? 0 : 1)} L`;
  return `${volumeCl} cl`;
}

interface ProductCardProps {
  product: ProductWithMargin;
  onPress: () => void;
}

export const ProductCard = React.memo(function ProductCard({ product, onPress }: ProductCardProps) {
  const accent = MARGIN_COLOR_MAP[product.computed.colorCode];
  const servings = product.servings || [];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.pressable}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.indicator, { backgroundColor: accent }]} />
          <View style={styles.headerInfo}>
            <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
            <Text style={styles.subtitle}>
              Achat : {formatPrice(product.purchasePriceHT)} HT · {getContainerLabel(product.containerVolumeCl)}
            </Text>
          </View>
          <Text style={[styles.marginText, { color: accent }]}>
            {formatPercent(product.computed.marginPercent)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.tabBarInactive} />
        </View>

        {/* Serving table */}
        {servings.length > 0 && (
          <View style={styles.tableWrap}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeader, { flex: 2 }]}>SERVICE</Text>
              <Text style={[styles.tableHeader, { flex: 1.2, textAlign: 'right' }]}>PRIX TTC</Text>
              <Text style={[styles.tableHeader, { flex: 1.2, textAlign: 'right' }]}>MARGE</Text>
              <Text style={[styles.tableHeader, { flex: 1, textAlign: 'right' }]}>COEFF</Text>
            </View>
            {servings.map((s) => {
              const margin = calculateServingMargin(
                product.purchasePriceHT,
                product.containerVolumeCl,
                product.tvaRate,
                s.servingType,
                s.sellingPriceTTC,
              );
              const rowColor = MARGIN_COLOR_MAP[margin.colorCode];
              const coeff = margin.costPerServingHT > 0
                ? (margin.sellingPriceHT / margin.costPerServingHT).toFixed(1)
                : '-';
              return (
                <View key={s.id} style={styles.tableRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.servingName}>{s.servingType.name}</Text>
                    <Text style={styles.servingVol}>{s.servingType.volumeCl} cl</Text>
                  </View>
                  <Text style={[styles.cell, { flex: 1.2, textAlign: 'right' }]}>
                    {formatPrice(s.sellingPriceTTC)}
                  </Text>
                  <Text style={[styles.cellBold, { flex: 1.2, textAlign: 'right', color: rowColor }]}>
                    {formatPercent(margin.marginPercent)}
                  </Text>
                  <Text style={[styles.cell, { flex: 1, textAlign: 'right' }]}>
                    x {coeff}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  pressable: {
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  indicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: spacing.sm + 2,
  },
  headerInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  marginText: {
    ...typography.h3,
    fontWeight: '800',
    marginRight: spacing.xs,
  },
  tableWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  tableHeader: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.tabBarInactive,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  servingName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  servingVol: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  cell: {
    ...typography.bodySmall,
    color: colors.text,
  },
  cellBold: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
});
