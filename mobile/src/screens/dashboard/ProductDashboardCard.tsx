import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin, ServingMarginResult,
  formatPercent, formatPrice, MARGIN_COLOR_MAP,
  CONTAINER_PRESETS,
} from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows, fonts } from '../../theme';

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
      activeOpacity={0.85}
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
              Achat <Text style={styles.subtitleStrong}>{formatPrice(p.purchasePriceHT)}</Text> HT
              <Text style={styles.dot}> · </Text>
              {getContainerLabel(p.containerVolumeCl)}
            </Text>
          </View>
          <View style={styles.marginWrap}>
            <Text style={[styles.productMargin, { color: accent }]}>
              {formatPercent(p.computed.marginPercent)}
            </Text>
            <Text style={styles.marginLabel}>de marge</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>

        {servingMargins.length > 0 && (
          <View style={styles.servingsTable}>
            <View style={styles.dashedRule} />
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
                    × {coeff}
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
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  productIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: spacing.sm + 2,
  },
  productTitleWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  productName: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 19,
    fontWeight: '500',
    letterSpacing: -0.3,
    color: colors.text,
  },
  productSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 3,
  },
  subtitleStrong: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  dot: {
    color: colors.textFaint,
  },
  marginWrap: {
    alignItems: 'flex-end',
    marginRight: spacing.xs,
  },
  productMargin: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  marginLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textFaint,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  servingsTable: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  dashedRule: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginBottom: spacing.xs,
    opacity: 0.85,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs + 2,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm - 2,
  },
  servingName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  servingVolume: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  thService: {
    fontSize: 9.5,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    flex: 2,
  },
  thRight12: {
    fontSize: 9.5,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    flex: 1.2,
    textAlign: 'right',
  },
  thRight1: {
    fontSize: 9.5,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    flex: 1,
    textAlign: 'right',
  },
  cellFlex2: {
    flex: 2,
  },
  cellRight12: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13.5,
    color: colors.text,
    flex: 1.2,
    textAlign: 'right',
  },
  cellRight12Bold: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 14,
    fontWeight: '600',
    flex: 1.2,
    textAlign: 'right',
  },
  cellRight1: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13.5,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
});
