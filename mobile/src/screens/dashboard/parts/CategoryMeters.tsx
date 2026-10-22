/**
 * « Marge par catégorie » (spec §3.9 category meter row): name + count, a
 * meter growing to the average margin with a tick at the user's objective,
 * and the % in the zone colour. Footer: the margin legend with counts.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, MarginLegend, Meter, SectionHeader } from '../../../components/ui';
import { marginColors, palette, type } from '../../../theme';
import { formatPercent } from '../../../utils/format';
import { getMarginZone, MarginThresholds } from '../../../utils/marginThresholds';
import { CategoryStat, spoken } from './dashboardData';

export interface CategoryMetersProps {
  stats: CategoryStat[];
  thresholds: MarginThresholds;
  counts: { green: number; orange: number; red: number };
  /** Base delay of the meters (dashboard entrance order). */
  delay?: number;
  onDetails?: () => void;
}

const MeterRow = React.memo(function MeterRow({ stat, thresholds, index, last, delay }: { stat: CategoryStat; thresholds: MarginThresholds; index: number; last: boolean; delay: number }) {
  const zone = getMarginZone(stat.avg, thresholds);
  const c = marginColors[zone];
  return (
    <View
      style={[styles.row, !last && styles.divider]}
      accessible
      accessibilityLabel={`${stat.name}, ${stat.count} produit${stat.count > 1 ? 's' : ''}, marge moyenne ${spoken(formatPercent(stat.avg))}, ${c.label}`}
    >
      <Text style={styles.name} numberOfLines={2}>
        {stat.name}
        <Text style={styles.count}>{`  ${stat.count}`}</Text>
      </Text>
      <Meter
        value={stat.avg / 100}
        color={c.solid}
        marker={thresholds.good / 100}
        delay={delay + index * 50}
        style={styles.meter}
      />
      <Text style={[styles.pct, { color: c.fg }]} numberOfLines={1}>
        {formatPercent(stat.avg)}
      </Text>
    </View>
  );
});

export const CategoryMeters = React.memo(function CategoryMeters({ stats, thresholds, counts, delay = 240, onDetails }: CategoryMetersProps) {
  return (
    <View>
      <SectionHeader
        title="Marge par catégorie"
        action={onDetails ? 'Détails' : undefined}
        onAction={onDetails}
      />
      <Card padding={0}>
        <View style={styles.rows}>
          {stats.map((s, i) => (
            <MeterRow key={s.key} stat={s} thresholds={thresholds} index={i} last={i === stats.length - 1} delay={delay} />
          ))}
        </View>
        <View style={styles.footer}>
          <MarginLegend counts={counts} thresholds={thresholds} />
          <View style={styles.tickLegend} accessible accessibilityLabel={`Repère vertical : votre objectif de ${spoken(formatPercent(thresholds.good, 0))}`}>
            <View style={styles.tick} />
            <Text style={styles.tickText}>{`Objectif ${formatPercent(thresholds.good, 0)}`}</Text>
          </View>
        </View>
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  rows: { paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  name: { ...type.headline, color: palette.ink, width: 118 },
  count: { ...type.footnote, color: palette.text3 },
  meter: { flex: 1 },
  pct: { ...type.numM, fontSize: 17, minWidth: 64, textAlign: 'right' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 16,
    rowGap: 6,
  },
  tickLegend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tick: { width: 2, height: 12, borderRadius: 1, backgroundColor: 'rgba(11,28,21,0.35)' },
  tickText: { ...type.footnote, color: palette.text2 },
});
