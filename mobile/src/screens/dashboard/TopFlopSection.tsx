import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ProductWithMargin, formatPercent, MARGIN_COLOR_MAP } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows, fonts } from '../../theme';
import { Scribble } from '../../components/ui/atelier';

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
        <Scribble width={28} color={indicatorColor} style={{ marginRight: spacing.sm }} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {products.map((p, i) => {
        const accent = MARGIN_COLOR_MAP[p.computed.colorCode];
        const tilt = i % 2 === 0 ? -2 : 2;
        return (
          <TouchableOpacity
            key={p.id}
            onPress={() => onPress(p.id)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}. ${p.name}, marge ${formatPercent(p.computed.marginPercent)}`}
          >
            <View style={[styles.rankRow, i === 0 && styles.firstRow]}>
              <View style={[
                styles.rankBadge,
                { borderColor: i < 2 ? indicatorColor : colors.border },
                i === 0 && { backgroundColor: indicatorColor },
                { transform: [{ rotate: `${tilt}deg` }] },
              ]}>
                <Text style={[
                  styles.rankNumber,
                  i === 0 ? styles.rankNumberHero : { color: i === 1 ? indicatorColor : colors.textSecondary },
                ]}>
                  {i + 1}
                </Text>
              </View>
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
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontWeight: '500',
    color: colors.text,
    letterSpacing: -0.3,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: colors.border,
  },
  firstRow: {
    borderTopWidth: 0,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: colors.cardBackgroundHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumber: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontWeight: '500',
    fontSize: 14,
  },
  rankNumberHero: {
    color: colors.onAccent,
  },
  rankName: {
    flex: 1,
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginLeft: spacing.sm + 2,
  },
  rankMargin: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontWeight: '600',
    fontSize: 17,
    marginLeft: spacing.sm,
    letterSpacing: -0.2,
  },
});
