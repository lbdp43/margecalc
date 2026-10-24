/**
 * One detected invoice line in the review list.
 *
 *  (✓)  Jameson Irish Whiskey                 ● 81,9 %  ✎
 *       Spiritueux · 70 cl · 40 % vol.
 *       [Lecture incertaine]                          (when it applies)
 *       ┌ Achat HT · ×6 ────────┬ Vente TTC · 5 cl ────────┐
 *       │ 17,90 € · 107,40 €    │ 6,10 € calculé ×4         │
 *       └───────────────────────┴──────────────────────────┘
 *  ──────────────────────────────────────────────────────────
 *   ↻  Mettre à jour « Jameson Irish Whisky »          Changer   (MatchBlock)
 *      Achat 16,20 → 17,90 € (+10,5 %)
 *
 * The left column toggles the selection (48 wide, the whole card height);
 * the body opens the line editor. Two sibling pressables, never nested; both
 * drive the same press value, so the WHOLE card scales (.98), like every card.
 * The match block (lot 2) sits under both, full width, with its own buttons.
 * An unticked line keeps its text readable (70 % + a sunken card); it is not
 * imported nor matched, so it shows no match block and no « after » margin.
 * While the matching has not answered for a ticked line, the selling tile and
 * the match block say so (« en attente », « Recherche dans vos produits… »)
 * instead of a guess.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@margebar/shared';
import { Badge, Card, PressableScale, useReduceMotion } from '../../components/ui';
import { MatchBlock } from './MatchBlock';
import { marginColors, motion, palette, type } from '../../theme';
import { NBSP, formatDegree, formatEuro, formatPercent, formatVolumeCl } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';
import {
  categoryName,
  containerLabel,
  doseOf,
  priceDecimals,
  quantityLabel,
  validateLine,
  type InvoiceLine,
  type LinePreview,
  type PricingContext,
} from './model';

export interface LineCardProps {
  line: InvoiceLine;
  category: Category | undefined;
  ctx: PricingContext;
  preview: LinePreview;
  supplier: string;
  /** The preview's error for this line (the import would refuse it), shown when the line has no error of its own. */
  previewError?: string | null;
  disabled?: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onLink: (id: string) => void;
  onCreateNew: (id: string) => void;
  onChoose: (id: string) => void;
}

const ALCOHOLIC = new Set(['spiritueux', 'vins', 'bieres']);
const OFF_OPACITY = 0.7;

