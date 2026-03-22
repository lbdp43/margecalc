import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

const CATEGORY_COLORS = [
  '#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7',
];

const BAR_HEIGHT = 40;
const LABEL_WIDTH = 80;

interface CategoryDatum {
  name: string;
  avgMargin: number;
  count: number;
}

interface CategoryChartProps {
  data: CategoryDatum[];
}

export const CategoryChart = React.memo(function CategoryChart({ data }: CategoryChartProps) {
  const { width } = useWindowDimensions();
  const chartWidth = width - spacing.md * 4;
  const barMaxWidth = chartWidth - LABEL_WIDTH;
  const maxMargin = Math.max(...data.map((c) => c.avgMargin), 1);
  const svgHeight = data.length * BAR_HEIGHT + 8;

  if (data.length === 0) return null;

  return (
    <View
      style={styles.chartCard}
      accessibilityLabel={`Graphique marge par catégorie, ${data.length} catégories`}
    >
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIndicator, styles.indicatorPrimary]} />
        <Text style={styles.sectionTitle}>Marge par catégorie</Text>
      </View>
      <View style={[styles.chartContainer, { height: svgHeight }]}>
        <Svg width={chartWidth} height={svgHeight}>
          {data.map((cat, i) => {
            const barW = Math.max((cat.avgMargin / maxMargin) * barMaxWidth, 4);
            const y = i * BAR_HEIGHT + 4;
            const colorIdx = i % CATEGORY_COLORS.length;
            return (
              <React.Fragment key={cat.name}>
                <SvgText
                  x={0}
                  y={y + 16}
                  fontSize={11}
                  fill={colors.text}
                  fontWeight="600"
                >
                  {cat.name.length > 12 ? cat.name.slice(0, 11) + '…' : cat.name}
                </SvgText>
                <Rect
                  x={LABEL_WIDTH}
                  y={y + 2}
                  width={barW}
                  height={22}
                  rx={6}
                  fill={CATEGORY_COLORS[colorIdx]}
                />
                <SvgText
                  x={LABEL_WIDTH + barW + 6}
                  y={y + 17}
                  fontSize={12}
                  fill={colors.text}
                  fontWeight="700"
                >
                  {cat.avgMargin.toFixed(1)} %
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
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
  indicatorPrimary: {
    backgroundColor: colors.primary,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  chartContainer: {
    marginTop: spacing.sm,
  },
});
