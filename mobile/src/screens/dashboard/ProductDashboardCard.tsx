import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin, ServingMarginResult,
  formatPercent, formatPrice, MARGIN_COLOR_MAP,
  CONTAINER_PRESETS,
} from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

function getContainerLabel(volumeCl: number): string {
  const preset = CONTAINER_PRESETS.find((p) => p.volumeCl === volumeCl);
  if (preset) return preset.label;
  if (volumeCl >= 100) return `${(volumeCl / 100).toFixed(volumeCl % 100 === 0 ? 0 : 1)} L`;
  return `${volumeCl} cl`;
}

interface ServingMarginItem {
  serving: { id: string; sellingPriceTTC: number; servingType: { name: string; volumeCl: number } };
  margin: ServingMarginResult;
}

interface ProductDashboardCardProps {
  product: ProductWithMargin;
  accent: string;
  servingMargins: ServingMarginItem[];
  onPress: (productId: string) => void;
}

export const ProductDashboardCard = React.memo(function ProductDashboardCard({
  product: p,
  accent,
  servingMargins,
  onPress,
}: ProductDashboardCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(p.id)}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, marge ${formatPercent(p.computed.marginPercent)}`}
      accessibilityHint="Appuyez pour voir le détail du produit"
    >
      <View style={styles.productCard}>
        <View style={styles.productHeader}>
          <View style={[styles.productIndicator, { backgroundColor: accent }]} />
          <View style={styles.productTitleWrap}>
            <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.productSubtitle}>
              Achat : {formatPrice(p.purchasePriceHT)} HT · {getContainerLabel(p.containerVolumeCl)}
            </Text>
          </View>
          <Text style={[styles.productMargin, { color: accent }]}>
            {formatPercent(p.computed.marginPercent)}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.tabBarInactive} />
        </View>

        {servingMargins.length > 0 && (
          <View style={styles.servingsTable}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.thService}>SERVICE</Text>
              <Text style={styles.thRight12}>PRIX TTC</Text>
              <Text style={styles.thRight12}>MARGE</Text>
              <Text style={styles.thRight1}>COEFF</Text>
            </View>
            {servingMargins.map(({ serving: s, margin }) => {
              const rowColor = MARGIN_COLOR_MAP[margin.colorCode];
              const coeff = margin.servingsPerContainer > 0 && margin.costPerServingHT > 0
                ? (margin.sellingPriceHT / margin.costPerServingHT).toFixed(1)
                : '-';
              return (
                <View key={s.id} style={styles.tableRow}>
                  <View style={styles.cellFlex2}>
                    <Text style={styles.servingName}>{s.servingType.name}</Text>
                    <Text style={styles.servingVolume}>{s.servingType.volumeCl} cl</Text>
                  </View>
                  <Text style={styles.cellRight12}>
                    {formatPrice(s.sellingPriceTTC)}
                  </Text>
                  <Text style={[styles.cellRight12Bold, { color: rowColor }]}>
                    {formatPercent(margin.marginPercent)}
                  </Text>
                  <Text style={styles.cellRight1}>
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
  productCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  productIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: spacing.sm + 2,
  },
  productTitleWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  productName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  productSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  productMargin: {
    ...typography.h3,
    fontWeight: '800',
    marginRight: spacing.xs,
  },
  servingsTable: {
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
  servingVolume: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  thService: {
    ...typography.caption,
    color: colors.tabBarInactive,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
    flex: 2,
  },
  thRight12: {
    ...typography.caption,
    color: colors.tabBarInactive,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
    flex: 1.2,
    textAlign: 'right',
  },
  thRight1: {
    ...typography.caption,
    color: colors.tabBarInactive,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
    flex: 1,
    textAlign: 'right',
  },
  cellFlex2: {
    flex: 2,
  },
  cellRight12: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1.2,
    textAlign: 'right',
  },
  cellRight12Bold: {
    ...typography.bodySmall,
    fontWeight: '700',
    flex: 1.2,
    textAlign: 'right',
  },
  cellRight1: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
});
