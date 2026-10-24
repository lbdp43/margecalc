/**
 * The two tiles that overlap the hero: « Produits » (count-up) and, on the
 * right, the « À revoir » tile (lot 1 n° 3):
 *
 * - at least one product under the alert threshold (« à revoir »): the count,
 *   the worst product (thumb + name + margin) and « Corriger », which opens its
 *   quick price sheet already set to the suggested price (`onFix`); « Tout
 *   voir » (lot 2 n° 7) opens « Sous l’objectif » with every price to fix (`onSeeAll`);
 * - nothing under it: « Tout au-dessus de 50 % » with the best product
 *   (thumb + name + margin badge), which opens it (`onBest`).
 *
 * Both tiles are pressable. Narrow phones (< 375 px) keep the key content
 * readable: equal tiles, no icon tiles (the labels never truncate), no thumb
 * (the name gets the width, in `callout`), and the margin as plain text next
 * to « Corriger ». The product name wraps to 2 lines in a fixed 2-line box,
 * so the tiles always have the same height (`kpiTileLayout`, mirrored by the
 * skeleton) whatever the state.
 */
import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ProductWithMargin } from '@margebar/shared';
import { AnimatedNumber, Badge, FadeIn, Icon, keepUnits, PressableScale, StatTile } from '../../../components/ui';
import { elevation, fontFamily, marginColors, palette, radius, type } from '../../../theme';
import { formatPercent, NBSP, plural } from '../../../utils/format';
import type { MarginThresholds } from '../../../utils/marginThresholds';
import { ProductThumb } from './ProductThumb';
import { spoken } from './dashboardData';

export interface KpiTilesProps {
  count: number;
  /** Number of categories the products are in (meta line of « Produits »). */
  categories: number;
  best: ProductWithMargin | null;
  /** The product with the lowest margin under the alert threshold (null: none). */
  worst: ProductWithMargin | null;
  /** How many products are under the alert threshold. */
  toReview: number;
  thresholds: MarginThresholds;
  onProducts: () => void;
  onBest: (id: string) => void;
  /** « Corriger »: open the worst product's quick price sheet at the suggested price. */
  onFix: (product: ProductWithMargin) => void;
  /** « Tout voir »: every service under the objective (« Sous l’objectif »). */
  onSeeAll?: () => void;
}

const NARROW = 375;
const NAME_LINE = type.headline.lineHeight as number; // 22 (callout is 22 too)
const BADGE_H = 22;
const ACTION_H = 28;
/** Label row: a 2-line label (« Tout au-dessus de 50 % ») or the 32 px icon tile. */
const TOP_H = 36;
/** 2-line name + the badge / « Corriger » row. */
const BLOCK = NAME_LINE * 2 + 4 + ACTION_H;

/** Tile geometry for a window width (shared with the dashboard skeleton). */
export function kpiTileLayout(width: number) {
  const narrow = width < NARROW;
  const icons = !narrow;
  // Tile: padding 12 + top row 36 + gap 8 + content + padding 12 + border 2.
  const height = 12 + TOP_H + 8 + BLOCK + 12 + 2;
  return { narrow, icons, height, flexBest: narrow ? 1 : 1.25 };
}

export const KpiTiles = React.memo(function KpiTiles({ count, categories, best, worst, toReview, thresholds, onProducts, onBest, onFix, onSeeAll }: KpiTilesProps) {
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
        {worst && toReview > 0 ? (
          <ReviewTile
            product={worst}
            count={toReview}
            thresholds={thresholds}
            narrow={l.narrow}
            height={l.height}
            innerWidth={reviewInnerWidth(width, l.flexBest)}
            onFix={onFix}
            onSeeAll={onSeeAll}
          />
        ) : (
          <AllGoodTile product={best} thresholds={thresholds} narrow={l.narrow} height={l.height} onOpen={onBest} />
        )}
      </FadeIn>
    </View>
  );
});

function TileTop({ label, icon, tone, narrow }: { label: string; icon: React.ComponentProps<typeof Icon>['name']; tone: { bg: string; fg: string }; narrow: boolean }) {
  return (
    <View style={styles.top}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      {narrow ? null : (
        <View style={[styles.iconTile, { backgroundColor: tone.bg }]}>
          <Icon name={icon} size={18} color={tone.fg} />
        </View>
      )}
    </View>
  );
}

