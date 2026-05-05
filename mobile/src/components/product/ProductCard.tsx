import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin, formatPrice, formatPercent, MARGIN_COLOR_MAP,
  calculateServingMargin, CONTAINER_PRESETS,
} from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows, fonts } from '../../theme';

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
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.pressable}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.indicator, { backgroundColor: accent }]} />
          <View style={styles.headerInfo}>
            <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
            <Text style={styles.subtitle}>
              Achat <Text style={styles.subtitleStrong}>{formatPrice(product.purchasePriceHT)}</Text> HT
              <Text style={styles.subtitleDot}> · </Text>
              {getContainerLabel(product.containerVolumeCl)}
            </Text>
          </View>
          <View style={styles.marginWrap}>
            <Text style={[styles.marginText, { color: accent }]}>
              {formatPercent(product.computed.marginPercent)}
            </Text>
            <Text style={styles.marginLabel}>de marge</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>

        {/* Serving table */}
        {servings.length > 0 && (
          <View style={styles.tableWrap}>
            <View style={styles.dashedRule} />
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
                  <Text style={[styles.cellNum, { flex: 1.2, textAlign: 'right' }]}>
                    {formatPrice(s.sellingPriceTTC)}
                  </Text>
                  <Text style={[styles.cellNumBold, { flex: 1.2, textAlign: 'right', color: rowColor }]}>
                    {formatPercent(margin.marginPercent)}
                  </Text>
                  <Text style={[styles.cellNum, { flex: 1, textAlign: 'right' }]}>
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
  pressable: {
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  indicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: spacing.sm + 2,
  },
  headerInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    ...typography.displaySmall,
    fontSize: 19,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 3,
  },
  subtitleStrong: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  subtitleDot: {
    color: colors.textFaint,
  },
  marginWrap: {
    alignItems: 'flex-end',
    marginRight: spacing.xs,
  },
  marginText: {
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
  tableWrap: {
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
  tableHeader: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
  servingVol: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  cellNum: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13.5,
    color: colors.text,
  },
  cellNumBold: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 14,
    fontWeight: '600',
  },
});
