/**
 * One detected invoice line in the review list.
 *
 *  (✓)  Jameson Irish Whiskey                         ✎
 *       Spiritueux · 70 cl · 40 % vol.
 *       ┌ Achat HT ─────────┬ Vente TTC ─────────────┐
 *       │ 17,90 €           │ 6,10 €                 │
 *       │ ×6 · 107,40 € HT  │ calculé ×4 · dose 5 cl │
 *       └───────────────────┴────────────────────────┘
 *
 * The left column toggles the selection (44 wide, the whole card height);
 * the body opens the line editor. Two sibling pressables, never nested.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@margebar/shared';
import { Badge, PressableScale, useReduceMotion } from '../../components/ui';
import { elevation, motion, palette, radius, type } from '../../theme';
import { formatDegree, formatEuro, formatVolumeCl } from '../../utils/format';
import {
  containerLabel,
  doseOf,
  effectivePrice,
  quantityLabel,
  validateLine,
  type InvoiceLine,
  type PricingContext,
} from './model';

export interface LineCardProps {
  line: InvoiceLine;
  category: Category | undefined;
  ctx: PricingContext;
  disabled?: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
}

function LineCardBase({ line, category, ctx, disabled, onToggle, onEdit }: LineCardProps) {
  const reduce = useReduceMotion();
  const on = useSharedValue(line.selected ? 1 : 0);
  useEffect(() => {
    on.value = reduce ? (line.selected ? 1 : 0) : withTiming(line.selected ? 1 : 0, { duration: motion.duration.fast, easing: motion.easing.standard });
  }, [line.selected, reduce, on]);
  const bodyFade = useAnimatedStyle(() => ({ opacity: 0.46 + 0.54 * on.value }));

  const errors = validateLine(line);
  const priceMissing = !!errors.purchase;
  const importError = line.importError?.message ?? null;
  const problem = importError ?? (line.selected ? errors.purchase ?? errors.name ?? errors.container ?? errors.selling ?? null : null);
  const unsure = line.source === 'ocr' && line.confidence < 0.7;

  const { price, derived } = effectivePrice(line, ctx);
  const qty = quantityLabel(line.quantity);
  const lineTotal = line.purchasePriceHT && line.purchasePriceHT > 0 ? line.purchasePriceHT * (line.quantity && line.quantity > 0 ? line.quantity : 1) : null;
  const meta = [category?.name ?? null, containerLabel(line.containerVolumeCl, line.categorySlug), line.alcoholDegree ? formatDegree(line.alcoholDegree) : null]
    .filter(Boolean)
    .join(' · ');
  const name = line.name.trim() || 'Produit sans nom';
  const flagged = !!problem;

  const a11y = [
    name,
    meta,
    priceMissing ? 'prix d’achat à compléter' : `achat ${formatEuro(line.purchasePriceHT)} hors taxes`,
    price > 0 ? `vente ${formatEuro(price)} TTC${derived ? ', calculé fois 4' : ''}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.card, flagged && line.selected && styles.cardFlagged]} testID={`invoice-line-${line.position}`}>
      <PressableScale
        onPress={() => onToggle(line.id)}
        disabled={disabled}
        scaleTo="chip"
        haptic="select"
        style={styles.checkCol}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: line.selected, disabled }}
        accessibilityLabel={`${line.selected ? 'Désélectionner' : 'Sélectionner'} ${name}`}
        testID={`invoice-line-toggle-${line.position}`}
      >
        <View style={[styles.check, line.selected ? styles.checkOn : styles.checkOff]}>
          {line.selected ? <Ionicons name="checkmark" size={16} color={palette.onEmerald} /> : null}
        </View>
      </PressableScale>

      <PressableScale
        onPress={() => onEdit(line.id)}
        disabled={disabled}
        scaleTo="card"
        style={styles.body}
        accessibilityRole="button"
        accessibilityLabel={`${a11y}. Modifier la ligne`}
        testID={`invoice-line-edit-${line.position}`}
      >
        <Animated.View style={bodyFade}>
          <View style={styles.head}>
            <Text style={[styles.name, !line.name.trim() && { color: palette.text3 }]} numberOfLines={2}>
              {name}
            </Text>
            {unsure ? <Badge zone="orange" label="À vérifier" size="sm" noDot style={styles.unsure} /> : null}
            <View style={styles.editIcon}>
              <Ionicons name="create-outline" size={18} color={palette.text3} />
            </View>
          </View>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}

          <View style={styles.prices}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>Achat HT</Text>
              <Text style={[styles.tileValue, priceMissing && { color: palette.bad }]} numberOfLines={1}>
                {priceMissing ? 'À compléter' : formatEuro(line.purchasePriceHT)}
              </Text>
              <Text style={styles.tileCaption} numberOfLines={1}>
                {lineTotal !== null ? (qty ? `${qty} · ${formatEuro(lineTotal)}` : 'l’unité') : qty ?? 'l’unité'}
              </Text>
            </View>
            <View style={styles.tileSep} />
            <View style={styles.tile}>
              <Text style={styles.tileLabel} numberOfLines={1}>
                Vente TTC · {formatVolumeCl(doseOf(line, ctx).doseCl)}
              </Text>
              <Text style={[styles.tileValue, !(price > 0) && { color: palette.text3 }]} numberOfLines={1}>
                {price > 0 ? formatEuro(price) : '–'}
              </Text>
              <Text style={[styles.tileCaption, derived && price > 0 && styles.derived]} numberOfLines={1}>
                {!(price > 0) ? 'à calculer' : derived ? 'calculé ×4' : doseOf(line, ctx).soldByUnit ? 'à l’unité' : 'votre prix'}
              </Text>
            </View>
          </View>

          {problem ? (
            <View style={styles.problem} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={16} color={palette.bad} />
              <Text style={styles.problemText}>{problem}</Text>
            </View>
          ) : null}
        </Animated.View>
      </PressableScale>
    </View>
  );
}

export const LineCard = React.memo(LineCardBase);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    ...elevation.e2,
  },
  cardFlagged: { borderColor: palette.badSolid },
  checkCol: { width: 48, paddingTop: 14, alignItems: 'center', alignSelf: 'stretch' },
  check: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: palette.em700 },
  checkOff: { borderWidth: 2, borderColor: palette.lineStrong, backgroundColor: palette.surface },
  body: { flex: 1, minWidth: 0, paddingTop: 14, paddingBottom: 14, paddingRight: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { ...type.headline, color: palette.ink, flex: 1, minWidth: 0, paddingTop: 1 },
  unsure: { marginTop: 0 },
  editIcon: { width: 22, height: 24, alignItems: 'flex-end', justifyContent: 'center' },
  meta: { ...type.footnote, color: palette.text3, marginTop: 2 },
  prices: {
    flexDirection: 'row',
    marginTop: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surface2,
  },
  tile: { flex: 1, minWidth: 0, paddingHorizontal: 11, paddingVertical: 8 },
  tileSep: { width: 1, marginVertical: 10, backgroundColor: palette.line },
  tileLabel: { ...type.footnoteStrong, color: palette.text3 },
  tileValue: { ...type.numM, fontSize: 17, lineHeight: 22, color: palette.ink, marginTop: 1 },
  tileCaption: { ...type.footnote, color: palette.text3, marginTop: 1 },
  derived: { ...type.footnoteStrong, color: palette.em700 },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  problemText: { ...type.footnoteStrong, color: palette.bad, flex: 1 },
});
