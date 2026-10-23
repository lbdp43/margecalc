/**
 * ProductCard (spec §3.8 + graft 5), PriceTag and ProductActionsSheet.
 *
 *   <ProductCard product={p} onPress={() => goToProduct(navigation, p.id)}
 *                onLongPress={() => setActionsFor(p)} />
 *   <PriceTag label="Verre 12 cl" price={7} />            « Verre 12 cl · 7,00 € »
 *   <ProductActionsSheet product={actionsFor} onClose={() => setActionsFor(null)}
 *                        onEdit={…} onDuplicate={…} onDelete={…} />
 *
 * Card: thumb 64 (photo or category icon), then three rows:
 *   1. name (wraps to 2 lines, so « Jameson Irish Whiskey (copie) » stays
 *      distinguishable from the original) + margin Badge, top-aligned
 *   2. meta « Catégorie · 70 cl · 40° » (only the category shortens) + gain per dose « +5,18 €/dose »
 *      in the margin colour
 *   3. PriceTag of the primary service (lowest sortOrder, whose figures are
 *      `product.computed`) + « +1 » chip for the other services, and the
 *      purchase price « Achat 18,50 € HT » on the right. The service
 *      name is never truncated (the row wraps if it ever must). Margin colours use the user's
 * thresholds (or `thresholds`). Mirrors SkeletonProductCard.
 */
import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { ProductServing, ProductWithMargin } from '@margebar/shared';
import { fontFamily, marginColors, palette, radius, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { formatEuro, formatNumber, formatPercent, formatVolumeCl, NBSP } from '../../utils/format';
import { getMarginZone, MarginThresholds, useMarginThresholds } from '../../utils/marginThresholds';
import { Badge } from './Badge';
import { BottomSheet } from './BottomSheet';
import { Card } from './Card';
import { Icon, IconName } from './Icon';
import { ListRow } from './ListRow';

// ─── helpers ───────────────────────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, IconName> = {
  spiritueux: 'flask-outline',
  vins: 'wine-outline',
  bieres: 'beer-outline',
  softs: 'cafe-outline',
  ingredients_cocktails: 'leaf-outline',
  consommables: 'cube-outline',
  cocktails_maison: 'color-filter-outline',
};

/** Ionicons glyph for a product category slug (fallback: price tag). */
export function categoryIcon(slug?: string | null): IconName {
  return (slug && CATEGORY_ICONS[slug]) || 'pricetag-outline';
}

/** Services sorted like the API (primary = lowest servingType.sortOrder). */
export function sortedServings(product: Pick<ProductWithMargin, 'servings'>): ProductServing[] {
  return [...(product.servings ?? [])].sort((a, b) => (a.servingType?.sortOrder ?? 0) - (b.servingType?.sortOrder ?? 0));
}

/** « Verre 5 cl » from a service type (a trailing « (spiritueux) » qualifier is dropped: the volume says it). */
export function servingLabel(name: string, volumeCl: number): string {
  const short = name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
  return `${short}${NBSP}${formatVolumeCl(volumeCl)}`;
}

/** « 41,4° » (compact degree for card meta lines). */
function compactDegree(deg: number): string {
  return `${formatNumber(deg, Number.isInteger(deg) ? 0 : 1)}°`;
}

/** Label + price of what the card shows: the primary service, or the product dose. */
export function primaryPrice(product: ProductWithMargin): { label: string; price: number; extra: number } {
  const servings = sortedServings(product);
  const first = servings[0];
  if (first?.servingType) {
    return { label: servingLabel(first.servingType.name, first.servingType.volumeCl), price: first.sellingPriceTTC, extra: servings.length - 1 };
  }
  return { label: `Dose${NBSP}${formatVolumeCl(product.doseVolumeCl)}`, price: product.computed?.sellingPriceTTC ?? product.sellingPriceTTC ?? 0, extra: 0 };
}

// ─── PriceTag ──────────────────────────────────────────────────────────────
export interface PriceTagProps {
  /** Service, e.g. « Verre 12 cl ». */
  label: string;
  /** TTC price. */
  price: number;
  style?: StyleProp<ViewStyle>;
}

/** Pill « Verre 12 cl · 7,00 € »: the label is never truncated. */
export function PriceTag({ label, price, style }: PriceTagProps) {
  return (
    <View style={[styles.tag, style]} accessible accessibilityLabel={`${label} : ${formatEuro(price)}`}>
      <Text style={styles.tagLabel} maxFontSizeMultiplier={1.3}>
        {label}
        <Text style={styles.tagSep}>{`${NBSP}·${NBSP}`}</Text>
        <Text style={styles.tagPrice}>{formatEuro(price)}</Text>
      </Text>
    </View>
  );
}

