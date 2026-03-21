import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProductWithMargin, formatPrice, formatPercent, MARGIN_COLOR_MAP } from '@margebar/shared';
import { Card } from '../ui/Card';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface ProductCardProps {
  product: ProductWithMargin;
  onPress: () => void;
}

export function ProductCard({ product, onPress }: ProductCardProps) {
  const accent = MARGIN_COLOR_MAP[product.computed.colorCode];
  const servings = product.servings || [];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.indicator, { backgroundColor: accent }]} />
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
            <Text style={styles.detail}>
              Achat : {formatPrice(product.purchasePriceHT)} HT
            </Text>
            <Text style={styles.detail}>
              x{product.computed.coefficient.toFixed(1)} · {formatPrice(product.computed.marginPerDoseHT)}/dose
            </Text>
          </View>
          <View style={styles.marginInfo}>
            <Text style={[styles.marginPercent, { color: accent }]}>
              {formatPercent(product.computed.marginPercent)}
            </Text>
            <View style={[styles.badge, { backgroundColor: accent }]}>
              <Text style={styles.badgeText}>
                {formatPrice(product.computed.sellingPriceTTC)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.grayMedium} style={styles.chevron} />
        </View>
        {servings.length > 0 && (
          <View style={styles.servingsRow}>
            {servings.map((s) => (
              <View key={s.id} style={styles.servingChip}>
                <Text style={styles.servingChipText}>
                  {s.servingType?.icon || '🍷'} {s.servingType?.name} · {formatPrice(s.sellingPriceTTC)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  marginInfo: {
    alignItems: 'flex-end',
  },
  marginPercent: {
    ...typography.bodySmall,
    fontWeight: '700',
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textLight,
  },
  chevron: {
    marginLeft: spacing.sm,
  },
  servingsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginLeft: spacing.md + 4,
  },
  servingChip: {
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  servingChipText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '500',
  },
});
