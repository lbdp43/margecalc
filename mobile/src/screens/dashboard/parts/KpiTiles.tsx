/**
 * The two StatTiles that overlap the hero: « Produits » (count-up) and
 * « Meilleur produit » (thumb + name + margin badge). Both are pressable.
 *
 * Narrow phones (< 375 px) keep the key content readable: equal tiles, no
 * icon tiles (the labels never truncate) and no thumb in « Meilleur produit »
 * (the name gets the width, in `callout`).
 * The product name wraps to 2 lines in a fixed 2-line box, so the tiles
 * always have the same height (`kpiTileLayout`, mirrored by the skeleton).
 */
import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ProductWithMargin } from '@margebar/shared';
import { AnimatedNumber, Badge, FadeIn, StatTile } from '../../../components/ui';
import { palette, type } from '../../../theme';
import { formatPercent, plural } from '../../../utils/format';
import { ProductThumb } from './ProductThumb';
import { spoken } from './dashboardData';

export interface KpiTilesProps {
  count: number;
  /** Number of categories the products are in (meta line of « Produits »). */
  categories: number;
  best: ProductWithMargin | null;
  onProducts: () => void;
  onBest: (id: string) => void;
}

const NARROW = 375;
const NAME_LINE = type.headline.lineHeight as number; // 22 (callout is 22 too)
const BADGE_H = 22;
const BEST_BLOCK = NAME_LINE * 2 + 2 + BADGE_H; // 2-line name + badge

/** Tile geometry for a window width (shared with the dashboard skeleton). */
export function kpiTileLayout(width: number) {
  const narrow = width < NARROW;
  const icons = !narrow;
  // StatTile: padding 12 + top row (icon 32, or label 6 + 18) + gap 8 + content + padding 12 + border 2.
  const height = 12 + (icons ? 32 : 24) + 8 + BEST_BLOCK + 12 + 2;
  return { narrow, icons, height, flexBest: narrow ? 1 : 1.25 };
}

export const KpiTiles = React.memo(function KpiTiles({ count, categories, best, onProducts, onBest }: KpiTilesProps) {
  const { width } = useWindowDimensions();
  const l = kpiTileLayout(width);
  return (
    <View style={styles.row}>
      <FadeIn delay={60} style={styles.small}>
        <StatTile
          label="Produits"
          icon={l.icons ? 'cube-outline' : undefined}
          onPress={onProducts}
          style={[styles.fill, { minHeight: l.height }]}
          accessibilityLabel={`${count} produit${count > 1 ? 's' : ''} suivi${count > 1 ? 's' : ''}, dans ${plural(categories, 'catégorie')}. Ouvrir Mes produits`}
        >
          <View>
            <View style={styles.countRow}>
              <AnimatedNumber value={count} format={(n) => String(Math.round(n))} delay={60} style={styles.count} />
              <Text style={styles.unit}>{count > 1 ? 'suivis' : 'suivi'}</Text>
            </View>
            <Text style={styles.countMeta} numberOfLines={1}>
              {plural(categories, 'catégorie')}
            </Text>
          </View>
        </StatTile>
      </FadeIn>
      <FadeIn delay={120} style={[styles.wide, { flex: l.flexBest }]}>
        <StatTile
          label="Meilleur produit"
          icon={l.icons ? 'trophy-outline' : undefined}
          iconTone="trophy"
          onPress={best ? () => onBest(best.id) : undefined}
          style={[styles.fill, { minHeight: l.height }]}
          accessibilityLabel={best ? `Meilleur produit : ${best.name}, marge ${spoken(formatPercent(best.computed.marginPercent))}` : 'Meilleur produit : aucun'}
        >
          {best ? (
            <View style={styles.best}>
              {l.narrow ? null : <ProductThumb product={best} size={36} radius={10} />}
              <View style={styles.bestText}>
                <Text style={[styles.bestName, l.narrow && styles.bestNameNarrow]} numberOfLines={2}>
                  {best.name}
                </Text>
                <Badge value={best.computed.marginPercent} size="sm" style={styles.badge} />
              </View>
            </View>
          ) : (
            <Text style={styles.none}>–</Text>
          )}
        </StatTile>
      </FadeIn>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  small: { flex: 1, minWidth: 0 },
  wide: { minWidth: 0 },
  fill: { flex: 1 },
  best: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: BEST_BLOCK },
  bestText: { flex: 1, minWidth: 0, justifyContent: 'center' },
  bestName: { ...type.headline, color: palette.ink },
  bestNameNarrow: { ...type.callout, color: palette.ink },
  badge: { marginTop: 2 },
  none: { ...type.numL, color: palette.text4 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  count: { ...type.numL, color: palette.ink },
  unit: { ...type.footnote, color: palette.text3 },
  countMeta: { ...type.footnote, color: palette.text3, marginTop: 2 },
});
