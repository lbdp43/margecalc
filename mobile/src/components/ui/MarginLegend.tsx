/**
 * MarginLegend (graft 6): « ● ≥ 65 % · ● 50–65 % · ● < 50 % » from the user's
 * thresholds (Réglages), with optional counts per zone.
 *
 *   <MarginLegend />
 *   <MarginLegend counts={countByZone(products)} />      « ● ≥ 65 % 15 »…
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { marginColors, palette, type } from '../../theme';
import { formatNumber, formatPercent, NBSP } from '../../utils/format';
import { getMarginZone, MarginThresholds, MarginZone, useMarginThresholds } from '../../utils/marginThresholds';

export type ZoneCounts = Partial<Record<MarginZone, number>>;

/** Count products per margin zone (`computed.marginPercent`), with the given or current thresholds. */
export function countByZone(
  products: ReadonlyArray<{ computed?: { marginPercent: number } | null }>,
  thresholds?: MarginThresholds,
): Record<MarginZone, number> {
  const out: Record<MarginZone, number> = { green: 0, orange: 0, red: 0 };
  for (const p of products) {
    if (!p.computed) continue;
    out[getMarginZone(p.computed.marginPercent, thresholds)] += 1;
  }
  return out;
}

/** « ≥ 65 % », « 50–65 % », « < 50 % » for the given thresholds. */
export function zoneRangeLabels(t: MarginThresholds): Record<MarginZone, string> {
  return {
    green: `≥${NBSP}${formatPercent(t.good, 0)}`,
    orange: `${formatNumber(t.medium)}–${formatPercent(t.good, 0)}`,
    red: `<${NBSP}${formatPercent(t.medium, 0)}`,
  };
}

export interface MarginLegendProps {
  counts?: ZoneCounts;
  thresholds?: MarginThresholds;
  style?: StyleProp<ViewStyle>;
}

const ZONES: MarginZone[] = ['green', 'orange', 'red'];

export function MarginLegend({ counts, thresholds, style }: MarginLegendProps) {
  const userThresholds = useMarginThresholds();
  const t = thresholds ?? userThresholds;
  const labels = zoneRangeLabels(t);
  const a11y =
    'Légende des marges : ' +
    ZONES.map((z) => `${marginColors[z].label} ${labels[z]}${counts?.[z] !== undefined ? `, ${counts[z]} produits` : ''}`).join(' ; ');
  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={a11y}>
      {ZONES.map((z) => (
        <View key={z} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: marginColors[z].solid }]} />
          <Text style={styles.label}>{labels[z]}</Text>
          {counts?.[z] !== undefined ? <Text style={styles.count}>{formatNumber(counts[z] as number)}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { ...type.footnote, color: palette.text2, fontVariant: ['tabular-nums'] },
  count: { ...type.footnoteStrong, color: palette.ink, fontVariant: ['tabular-nums'] },
});