function LineCardBase({ line, category, ctx, preview, supplier, previewError, disabled, onToggle, onEdit, onLink, onCreateNew, onChoose }: LineCardProps) {
  const reduce = useReduceMotion();
  const thresholds = useMarginThresholds();
  const on = useSharedValue(line.selected ? 1 : 0);
  const press = useSharedValue(0);
  useEffect(() => {
    on.value = reduce ? (line.selected ? 1 : 0) : withTiming(line.selected ? 1 : 0, { duration: motion.duration.fast, easing: motion.easing.standard });
  }, [line.selected, reduce, on]);
  const nameFade = useAnimatedStyle(() => ({ opacity: OFF_OPACITY + (1 - OFF_OPACITY) * on.value }));
  const bodyFade = useAnimatedStyle(() => ({ opacity: OFF_OPACITY + (1 - OFF_OPACITY) * on.value }));
  const cardScale = useAnimatedStyle(() => {
    const p = press.value;
    return { transform: [{ scale: reduce ? 1 : 1 - (1 - motion.pressScale.card) * p }] };
  });

  const errors = validateLine(line);
  const priceMissing = !!errors.purchase;
  const importError = line.importError?.message ?? null;
  const ownError = line.selected ? (errors.purchase ?? errors.name ?? errors.container ?? errors.degree ?? errors.selling ?? null) : null;
  const problem = importError ?? ownError ?? (line.selected ? (previewError ?? null) : null);
  const unsure = line.source === 'ocr' && line.confidence < 0.7;
  const { price, derived, target } = preview;
  // The matching has not answered for this line yet: no guess (it would flip a moment later).
  const pending = !!preview.pending;
  // An unticked line is not imported: no match, no « after the import » margin.
  const marginPercent = pending || !line.selected ? null : preview.marginPercent;
  // The product this line updates (an undecided look-alike reads « si lié »).
  const existing = !pending && (target.kind === 'update' || target.kind === 'decide') ? preview.existing : null;
  const deciding = !pending && target.kind === 'decide';
  const sameAs = !pending && target.kind === 'sameAs' ? target : null;

  const qty = quantityLabel(line.quantity);
  const lineTotal = line.purchasePriceHT && line.purchasePriceHT > 0 && line.quantity && line.quantity > 1 ? line.purchasePriceHT * line.quantity : null;
  const missingDegree = !line.alcoholDegree && ALCOHOLIC.has(line.categorySlug);
  const meta = [
    category?.name ?? categoryName(line.categorySlug),
    containerLabel(line.containerVolumeCl, line.categorySlug),
    line.alcoholDegree ? formatDegree(line.alcoholDegree) : missingDegree ? 'degré non lu' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const name = line.name.trim() || 'Produit sans nom';
  const flagged = !!problem;
  // The dose the price is for: the product's own (its primary service, « 2 cl » for a syrup) when the line
  // updates one, line N's for « same product as line N », else the import's default dose for a new product.
  const { doseCl, soldByUnit } = doseOf(sameAs ? sameAs.source : line, ctx);
  const sellLabel = existing
    ? existing.containerVolumeCl > 0 && existing.doseVolumeCl >= existing.containerVolumeCl
      ? 'l’unité'
      : formatVolumeCl(existing.doseVolumeCl)
    : soldByUnit
      ? 'l’unité'
      : formatVolumeCl(doseCl);
  const zone = marginPercent !== null ? getMarginZone(marginPercent, thresholds) : null;
  const purchaseText = priceMissing ? 'À compléter' : formatEuro(line.purchasePriceHT, { decimals: priceDecimals(line.purchasePriceHT) });
  const sellCaption = pending
    ? null
    : existing
      ? deciding
        ? 'si lié'
        : existing.marginMode === 'fix_selling_price'
          ? 'inchangé'
          : 'recalculé'
      : sameAs
        ? `prix de la ligne${NBSP}${sameAs.lineIndex + 1}`
        : derived
          ? 'calculé ×4'
          : null;
  const targetA11y = !line.selected
    ? 'non cochée, ne sera pas importée'
    : pending
      ? 'recherche dans vos produits en cours'
      : target.kind === 'update'
        ? `met à jour ${target.name}, seul le prix d’achat change`
        : target.kind === 'decide'
          ? `ressemble à ${target.name}, à confirmer`
          : target.kind === 'sameAs'
            ? `même produit que la ligne ${target.lineIndex + 1}`
            : 'nouveau produit';

  const a11y = [
    name,
    meta,
    targetA11y,
    unsure ? 'lecture incertaine' : null,
    priceMissing ? 'prix d’achat à compléter' : `achat ${purchaseText} hors taxes${qty ? `, quantité ${line.quantity}` : ''}`,
    !pending && price > 0
      ? `vente ${formatEuro(price)} TTC${existing ? (deciding ? ', si lié' : ', prix actuel conservé') : sameAs ? `, prix de la ligne ${sameAs.lineIndex + 1}` : derived ? ', calculé fois 4' : ''}`
      : null,
    marginPercent !== null && zone ? `marge ${formatPercent(marginPercent).replace(/\s/g, ' ').replace('%', 'pour cent')}, ${marginColors[zone].label}` : null,
    problem,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View style={cardScale}>
      <Card
        noPadding
        style={[
          styles.card,
          !line.selected && styles.cardOff,
          deciding && line.selected && !flagged && styles.cardDeciding,
          flagged && line.selected && styles.cardFlagged,
        ]}
        testID={`invoice-line-${line.position}`}
      >
        <View style={styles.cardRow}>
          <PressableScale
            onPress={() => onToggle(line.id)}
            disabled={disabled}
            scaleTo="none"
            progress={press}
            haptic="select"
            style={styles.checkCol}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: line.selected, disabled: !!disabled }}
            aria-checked={line.selected}
            aria-disabled={!!disabled}
            accessibilityLabel={name}
            testID={`invoice-line-toggle-${line.position}`}
          >
            <View style={[styles.check, line.selected ? styles.checkOn : styles.checkOff]}>
              {line.selected ? <Ionicons name="checkmark" size={16} color={palette.onEmerald} /> : null}
            </View>
          </PressableScale>

          <PressableScale
            onPress={() => onEdit(line.id)}
            disabled={disabled}
            scaleTo="none"
            progress={press}
            style={styles.body}
            accessibilityRole="button"
            accessibilityLabel={`${a11y}. Modifier la ligne`}
            testID={`invoice-line-edit-${line.position}`}
          >
            <View style={styles.head}>
              <Animated.View style={[styles.nameWrap, nameFade]}>
                <Text style={[styles.name, !line.name.trim() && { color: palette.text3 }]} numberOfLines={2}>
                  {name}
                </Text>
              </Animated.View>
              {marginPercent !== null ? <Badge value={marginPercent} size="sm" style={styles.badge} /> : null}
              <View style={styles.editIcon}>
                <Ionicons name="create-outline" size={18} color={palette.text3} />
              </View>
            </View>

            <Animated.View style={bodyFade}>
              {meta ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {meta}
                </Text>
              ) : null}
            </Animated.View>

            {unsure ? (
              <View style={styles.flags}>
                <Badge variant="neutral" icon="eye-outline" label="Lecture incertaine" size="sm" />
              </View>
            ) : null}

            <Animated.View style={[styles.prices, !line.selected && styles.pricesOff, bodyFade]}>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>Achat HT{qty ? ` · ${qty}` : ''}</Text>
                {/* One Text: on a narrow phone it breaks after « · », never before it. */}
                <Text style={styles.tileText}>
                  <Text style={[styles.tileValue, priceMissing && { color: palette.bad }]}>{purchaseText}</Text>
                  {lineTotal !== null ? <Text style={styles.tileAside}>{`${NBSP}· ${formatEuro(lineTotal)}`}</Text> : null}
                </Text>
              </View>
              <View style={styles.tileSep} />
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>Vente TTC · {pending ? '…' : sellLabel}</Text>
                <View style={styles.tileLine}>
                  {pending ? (
                    <>
                      <Text style={[styles.tileValue, { color: palette.text3 }]}>–</Text>
                      <Text style={styles.tileAside}>en attente</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.tileValue, !(price > 0) && { color: palette.text3 }]}>{price > 0 ? formatEuro(price) : '–'}</Text>
                      {price > 0 && sellCaption ? (
                        <Text style={[styles.tileAside, derived && !existing && !sameAs && styles.derived]}>{sellCaption}</Text>
                      ) : null}
                      {!(price > 0) ? <Text style={styles.tileAside}>à calculer</Text> : null}
                    </>
                  )}
                </View>
              </View>
            </Animated.View>

            {problem ? (
              <View style={styles.problem} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={18} color={palette.bad} style={styles.problemIcon} />
                <Text style={styles.problemText}>{problem}</Text>
              </View>
            ) : null}
          </PressableScale>
        </View>
        {line.selected ? (
          <View style={styles.match}>
            <MatchBlock
              line={line}
              target={target}
              pending={pending}
              ctx={ctx}
              supplier={supplier}
              disabled={disabled}
              onLink={onLink}
              onCreateNew={onCreateNew}
              onChoose={onChoose}
            />
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

export const LineCard = React.memo(LineCardBase);

const styles = StyleSheet.create({
  card: {},
  cardRow: { flexDirection: 'row' },
  cardDeciding: { borderColor: palette.warnSolid },
  match: { paddingLeft: 12, paddingRight: 12, paddingBottom: 12, marginTop: -2 },
  cardOff: { backgroundColor: palette.surface2 },
  cardFlagged: { borderColor: palette.badSolid },
  checkCol: { width: 46, paddingTop: 13, alignItems: 'center', alignSelf: 'stretch' },
  check: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: palette.em700 },
  checkOff: { borderWidth: 2, borderColor: palette.text3, backgroundColor: palette.surface },
  body: { flex: 1, minWidth: 0, paddingTop: 13, paddingBottom: 12, paddingRight: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  nameWrap: { flex: 1, minWidth: 0 },
  name: { ...type.headline, color: palette.ink, paddingTop: 1 },
  badge: { marginTop: 1 },
  editIcon: { width: 20, height: 24, alignItems: 'flex-end', justifyContent: 'center' },
  meta: { ...type.footnote, color: palette.text3, marginTop: 1 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  prices: {
    flexDirection: 'row',
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: palette.surface2,
  },
  pricesOff: { backgroundColor: palette.surface3 },
  tile: { flex: 1, minWidth: 0, paddingHorizontal: 9, paddingVertical: 7 },
  tileSep: { width: 1, marginVertical: 8, backgroundColor: palette.line },
  tileLabel: { ...type.footnote, color: palette.text3 },
  // Value + caption wrap as whole pieces on narrow phones (never « calculé … »).
  tileLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4, marginTop: 1 },
  tileText: { ...type.footnote, color: palette.text3, marginTop: 1 },
  tileValue: { ...type.numS, color: palette.ink },
  tileAside: { ...type.footnote, color: palette.text3 },
  derived: { ...type.footnoteStrong, color: palette.em700 },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  problemIcon: { marginTop: 2 },
  problemText: { ...type.calloutStrong, color: palette.bad, flex: 1 },
});
