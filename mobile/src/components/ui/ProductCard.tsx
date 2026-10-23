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
 *      in the margin colour — or, for a price calculated ×4 by an invoice import that nobody
 *      confirmed yet (`product.priceToReview`, lot 2), an amber « Prix à vérifier » badge instead
 *      of a gain computed from that unconfirmed price
 *   3. a PriceTag for EVERY service, primary first (« Verre de vin 12 cl · 7,00 € »
 *      alone; « Demi · 4,50 € » « Pinte · 8,00 € » side by side when there are
 *      several, see `allPrices`: « c’est combien la pinte ? » reads off the
 *      list), then the purchase price « Achat 18,50 € HT », right-aligned. The
 *      row wraps (pills first, the purchase price on its own line when it no
 *      longer fits); a service name is never truncated. Margin colours use the user's
 * thresholds (or `thresholds`). Mirrors SkeletonProductCard (one service).
 *
 * Names keep « 33 cl », « 30 L », « 40° » on one line (`keepUnits`), so
 * « Chimay Bleue 33 cl » never wraps between « 33 » and « cl ».
 */
import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import type { ProductServing, ProductWithMargin } from '@margebar/shared';
import { fontFamily, marginColors, palette, radius, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { formatEuro, formatNumber, formatPercent, formatVolumeCl, NBSP } from '../../utils/format';
import { getMarginZone, MarginThresholds, useMarginThresholds } from '../../utils/marginThresholds';
import { doseLabel } from '../../utils/servings';
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

/**
 * Names with their units glued (NBSP): « Chimay Bleue 33 cl », « fût 30 L »,
 * « 1 L » never break between the number and the unit.
 */
export function keepUnits(name: string): string {
  return name.replace(/(\d)\s+(cl|ml|l|L|°|%)(?=$|[\s),.;:])/g, `$1${NBSP}$2`);
}

/**
 * Every price of a product, primary first: each service, or the product dose.
 * `label` is the full « Demi 25 cl »; `short` is what a card prints: the full
 * label for a single price, the service name alone when there are several
 * (« Demi · 4,50 € » « Pinte · 8,00 € »: shorter pills, so two of them share a
 * line on most phones; with the tighter multi-price pills of ProductCard they
 * do down to 360 px), unless two services share a name (then the volume tells
 * them apart).
 */
export function allPrices(product: ProductWithMargin): { key: string; label: string; short: string; price: number }[] {
  const list = sortedServings(product).filter((s) => s.servingType);
  if (!list.length) {
    const { label, price } = primaryPrice(product);
    return [{ key: 'dose', label, short: label, price }];
  }
  const names = list.map((s) => s.servingType!.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || s.servingType!.name);
  const unique = new Set(names.map((n) => n.toLowerCase())).size === names.length;
  return list.map((s, i) => {
    const label = servingLabel(s.servingType!.name, s.servingType!.volumeCl);
    return { key: s.servingTypeId, label, short: list.length > 1 && unique ? names[i] : label, price: s.sellingPriceTTC };
  });
}

/** Label + price of what the card shows: the primary service, or the product dose. */
export function primaryPrice(product: ProductWithMargin): { label: string; price: number; extra: number } {
  const servings = sortedServings(product);
  const first = servings[0];
  if (first?.servingType) {
    return { label: servingLabel(first.servingType.name, first.servingType.volumeCl), price: first.sellingPriceTTC, extra: servings.length - 1 };
  }
  // « À l’unité » for a can or a bottle sold whole (same name as the quick sheet and the detail).
  return { label: doseLabel(product.containerVolumeCl, product.doseVolumeCl), price: product.computed?.sellingPriceTTC ?? product.sellingPriceTTC ?? 0, extra: 0 };
}

