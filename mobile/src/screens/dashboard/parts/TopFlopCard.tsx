/**
 * « Top & flop » (graft 17): a Top / Flop SegmentedControl over the five best
 * or worst margins. Each row opens the product (rank · thumb · name + service
 * price · margin badge). The list cross-fades when the segment changes.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ProductWithMargin } from '@margebar/shared';
import { Badge, Card, PressableScale, SectionHeader, SegmentedControl, SwapFade, primaryPrice } from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { formatEuro, formatPercent, NBSP } from '../../../utils/format';
import { getMarginZone, MarginThresholds } from '../../../utils/marginThresholds';
import { marginColors } from '../../../theme';
import { ProductThumb } from './ProductThumb';
import { spoken } from './dashboardData';

type Mode = 'top' | 'flop';

export interface TopFlopCardProps {
  top: ProductWithMargin[];
  flop: ProductWithMargin[];
  thresholds: MarginThresholds;
  onOpen: (id: string) => void;
  onSeeAll: () => void;
}

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
  const meta = `${price.label}${NBSP}·${NBSP}${formatEuro(price.price)}${price.extra > 0 ? ` · +${price.extra}${NBSP}service${price.extra > 1 ? 's' : ''}` : ''}`;
  return (
    <View>
      <PressableScale
        onPress={() => onOpen(product.id)}
        scaleTo="card"
        accessibilityRole="button"
        accessibilityLabel={`${rank}. ${product.name}, ${product.category?.name ?? 'produit'}, ${spoken(meta)}, marge ${spoken(formatPercent(margin))}, ${marginColors[zone].label}`}
        style={styles.row}
        testID={`topflop-row-${rank}`}
      >
        <Text style={styles.rank}>{rank}</Text>
        <ProductThumb product={product} size={40} radius={12} />
        <View style={styles.texts}>
          <Text style={styles.name} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <Badge value={margin} thresholds={thresholds} size="sm" />
      </PressableScale>
      {!last ? <View style={styles.divider} /> : null}
    </View>
  );
});

export const TopFlopCard = React.memo(function TopFlopCard({ top, flop, thresholds, onOpen, onSeeAll }: TopFlopCardProps) {
  const [mode, setMode] = useState<Mode>('top');
  const list = mode === 'top' ? top : flop;
  const showToggle = top.length > 1;
  const onChange = useCallback((k: Mode) => setMode(k), []);

  return (
    <View>
      <SectionHeader title="Top & flop" action="Tout voir" onAction={onSeeAll} />
      <Card padding={0}>
        {showToggle ? (
          <View style={styles.toggle}>
            <SegmentedControl<Mode>
              options={[
                { key: 'top', label: 'Top', hint: `${top.length}`, accessibilityLabel: `Les ${top.length} meilleures marges` },
                { key: 'flop', label: 'Flop', hint: `${flop.length}`, accessibilityLabel: `Les ${flop.length} marges les plus faibles` },
              ]}
              value={mode}
              onChange={onChange}
              accessibilityLabel="Classement des marges"
            />
          </View>
        ) : null}
        <SwapFade value={mode} style={styles.list}>
          {list.map((p, i) => (
            <Row key={p.id} product={p} rank={i + 1} last={i === list.length - 1} thresholds={thresholds} onOpen={onOpen} />
          ))}
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
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  rank: { ...type.footnoteStrong, color: palette.text3, width: 14, textAlign: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.headline, color: palette.ink },
  meta: { ...type.footnote, color: palette.text3 },
  divider: { height: 1, backgroundColor: palette.line, marginLeft: 12 + 14 + 12 + 40 + 12, marginRight: 12 },
});
