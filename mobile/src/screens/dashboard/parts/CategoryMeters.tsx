/**
 * « Marge par catégorie » (spec §3.9 category meter row): name + count, a
 * meter growing to the average margin with a tick at the user's objective,
 * and the % in the zone colour. Footer: what the tick and the colours mean.
 *
 * Every row has the same columns (name 118 · meter · % 78), so the objective
 * ticks line up. Rows are 48 tall; a long category name (« Ingrédients
 * cocktails ») wraps to a second line instead of being cut, and a long %
 * shrinks to its column. Below 360 px the meter moves under the name, full width.
 * Each row opens Mes produits on that category, weakest margin first (`onOpen`).
 */
import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Card, Icon, MarginLegend, Meter, PressableScale, SectionHeader } from '../../../components/ui';
import { marginColors, palette, type } from '../../../theme';
import { formatPercent } from '../../../utils/format';
import { getMarginZone, MarginThresholds } from '../../../utils/marginThresholds';
import { CategoryStat, spoken } from './dashboardData';
import { fitScale } from './fit';

export interface CategoryMetersProps {
  stats: CategoryStat[];
  thresholds: MarginThresholds;
  /** Base delay of the meters (dashboard entrance order). */
  delay?: number;
  onDetails?: () => void;
  /** A row was tapped: open the products of this category. */
  onOpen?: (categoryKey: string) => void;
}

const NAME_W = 118;
const PCT_W = 78;
const PCT = { size: 17, ls: type.numM.letterSpacing as number };
const STACK_BELOW = 360;

const MeterRow = React.memo(function MeterRow({
  stat,
  thresholds,
  index,
  last,
  delay,
  stacked,
  onOpen,
}: {
  stat: CategoryStat;
  thresholds: MarginThresholds;
  index: number;
  last: boolean;
  delay: number;
  stacked: boolean;
  onOpen?: (key: string) => void;
}) {
  const zone = getMarginZone(stat.avg, thresholds);
  const c = marginColors[zone];
  const pct = formatPercent(stat.avg);
  const pctSize = Math.floor(PCT.size * fitScale([[pct, PCT.size, PCT.ls]], PCT_W - 2, 0.7));
  const name = (
    <View style={[styles.nameCol, stacked && styles.nameColStacked]}>
      {/* The count flows right after the last word, even when the name wraps. */}
      <Text style={styles.name} numberOfLines={2}>
        {stat.name}
        <Text style={styles.count}>{`  ${stat.count}`}</Text>
      </Text>
    </View>
  );
  const meter = <Meter value={stat.avg / 100} color={c.solid} marker={thresholds.good / 100} delay={delay + index * 50} style={styles.meter} />;
  const percent = (
    <Text style={[styles.pct, { color: c.fg }, pctSize < PCT.size ? { fontSize: pctSize } : null]} numberOfLines={1}>
      {pct}
    </Text>
  );
  const chevron = onOpen ? (
    <View style={styles.chevron}>
      <Icon name="chevron-forward" size={14} color={palette.text4} />
    </View>
  ) : null;
  const a11y = `${stat.name}, ${stat.count} produit${stat.count > 1 ? 's' : ''}, marge moyenne ${spoken(pct)}, ${c.label}`;
  const content = stacked ? (
    <>
      <View style={styles.stackTop}>
        {name}
        {percent}
        {chevron}
      </View>
      {meter}
    </>
  ) : (
    <>
      {name}
      {meter}
      {percent}
      {chevron}
    </>
  );
  if (onOpen) {
    return (
      <View style={!last && styles.divider}>
        <PressableScale
          onPress={() => onOpen(stat.key)}
          scaleTo="card"
          accessibilityRole="button"
          accessibilityLabel={`${a11y}. Voir ces produits`}
          style={[stacked ? styles.rowStacked : styles.row, styles.rowPressable]}
          testID={`category-row-${index}`}
        >
          {content}
        </PressableScale>
      </View>
    );
  }
  return (
    <View style={[stacked ? styles.rowStacked : styles.row, !last && styles.divider]} accessible accessibilityLabel={a11y}>
      {content}
    </View>
  );
});

export const CategoryMeters = React.memo(function CategoryMeters({ stats, thresholds, delay = 240, onDetails, onOpen }: CategoryMetersProps) {
  const { width } = useWindowDimensions();
  const stacked = width < STACK_BELOW;
  return (
    <View>
      <SectionHeader title="Marge par catégorie" action={onDetails ? 'Détails' : undefined} onAction={onDetails} />
      <Card padding={0}>
        <View style={styles.rows}>
          {stats.map((s, i) => (
            <MeterRow key={s.key} stat={s} thresholds={thresholds} index={i} last={i === stats.length - 1} delay={delay} stacked={stacked} onOpen={onOpen} />
          ))}
        </View>
        <View style={styles.footer}>
          <View
            style={styles.tickLegend}
            accessible
            accessibilityLabel={`Repère vertical : votre objectif de ${spoken(formatPercent(thresholds.good, 0))}`}
          >
            <View style={styles.tick} />
            <Text style={styles.tickText}>Objectif</Text>
          </View>
          <MarginLegend thresholds={thresholds} style={styles.legend} />
        </View>
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  rows: { paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 },
  rowStacked: { paddingVertical: 10, gap: 6 },
  stackTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  // The pressed row scales inside the card: give it the card's inner radius.
  rowPressable: { borderRadius: 12, marginHorizontal: -8, paddingHorizontal: 8 },
  chevron: { width: 14, marginLeft: -6, alignItems: 'flex-end' },
  nameCol: { width: NAME_W, flexDirection: 'row' },
  nameColStacked: { width: undefined, flex: 1, minWidth: 0 },
  name: { ...type.headline, color: palette.ink, flexShrink: 1 },
  count: { ...type.footnote, color: palette.text3, flexShrink: 0 },
  meter: { flex: 1 },
  pct: { ...type.numM, fontSize: PCT.size, width: PCT_W, textAlign: 'right' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 12,
    rowGap: 6,
  },
  legend: { columnGap: 12 },
  tickLegend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Same colour as the Meter's objective marker (ink at 35 %).
  tick: { width: 2, height: 12, borderRadius: 1, backgroundColor: palette.ink, opacity: 0.35 },
  tickText: { ...type.footnote, color: palette.text2 },
});