// ─── PriceTag ──────────────────────────────────────────────────────────────
export interface PriceTagProps {
  /** Service, e.g. « Verre 12 cl ». */
  label: string;
  /** TTC price. */
  price: number;
  /** Default « label : price ». */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Pill « Verre 12 cl · 7,00 € »: the label is never truncated. */
export function PriceTag({ label, price, accessibilityLabel, style }: PriceTagProps) {
  return (
    <View style={[styles.tag, style]} accessible accessibilityLabel={accessibilityLabel ?? `${label} : ${formatEuro(price)}`}>
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
  const prices = allPrices(product);
  const toReview = product.priceToReview === true;
  // Several services: tighter pills, so « Demi · 4,50 € » « Pinte · 8,00 € » share a line at 360 px.
  const several = prices.length > 1;
  const category = product.category?.name;

  // Nothing is shortened: the volume and degree stay together, the line wraps after « · ».
  const specs = [formatVolumeCl(product.containerVolumeCl), product.alcoholDegree > 0 ? compactDegree(product.alcoholDegree) : null]
    .filter(Boolean)
    .join(' · ');

  const a11y = [
    product.name,
    category,
    prices.map((x) => `${x.label} ${formatEuro(x.price)}`).join(', '),
    // A price calculated ×4 is not confirmed: no « bonne » verdict on it.
    toReview ? `marge ${formatPercent(margin)}, prix à vérifier, calculé par l’import de facture` : `marge ${formatPercent(margin)}, ${marginColors[zone].label}`,
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
              {keepUnits(product.name)}
            </Text>
            {toReview ? (
              // Neutral until the user confirms the ×4 price (never a green « good » on a price nobody chose).
              <Badge variant="neutral" label={formatPercent(margin)} style={styles.badge} accessibilityLabel={`Marge ${formatPercent(margin)}, prix à vérifier`} />
            ) : (
              <Badge value={margin} thresholds={t} style={styles.badge} />
            )}
          </View>
          <View style={styles.middle}>
            {/* Never truncated: a long category (« Ingrédients cocktails ») wraps to a second line. */}
            <Text style={[styles.meta, styles.metaRow]} numberOfLines={2}>
              {[category, specs.replace(/ /g, NBSP)].filter(Boolean).join(`${NBSP}· `)}
            </Text>
            {toReview ? (
              <Badge zone="orange" noDot label="Prix à vérifier" size="sm" accessibilityLabel="Prix à vérifier" />
            ) : (
              <Text style={[styles.gain, { color: marginColors[zone].fg }]} maxFontSizeMultiplier={1.3}>
                {formatEuro(gain, { sign: true })}
                <Text style={styles.gainUnit}>/dose</Text>
              </Text>
            )}
          </View>
          <View style={[styles.bottom, several ? styles.bottomSeveral : null]}>
            {prices.map((x) => (
              <PriceTag
                key={x.key}
                label={x.short}
                price={x.price}
                accessibilityLabel={`${x.label} : ${formatEuro(x.price)}`}
                style={several ? styles.tagSeveral : undefined}
              />
            ))}
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
  /**
   * The product whose actions are shown; null/undefined = closed. With its
   * purchase price and margin, « Changer le prix » says « Prix conseillé en un
   * toucher » only when the quick sheet will offer one (a cost, under the objective).
   */
  product?: (Pick<ProductWithMargin, 'name'> & Partial<Pick<ProductWithMargin, 'purchasePriceHT' | 'computed'>>) | null;
  onClose: () => void;
  /** « Changer le prix » (first row): open the quick price sheet. */
  onChangePrice?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  /** Ask with dialog.confirm({ destructive: true }) before deleting. */
  onDelete?: () => void;
}

/** Long-press actions of a product card (Changer le prix, Modifier, Dupliquer, Supprimer). */
export function ProductActionsSheet({ product, onClose, onChangePrice, onEdit, onDuplicate, onDelete }: ProductActionsSheetProps) {
  const t = useMarginThresholds();
  const [shown, setShown] = React.useState(product ?? null);
  const margin = shown?.computed?.marginPercent;
  const suggests = (shown?.purchasePriceHT ?? 0) > 0 && typeof margin === 'number' && margin < t.good;
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
      {onChangePrice ? (
        <ListRow
          icon="pricetag-outline"
          title="Changer le prix"
          subtitle={suggests ? 'Prix conseillé en un toucher' : undefined}
          onPress={run(onChangePrice)}
          right="none"
          testID="action-price"
        />
      ) : null}
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
  metaRow: { flex: 1, minWidth: 0 },
  meta: { ...type.footnote, color: palette.text3, fontVariant: ['tabular-nums'] },
  bottom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 },
  bottomSeveral: { gap: 4 },
  tag: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: palette.surface2,
    justifyContent: 'center',
  },
  tagSeveral: { paddingHorizontal: 8 },
  tagLabel: { ...type.footnote, color: palette.text2, fontVariant: ['tabular-nums'] },
  tagSep: { color: palette.text4 },
  tagPrice: { fontFamily: fontFamily.bold, fontSize: 15, letterSpacing: -0.2, color: palette.ink, fontVariant: ['tabular-nums'] },
  // Purchase price, right-aligned on the price row (moves under it when the row is full).
  cost: { ...type.footnote, color: palette.text3, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  costValue: { ...type.footnoteStrong, color: palette.text2 },
  gain: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  gainUnit: { fontFamily: fontFamily.medium, color: palette.text3 },
});
