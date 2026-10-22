/**
 * « Top & flop » (graft 17): a Top / Flop SegmentedControl over the products
 * at or above the user's objective (best first) and those below it (worst
 * first). The two lists never share a product (see `topFlop`), each segment
 * hint shows its own length, and an empty side shows a calm sentence instead
 * of an empty card. Each row opens the product (rank · thumb · name + service
 * price · margin badge). The list cross-fades when the segment changes.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductWithMargin } from '@margebar/shared';
import { Badge, Card, PressableScale, SectionHeader, SegmentedControl, SwapFade, primaryPrice } from '../../../components/ui';
import { marginColors, palette, radius, type } from '../../../theme';
import { formatEuro, formatPercent, NBSP } from '../../../utils/format';
import { getMarginZone, MarginThresholds } from '../../../utils/marginThresholds';
import { ProductThumb } from './ProductThumb';
import { spoken } from './dashboardData';

type Mode = 'top' | 'flop';

export interface TopFlopCardProps {
  /** At or above the objective, best first. */
  top: ProductWithMargin[];
  /** Below the objective, worst first. */
  flop: ProductWithMargin[];
  thresholds: MarginThresholds;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}

const THUMB = 40;
const RANK_W = 14;
const ROW_PAD = 12;
const ROW_GAP = 12;

const Row = React.memo(function Row({
  product,
  rank,
  last,
  thresholds,
  onOpen,
}: {
  product: ProductWithMargin;
  rank: number;
  last: boolean;
  thresholds: MarginThresholds;
  onOpen: (id: string) => void;
}) {
  const price = primaryPrice(product);
  const margin = product.computed.marginPercent;
  const zone = getMarginZone(margin, thresholds);
  const meta = `${price.label}${NBSP}·${NBSP}${formatEuro(price.price)}`;
  const extra = price.extra > 0 ? `, et ${price.extra} autre${price.extra > 1 ? 's' : ''} service${price.extra > 1 ? 's' : ''}` : '';
  return (
    <View>
      <PressableScale
        onPress={() => onOpen(product.id)}
        scaleTo="card"
        accessibilityRole="button"
        accessibilityLabel={`${rank}. ${product.name}, ${product.category?.name ?? 'produit'}, ${spoken(meta)}${extra}, marge ${spoken(formatPercent(margin))}, ${marginColors[zone].label}`}
        style={styles.row}
        testID={`topflop-row-${rank}`}
      >
        <Text style={styles.rank}>{rank}</Text>
        <ProductThumb product={product} size={THUMB} radius={12} />
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
            {price.extra > 0 ? <Text style={styles.extra}>{`${NBSP}${NBSP}+${price.extra}`}</Text> : null}
          </Text>
        </View>
        <Badge value={margin} thresholds={thresholds} size="sm" style={styles.badge} />
      </PressableScale>
      {!last ? <View style={styles.divider} /> : null}
    </View>
  );
});

/** The calm row shown when one side has no product. */
function NoneRow({ mode, objective }: { mode: Mode; objective: string }) {
  const good = mode === 'flop';
  const text = good
    ? `Aucun produit sous votre objectif de ${objective}.`
    : `Aucun produit n’atteint encore votre objectif de ${objective}.`;
  return (
    <View style={styles.none} accessible accessibilityLabel={spoken(text)} testID={`topflop-none-${mode}`}>
      <View style={[styles.noneIcon, { backgroundColor: good ? palette.goodBg : palette.surface2 }]}>
        <Ionicons name={good ? 'checkmark-circle' : 'flag-outline'} size={20} color={good ? palette.good : palette.text3} />
      </View>
      <Text style={styles.noneText}>{text}</Text>
    </View>
  );
}

export const TopFlopCard = React.memo(function TopFlopCard({ top, flop, thresholds, onOpen, onSeeAll }: TopFlopCardProps) {
  // Start on the side that has something to show.
  const [mode, setMode] = useState<Mode>(top.length === 0 && flop.length > 0 ? 'flop' : 'top');
  const list = mode === 'top' ? top : flop;
  const objective = formatPercent(thresholds.good, 0);
  const onChange = useCallback((k: Mode) => setMode(k), []);

  if (top.length === 0 && flop.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Top & flop" action="Tout voir" onAction={onSeeAll} />
      <Card padding={0}>
        <View style={styles.toggle}>
          <SegmentedControl<Mode>
            options={[
              {
                key: 'top',
                label: 'Top',
                hint: `${top.length}`,
                accessibilityLabel: `Top : ${top.length} produit${top.length > 1 ? 's' : ''} à ${spoken(objective)} ou plus`,
              },
              {
                key: 'flop',
                label: 'Flop',
                hint: `${flop.length}`,
                accessibilityLabel: `Flop : ${flop.length} produit${flop.length > 1 ? 's' : ''} sous ${spoken(objective)}`,
              },
            ]}
            value={mode}
            onChange={onChange}
            accessibilityLabel="Classement des marges"
          />
        </View>
        <SwapFade value={mode} style={styles.list}>
          {list.length === 0 ? (
            <NoneRow mode={mode} objective={objective} />
          ) : (
            list.map((p, i) => (
              <Row key={p.id} product={p} rank={i + 1} last={i === list.length - 1} thresholds={thresholds} onOpen={onOpen} />
            ))
          )}
        </SwapFade>
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  toggle: { paddingHorizontal: 12, paddingTop: 12 },
  list: { paddingHorizontal: 4, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    minHeight: 64,
    paddingHorizontal: ROW_PAD,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  rank: { ...type.footnoteStrong, color: palette.text3, width: RANK_W, textAlign: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.headline, color: palette.ink },
  meta: { ...type.footnote, color: palette.text3 },
  extra: { ...type.footnoteStrong, color: palette.em700 },
  badge: { alignSelf: 'center' },
  divider: { height: 1, backgroundColor: palette.line, marginLeft: ROW_PAD + RANK_W + ROW_GAP + THUMB + ROW_GAP, marginRight: ROW_PAD },
  none: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: ROW_PAD, paddingVertical: 12 },
  noneIcon: { width: THUMB, height: THUMB, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  noneText: { ...type.callout, color: palette.text2, flex: 1 },
});
