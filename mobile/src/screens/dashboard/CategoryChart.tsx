import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows, fonts } from '../../theme';
import { Scribble } from '../../components/ui/atelier';

const CATEGORY_COLORS = [
  '#1B7A55', '#2F8A63', '#43A47C', '#62B597', '#7EC4AB', '#9AD3BF', '#B8E3D5',
];

const ROW_HEIGHT = 32;

interface CategoryDatum {
  name: string;
  avgMargin: number;
  count: number;
}

interface CategoryChartProps {
  data: CategoryDatum[];
}

export const CategoryChart = React.memo(function CategoryChart({ data }: CategoryChartProps) {
  const maxMargin = Math.max(...data.map((c) => c.avgMargin), 1);

  if (data.length === 0) return null;

  return (
    <View
      style={styles.chartCard}
      accessibilityLabel={`Graphique marge par catégorie, ${data.length} catégories`}
    >
      <View style={styles.sectionHeader}>
        <Scribble width={28} color={colors.primary} style={{ marginRight: spacing.sm }} />
        <Text style={styles.sectionTitle}>Marge par catégorie</Text>
      </View>
      <View style={styles.rows}>
        {data.map((cat, i) => {
          const ratio = Math.max(cat.avgMargin / maxMargin, 0.04);
          const barColor = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
          return (
            <View key={cat.name} style={[styles.row, { height: ROW_HEIGHT }]}>
              <Text style={styles.label} numberOfLines={1}>{cat.name}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${ratio * 100}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={styles.value}>{cat.avgMargin.toFixed(1)} %</Text>
            </View>
          );
        })}
      </View>
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
    marginBottom: spacing.sm + 2,
  },
  sectionTitle: {
    ...typography.h3,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontWeight: '500',
    color: colors.text,
    letterSpacing: -0.3,
  },
  rows: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    width: 86,
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 99,
    backgroundColor: colors.cardBackgroundLo,
    borderWidth: 1.2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 99,
  },
  value: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    minWidth: 52,
    textAlign: 'right',
  },
});