/** Content width of the « À revoir » tile: body gutters 2 × 20, gap 12, padding 2 × 14, border 2 × 1. */
function reviewInnerWidth(window: number, flexBest: number): number {
  return ((window - 40 - 12) * flexBest) / (1 + flexBest) - 30;
}

/** Rough width of a footnoteStrong (13 px Jakarta SemiBold) label: measured 5,3–5,5 px per character. */
const labelWidth = (text: string) => text.length * 5.6;
const SEE_ALL_W = 54;
const CHEVRON_W = 15;
const LEAD_W = 26 + 6;

/**
 * Top row of the tile with « Tout voir »: the red alert tile (as on
 * « Produits » and the tile without « Tout voir »), the label, then the link,
 * as long as the label keeps one line. The chevron goes first when the row is
 * short, then the alert tile (narrow phones never show icon tiles).
 */
export function reviewTopRow(innerWidth: number, label: string, narrow: boolean): { icon: boolean; chevron: boolean } {
  if (narrow) return { icon: false, chevron: false };
  const need = labelWidth(label) + 6;
  if (innerWidth - SEE_ALL_W - CHEVRON_W - LEAD_W >= need) return { icon: true, chevron: true };
  if (innerWidth - SEE_ALL_W - LEAD_W >= need) return { icon: true, chevron: false };
  return { icon: false, chevron: true };
}

/**
 * « 1 à revoir  Tout voir › » · worst product · « Corriger ». The product
 * block is the « Corriger » button; « Tout voir » sits on the label row
 * (two sibling buttons: never a pressable inside a pressable).
 */
