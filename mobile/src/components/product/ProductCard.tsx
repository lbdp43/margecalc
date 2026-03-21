import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ProductWithMargin, formatPrice, formatPercent, MARGIN_COLOR_MAP } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface ProductCardProps {
  product: ProductWithMargin;
  onPress: () => void;
}

export function ProductCard({ product, onPress }: ProductCardProps) {
  const accent = MARGIN_COLOR_MAP[product.computed.colorCode];
  const servings = product.servings || [];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.pressable}>
      <View style={styles.card}>
        {/* Left color indicator */}
        <View style={[styles.indicator, { backgroundColor: accent }]} />

        <View style={styles.content}>
          {/* Top section: product info + margin badge */}
          <View style={styles.topRow}>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.detail}>
                Achat : {formatPrice(product.purchasePriceHT)} HT
              </Text>
              <Text style={styles.detail}>
                x{product.computed.coefficient.toFixed(1)} · {formatPrice(product.computed.marginPerDoseHT)}/dose
              </Text>
            </View>

            {/* Margin badge */}
            <View style={styles.marginSection}>
              <View style={[styles.marginBadge, { backgroundColor: accent + '18' }]}>
                <Text style={[styles.marginPercent, { color: accent }]}>
                  {formatPercent(product.computed.marginPercent)}
                </Text>
              </View>
              <View style={[styles.priceBadge, { backgroundColor: accent }]}>
                <Text style={styles.priceText}>
                  {formatPrice(product.computed.sellingPriceTTC)}
                </Text>
              </View>
            </View>
          </View>

          {/* Servings pills */}
          {servings.length > 0 && (
            <View style={styles.servingsRow}>
              {servings.map((s) => (
                <View key={s.id} style={styles.servingChip}>
                  <Text style={styles.servingEmoji}>
                    {s.servingType?.icon || '🍷'}
                  </Text>
                  <Text style={styles.servingChipText}>
                    {s.servingType?.name}
                  </Text>
                  <View style={styles.servingPriceDot} />
                  <Text style={styles.servingPrice}>
                    {formatPrice(s.sellingPriceTTC)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pressable: {
    marginBottom: spacing.sm + 4,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  indicator: {
    width: 5,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    paddingLeft: spacing.md + 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
    paddingTop: 2,
  },
  name: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  detail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  marginSection: {
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  marginBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    minWidth: 72,
  },
  marginPercent: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  priceBadge: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  priceText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textLight,
  },
  servingsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  servingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  servingEmoji: {
    fontSize: 14,
  },
  servingChipText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  servingPriceDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textSecondary,
  },
  servingPrice: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
