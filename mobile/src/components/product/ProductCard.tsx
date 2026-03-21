import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ProductWithMargin, formatPrice, formatPercent, MARGIN_COLOR_MAP } from '@margebar/shared';
import { Card } from '../ui/Card';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface ProductCardProps {
  product: ProductWithMargin;
  onPress: () => void;
}

export function ProductCard({ product, onPress }: ProductCardProps) {
  const accentColor = MARGIN_COLOR_MAP[product.computed.colorCode];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
            <Text style={styles.detail}>
              Achat: {formatPrice(product.purchasePriceHT)} HT
            </Text>
          </View>
          <View style={styles.marginInfo}>
            <Text style={[styles.marginPercent, { color: accentColor }]}>
              {formatPercent(product.computed.marginPercent)}
            </Text>
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text style={styles.badgeText}>
                {formatPrice(product.computed.sellingPriceTTC)}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
});
