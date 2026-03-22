import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ProductWithMargin, formatPercent, MARGIN_COLOR_MAP } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface TopFlopSectionProps {
  title: string;
  indicatorColor: string;
  products: ProductWithMargin[];
  onPress: (productId: string) => void;
}

export const TopFlopSection = React.memo(function TopFlopSection({
  title,
  indicatorColor,
  products,
  onPress,
}: TopFlopSectionProps) {
  if (products.length === 0) return null;

  return (
    <View style={styles.chartCard} accessibilityLabel={`${title}, ${products.length} produits`}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIndicator, { backgroundColor: indicatorColor }]} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {products.map((p, i) => {
        const accent = MARGIN_COLOR_MAP[p.computed.colorCode];
        return (
          <TouchableOpacity
            key={p.id}
            onPress={() => onPress(p.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}. ${p.name}, marge ${formatPercent(p.computed.marginPercent)}`}
          >
            <View style={styles.rankRow}>
              <Text style={styles.rankNumber}>{i + 1}</Text>
              <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.rankMargin, { color: accent }]}>
                {formatPercent(p.computed.marginPercent)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rankNumber: {
    width: 24,
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  rankName: {
    flex: 1,
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginLeft: spacing.sm,
  },
  rankMargin: {
    ...typography.bodySmall,
    fontWeight: '800',
    marginLeft: spacing.sm,
  },
});