// ─── ProductCard ───────────────────────────────────────────────────────────
export interface ProductCardProps {
  product: ProductWithMargin;
  /** Override the user's thresholds (default: useMarginThresholds()). */
  thresholds?: MarginThresholds;
  onPress?: () => void;
  /** Long press → open <ProductActionsSheet> (fires a select haptic). */
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const ProductCard = React.memo(function ProductCard({ product, thresholds, onPress, onLongPress, style, testID }: ProductCardProps) {
  const userThresholds = useMarginThresholds();
  const t = thresholds ?? userThresholds;
  const margin = product.computed?.marginPercent ?? 0;
  const zone = getMarginZone(margin, t);
  const gain = product.computed?.marginPerDoseHT ?? 0;
  const { label, price, extra } = primaryPrice(product);
  const category = product.category?.name;

  // Only the category name may be shortened: the volume and degree always stay visible.
  const specs = [formatVolumeCl(product.containerVolumeCl), product.alcoholDegree > 0 ? compactDegree(product.alcoholDegree) : null]
    .filter(Boolean)
    .join(' · ');

  const a11y = [
    product.name,
    category,
    `${formatEuro(price)} ${label}${extra > 0 ? `, et ${extra} autre${extra > 1 ? 's' : ''} service${extra > 1 ? 's' : ''}` : ''}`,
    `marge ${formatPercent(margin)}, ${marginColors[zone].label}`,
    `achat ${formatEuro(product.purchasePriceHT)} hors taxes`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      padding={12}
      onPress={onPress}
      onLongPress={
        onLongPress
          ? () => {
              haptics.select();
              onLongPress();
            }
          : undefined
      }
      accessibilityLabel={a11y}
      accessibilityHint={onLongPress ? 'Appui long pour plus d’actions' : undefined}
      style={style}
      testID={testID}
    >
      <View style={styles.row}>
        <View style={styles.thumb}>
          {product.thumbnailUrl ? (
            <Image source={{ uri: product.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <Icon name={categoryIcon(product.category?.slug)} size={26} color={palette.em700} />
          )}
        </View>
        <View style={styles.body}>
          <View style={styles.top}>
            <Text style={styles.name} numberOfLines={2}>
              {product.name}
            </Text>
            <Badge value={margin} thresholds={t} style={styles.badge} />
          </View>
          <View style={styles.middle}>
            <View style={styles.metaRow}>
              {category ? (
                <Text style={[styles.meta, styles.metaCategory]} numberOfLines={1}>
                  {category}
                </Text>
              ) : null}
              {specs ? (
                <Text style={[styles.meta, styles.metaSpecs]} numberOfLines={1}>
                  {category ? `${NBSP}·${NBSP}${specs}` : specs}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.gain, { color: marginColors[zone].fg }]} maxFontSizeMultiplier={1.3}>
              {formatEuro(gain, { sign: true })}
              <Text style={styles.gainUnit}>/dose</Text>
            </Text>
          </View>
          <View style={styles.bottom}>
            <PriceTag label={label} price={price} />
            {extra > 0 ? (
              <View style={styles.extra} accessibilityLabel={`${extra} autre${extra > 1 ? 's' : ''} service${extra > 1 ? 's' : ''}`}>
                <Text style={styles.extraText}>+{extra}</Text>
              </View>
            ) : null}
            <Text style={styles.cost} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              Achat <Text style={styles.costValue}>{formatEuro(product.purchasePriceHT)}</Text> HT
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
});

// ─── ProductActionsSheet ───────────────────────────────────────────────────
export interface ProductActionsSheetProps {
  /** The product whose actions are shown; null/undefined = closed. */
  product?: Pick<ProductWithMargin, 'name'> | null;
  onClose: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  /** Ask with dialog.confirm({ destructive: true }) before deleting. */
  onDelete?: () => void;
}

/** Long-press actions of a product card (Modifier, Dupliquer, Supprimer). */
export function ProductActionsSheet({ product, onClose, onEdit, onDuplicate, onDelete }: ProductActionsSheetProps) {
  const [shown, setShown] = React.useState(product ?? null);
  React.useEffect(() => {
    if (product) setShown(product);
  }, [product]);
  // Close first, then run the action once the sheet is on its way out.
  const run = (fn?: () => void) => () => {
    onClose();
    if (fn) setTimeout(fn, 120);
  };
  return (
    <BottomSheet visible={!!product} onClose={onClose} title={shown?.name ?? ''} subline="Actions" contentPadding={8}>
      {onEdit ? <ListRow icon="create-outline" title="Modifier" onPress={run(onEdit)} right="none" /> : null}
      {onDuplicate ? <ListRow icon="copy-outline" title="Dupliquer" onPress={run(onDuplicate)} right="none" /> : null}
      {onDelete ? <ListRow icon="trash-outline" title="Supprimer" destructive onPress={run(onDelete)} right="none" /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: 3 },
  // Top-aligned: a one-line name sits centred on the 26 px badge (2 px down),
  // a two-line name keeps the badge level with its first line.
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { ...type.headline, color: palette.ink, flex: 1, minWidth: 0, marginTop: 2 },
  badge: { flexShrink: 0 },
  middle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flex: 1, minWidth: 0, flexDirection: 'row' },
  meta: { ...type.footnote, color: palette.text3, fontVariant: ['tabular-nums'] },
  metaCategory: { flexShrink: 1, minWidth: 0 },
  metaSpecs: { flexShrink: 0 },
  bottom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 },
  tag: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: palette.surface2,
    justifyContent: 'center',
  },
  tagLabel: { ...type.footnote, color: palette.text2, fontVariant: ['tabular-nums'] },
  tagSep: { color: palette.text4 },
  tagPrice: { fontFamily: fontFamily.bold, fontSize: 15, letterSpacing: -0.2, color: palette.ink, fontVariant: ['tabular-nums'] },
  extra: {
    height: 24,
    minWidth: 30,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraText: { ...type.footnoteStrong, color: palette.em700, fontVariant: ['tabular-nums'] },
  // Purchase price, right-aligned on the price row (moves under it when the row is full).
  cost: { ...type.footnote, color: palette.text3, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  costValue: { ...type.footnoteStrong, color: palette.text2 },
  gain: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  gainUnit: { fontFamily: fontFamily.medium, color: palette.text3 },
});
