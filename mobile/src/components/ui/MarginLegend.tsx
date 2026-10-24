/**
 * MarginLegend (graft 6): « ● ≥ 65 % · ● 50–65 % · ● < 50 % » from the user's
 * thresholds (Réglages), with optional counts per zone.
 *
 *   <MarginLegend />
 *   <MarginLegend counts={countByZone(products)} />      « ● ≥ 65 % 15 »…
 *   <MarginLegend counts={…} selected={zone} onSelect={setZone} />   each item filters (lot 1 n° 2)
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { marginColors, palette, radius, type } from '../../theme';
import { PressableScale } from './PressableScale';
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
  /** Makes each item a filter button (tap again to clear: the caller decides). */
  onSelect?: (zone: MarginZone) => void;
  /** The zone currently filtered (outlined item). */
  selected?: MarginZone | null;
  style?: StyleProp<ViewStyle>;
}

const ZONES: MarginZone[] = ['green', 'orange', 'red'];

export function MarginLegend({ counts, thresholds, onSelect, selected, style }: MarginLegendProps) {
  const userThresholds = useMarginThresholds();
  const t = thresholds ?? userThresholds;
  const labels = zoneRangeLabels(t);
  if (onSelect) {
    return (
      <View style={[styles.row, styles.rowPressable, style]} accessibilityRole="toolbar" accessibilityLabel="Filtrer par marge">
        {ZONES.map((z) => {
          const on = selected === z;
          const n = counts?.[z];
          return (
            <PressableScale
              key={z}
              onPress={() => onSelect(z)}
              scaleTo="chip"
              haptic="select"
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${on ? 'Retirer le filtre' : 'Filtrer'} : ${marginColors[z].label}, ${labels[z].replace(/ /g, ' ').replace('%', 'pour cent')}${n !== undefined ? `, ${n} produit${n > 1 ? 's' : ''}` : ''}`}
              style={[styles.item, styles.itemPressable, on && styles.itemOn]}
              testID={`legend-${z}`}
            >
              <View style={[styles.dot, { backgroundColor: marginColors[z].solid }]} />
              <Text style={styles.label}>{labels[z]}</Text>
              {n !== undefined ? <Text style={styles.count}>{formatNumber(n)}</Text> : null}
            </PressableScale>
          );
        })}
      </View>
    );
  }
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
  // Filter buttons: 32 tall (44 with the hit slop), the same rhythm as the static legend.
  rowPressable: { columnGap: 4, rowGap: 4, marginHorizontal: -8 },
  itemPressable: { minHeight: 32, paddingHorizontal: 8, borderRadius: radius.full, borderWidth: 1, borderColor: 'transparent' },
  itemOn: { backgroundColor: palette.surface, borderColor: palette.lineStrong },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { ...type.footnote, color: palette.text2, fontVariant: ['tabular-nums'] },
  count: { ...type.footnoteStrong, color: palette.ink, fontVariant: ['tabular-nums'] },
});