function ReviewTile({
  product,
  count,
  thresholds,
  narrow,
  height,
  innerWidth,
  onFix,
  onSeeAll,
}: {
  product: ProductWithMargin;
  count: number;
  thresholds: MarginThresholds;
  narrow: boolean;
  height: number;
  innerWidth: number;
  onFix: (p: ProductWithMargin) => void;
  onSeeAll?: () => void;
}) {
  const margin = product.computed.marginPercent;
  const bad = marginColors.red;
  const under = formatPercent(thresholds.medium, 0);
  const label = `${count}${NBSP}à revoir`;
  const top = reviewTopRow(innerWidth, label, narrow);
  return (
    <View style={[styles.tile, { minHeight: height }]} testID="dashboard-review-tile">
      {onSeeAll ? (
        <View style={[styles.top, top.icon ? styles.topLead : null]}>
          {/* The red alert tile stays (same reading as « Produits »), before the label. */}
          {top.icon ? (
            <View style={[styles.iconTile, styles.iconLead, { backgroundColor: palette.badBg }]} testID="dashboard-review-icon">
              <Icon name="alert-circle-outline" size={16} color={palette.bad} />
            </View>
          ) : null}
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          <PressableScale
            onPress={onSeeAll}
            scaleTo="chip"
            haptic="select"
            hitSlop={{ top: 8, bottom: 6, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Tout voir : chaque prix sous l’objectif de ${spoken(formatPercent(thresholds.good, 0))}, avec le prix conseillé`}
            style={styles.seeAll}
            testID="dashboard-see-all-fix"
          >
            <Text style={styles.seeAllText}>Tout voir</Text>
            {top.chevron ? <Icon name="chevron-forward" size={13} color={palette.em700} /> : null}
          </PressableScale>
        </View>
      ) : (
        <TileTop label={label} icon="alert-circle-outline" tone={{ bg: palette.badBg, fg: palette.bad }} narrow={narrow} />
      )}
      <PressableScale
        onPress={() => onFix(product)}
        scaleTo="card"
        haptic="select"
        accessibilityRole="button"
        accessibilityLabel={`${plural(count, 'produit')} à revoir, sous ${spoken(under)}. Le plus urgent : ${product.name}, marge ${spoken(formatPercent(margin))}. Corriger le prix`}
        style={styles.block}
      >
        <View style={styles.product}>
          {narrow ? null : <ProductThumb product={product} size={36} radius={10} />}
          <Text style={[styles.name, narrow && styles.nameNarrow]} numberOfLines={2}>
            {keepUnits(product.name)}
          </Text>
        </View>
        <View style={styles.actionRow}>
          {narrow ? (
            <Text style={[styles.pct, { color: bad.fg }]}>{formatPercent(margin)}</Text>
          ) : (
            <Badge value={margin} thresholds={thresholds} size="sm" />
          )}
          <View style={styles.fix} testID="dashboard-fix">
            <Text style={styles.fixText}>Corriger</Text>
            {narrow ? null : <Icon name="chevron-forward" size={13} color={palette.onEmerald} />}
          </View>
        </View>
      </PressableScale>
    </View>
  );
}

/** « Tout au-dessus de 50 % » + the best product. */
function AllGoodTile({
  product,
  thresholds,
  narrow,
  height,
  onOpen,
}: {
  product: ProductWithMargin | null;
  thresholds: MarginThresholds;
  narrow: boolean;
  height: number;
  onOpen: (id: string) => void;
}) {
  // A word joiner after the hyphen: « au-dessus » never breaks in two (Jakarta has no U+2011).
  // Short enough to fit on two lines next to the icon from 360 px up.
  const label = `Tout au-\u2060dessus de${NBSP}${formatPercent(thresholds.medium, 0)}`;
  const body = (
    <>
      <TileTop label={label} icon="checkmark-circle-outline" tone={{ bg: palette.goodBg, fg: palette.good }} narrow={narrow} />
      {product ? (
        <View style={[styles.block, styles.bestBlock]}>
          <View style={styles.product}>
            {narrow ? null : <ProductThumb product={product} size={36} radius={10} />}
            <View style={styles.bestText}>
              <Text style={[styles.name, narrow && styles.nameNarrow]} numberOfLines={2}>
                {keepUnits(product.name)}
              </Text>
              <Badge value={product.computed.marginPercent} thresholds={thresholds} size="sm" style={styles.badge} />
            </View>
          </View>
        </View>
      ) : (
        <Text style={styles.none}>–</Text>
      )}
    </>
  );
  if (!product) {
    return (
      <View style={[styles.tile, { minHeight: height }]} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={() => onOpen(product.id)}
      scaleTo="card"
      accessibilityRole="button"
      accessibilityLabel={`${spoken(label.replace('\u2060', ''))}. Meilleur produit : ${product.name}, marge ${spoken(formatPercent(product.computed.marginPercent))}`}
      style={[styles.tile, { minHeight: height }]}
      testID="dashboard-best-tile"
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  small: { flex: 1, minWidth: 0 },
  wide: { minWidth: 0 },
  fill: { flex: 1 },
  // Same frame as the kit StatTile (surface, radius 20, 1 px line, e2).
  tile: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: 'space-between',
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 8,
    ...elevation.e2,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, minHeight: TOP_H },
  label: { ...type.footnoteStrong, color: palette.text3, flex: 1, marginTop: 6 },
  // « Tout voir »: 30 tall + an 8 / 6 px slop = 44 (it shares the label row).
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 30, marginTop: 0 },
  seeAllText: { ...type.footnoteStrong, color: palette.em700 },
  iconTile: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  // Before the label, next to « Tout voir »: a little smaller so the label keeps one line.
  topLead: { gap: 6 },
  iconLead: { width: 26, height: 26, borderRadius: 8, marginTop: 2 },
  block: { minHeight: BLOCK, justifyContent: 'space-between', gap: 4 },
  bestBlock: { justifyContent: 'center' },
  product: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bestText: { flex: 1, minWidth: 0, justifyContent: 'center' },
  name: { ...type.headline, color: palette.ink, flex: 1, minWidth: 0 },
  nameNarrow: { ...type.callout, color: palette.ink },
  badge: { marginTop: 2, alignSelf: 'flex-start' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: ACTION_H },
  pct: { fontFamily: fontFamily.bold, fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] },
  // Reads as the button: the whole tile is the touch target.
  fix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: ACTION_H,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: radius.full,
    backgroundColor: palette.em700,
  },
  fixText: { ...type.footnoteStrong, color: palette.onEmerald },
  none: { ...type.numL, color: palette.text4 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  count: { ...type.numL, color: palette.ink },
  unit: { ...type.footnote, color: palette.text3 },
  countMeta: { ...type.footnote, color: palette.text3, marginTop: 2 },
});
