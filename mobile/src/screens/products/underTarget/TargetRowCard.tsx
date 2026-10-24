/**
 * One row of « Sous l’objectif » (mockup 2): a service under the objective.
 *
 *   [icon] Champagne Moët Brut                         (tap → the product)
 *          Verre de vin 12 cl · +8,08 € par verre
 *   ┌ 9,00 €   →  18,70 €                  [Appliquer] ┐
 *   └ 27,5 %      ✓ 65,1 %                             ┘
 *   ! +108 % : vérifiez d’abord l’achat (34,00 € HT).  [13,10 € · seuil 50 %]
 *
 * Applied: the box turns goodBg, « Appliqué » replaces the button and an
 * inline « Annuler » puts the old price back (review logic adapted from Kokonut
 * UI « AI Diff Review » by @kokonutui, kokonutui.com, MIT License, Copyright (c)
 * 2025 kokonutUI: decided rows stay in place with their own undo, no layout jump).
 */
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Icon, PressableScale } from '../../../components/ui';
import { fontFamily, marginColors, palette, radius, type } from '../../../theme';
import { formatEuro, formatNumber, formatPercent, NBSP } from '../../../utils/format';
import type { MarginThresholds } from '../../../utils/marginThresholds';
import type { TargetRow } from './model';

export interface AppliedState {
  /** The TTC price that was applied (suggested, or the « seuil » price). */
  price: number;
  margin: number;
}

export interface TargetRowCardProps {
  row: TargetRow;
  thresholds: MarginThresholds;
  applied?: AppliedState | null;
  /** A request for this row's product is running (spinner on its button). */
  busy?: boolean;
  /** Another write runs (« Tout appliquer »): buttons inactive, no spinner. */
  disabled?: boolean;
  /** Narrow phone (< 375 px): tighter box. */
  narrow?: boolean;
  onApply: (row: TargetRow, price: number) => void;
  onUndo: (row: TargetRow) => void;
  onOpen: (productId: string) => void;
}

const spoken = (s: string) => s.replace(/[  ]/g, ' ').replace(/%/g, 'pour cent').replace(/€/g, 'euros');

/** Web: the before → after block reads as one labelled image (children presentational); native: one text element. */
const GROUP_ROLE = Platform.OS === 'web' ? 'image' : 'text';

export const TargetRowCard = React.memo(function TargetRowCard({ row, thresholds, applied, busy, disabled, narrow, onApply, onUndo, onOpen }: TargetRowCardProps) {
  const was = marginColors[row.zone];
  const good = marginColors.green;
  const newPrice = applied ? applied.price : row.suggested;
  const newMargin = applied ? applied.margin : row.newMargin;
  const reached = newMargin >= thresholds.good;
  const newZoneFg = reached ? good.fg : newMargin >= thresholds.medium ? marginColors.orange.fg : marginColors.red.fg;
  // HT gain per dose of the price shown (the « seuil » price once applied, not the suggestion).
  const gainDelta = applied ? Math.round(((newPrice - row.price) / (1 + (row.tva > 0 ? row.tva : 0))) * 100) / 100 : row.gainDelta;
  const gain = `${formatEuro(gainDelta, { sign: true })} par ${row.noun}`;
  const guard = !applied ? row.guard : null;
  const inactive = !!busy || !!disabled;

  return (
    <View style={styles.card} testID={`ut-row-${row.key}`}>
      <PressableScale
        onPress={() => onOpen(row.productId)}
        scaleTo="card"
        accessibilityRole="button"
        accessibilityLabel={`${row.productName}, ${row.label}. Ouvrir la fiche`}
        style={styles.head}
      >
        <View style={styles.iconTile}>
          <Icon name={row.icon} size={20} color={palette.em700} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={2}>
            {row.productName}
          </Text>
          <Text style={styles.sub}>
            {row.label}
            {' · '}
            <Text style={styles.gain}>{gain}</Text>
          </Text>
        </View>
      </PressableScale>

      <View style={[styles.change, applied ? styles.changeApplied : null, narrow ? styles.changeNarrow : null]}>
        {/* The before → after figures as ONE element; the button stays its own sibling. */}
        <View
          style={[styles.figures, narrow ? styles.figuresNarrow : null]}
          accessible
          accessibilityRole={GROUP_ROLE}
          accessibilityLabel={
            applied
              ? `Appliqué : ${spoken(formatEuro(newPrice))}, marge ${spoken(formatPercent(newMargin))}. Avant ${spoken(formatEuro(row.price))}`
              : `Actuel ${spoken(formatEuro(row.price))}, marge ${spoken(formatPercent(row.margin))}, ${was.label}. Conseillé ${spoken(formatEuro(newPrice))}, marge ${spoken(formatPercent(newMargin))}`
          }
        >
          <View style={styles.oldCol}>
            <Text style={styles.oldPrice}>{formatEuro(row.price)}</Text>
            <Text style={[styles.k, { color: was.fg }]}>{formatPercent(row.margin)}</Text>
          </View>
          <Icon name="arrow-forward" size={16} color={palette.text3} />
          <View style={styles.newCol}>
            <Text style={styles.newPrice} numberOfLines={1}>
              {formatEuro(newPrice)}
            </Text>
            <View style={styles.newMarginRow}>
              {/* ✓ only once the objective is reached (a « seuil » price stays under it). */}
              <Icon name={reached ? 'checkmark-circle' : 'arrow-up-circle'} size={13} color={newZoneFg} />
              <Text style={[styles.k, { color: newZoneFg }]} numberOfLines={1}>
                {formatPercent(newMargin)}
              </Text>
            </View>
          </View>
        </View>
        {applied ? (
          <Button
            title="Annuler"
            variant="text"
            size="sm"
            icon="arrow-undo"
            onPress={() => onUndo(row)}
            loading={busy}
            disabled={!busy && disabled}
            haptic={false}
            style={narrow ? styles.applyNarrow : styles.apply}
            accessibilityLabel={`Annuler : remettre ${row.productName}, ${row.label} à ${spoken(formatEuro(row.price))}`}
            testID={`ut-undo-${row.key}`}
          />
        ) : (
          <Button
            title="Appliquer"
            variant="secondary"
            // em700 label when active; the kit's disabled grey otherwise (« Tout appliquer » running).
            textStyle={!busy && disabled ? undefined : styles.applyText}
            size="sm"
            onPress={() => onApply(row, row.suggested)}
            loading={busy}
            disabled={!busy && disabled}
            haptic={false}
            style={narrow ? styles.applyNarrow : styles.apply}
            accessibilityLabel={`Appliquer ${spoken(formatEuro(row.suggested))} à ${row.productName}, ${row.label}`}
            testID={`ut-apply-${row.key}`}
          />
        )}
      </View>

      {guard ? (
        <View style={styles.guard} testID={`ut-guard-${row.key}`}>
          <Icon name="alert-circle" size={18} color={palette.warnSolid} />
          <Text style={styles.guardText}>
            {`${formatNumber(guard.jumpPct, 0, { sign: true })}${NBSP}% : vérifiez d’abord l’achat (${formatEuro(row.purchasePriceHT)} HT).`}
          </Text>
          {guard.threshold !== null ? (
            <PressableScale
              onPress={() => onApply(row, guard.threshold as number)}
              scaleTo="chip"
              disabled={inactive}
              accessibilityRole="button"
              accessibilityLabel={`Viser le seuil de ${spoken(formatPercent(thresholds.medium, 0))} : appliquer ${spoken(formatEuro(guard.threshold))}, marge ${spoken(formatPercent(guard.thresholdMargin ?? 0))}`}
              style={[styles.seuil, inactive ? styles.seuilOff : null]}
              testID={`ut-seuil-${row.key}`}
            >
              <Text style={styles.seuilPrice}>{formatEuro(guard.threshold)}</Text>
              <Text style={styles.seuilCaption}>{`seuil ${formatPercent(thresholds.medium, 0)}`}</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  iconTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, minWidth: 0 },
  name: { ...type.headline, color: palette.ink },
  sub: { ...type.footnote, color: palette.text2, marginTop: 1 },
  gain: { fontFamily: fontFamily.bold, color: palette.good },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
  },
  changeNarrow: { gap: 6, paddingLeft: 12, paddingRight: 8 },
  figures: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  figuresNarrow: { gap: 6 },
  changeApplied: { backgroundColor: palette.goodBg },
  oldCol: { minWidth: 0 },
  oldPrice: { ...type.numS, color: palette.text2 },
  k: { ...type.footnoteStrong },
  newCol: { flex: 1, minWidth: 0 },
  newPrice: { ...type.numM, color: palette.ink },
  newMarginRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  apply: { minWidth: 104 },
  applyText: { color: palette.em700 },
  applyNarrow: { minWidth: 0, paddingHorizontal: 12 },
  guard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.warnBg,
    borderRadius: 14,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
  },
  guardText: { ...type.footnoteStrong, color: palette.warn, flex: 1, minWidth: 0 },
  seuil: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seuilOff: { opacity: 0.5 },
  seuilPrice: { ...type.numS, color: palette.ink },
  seuilCaption: { ...type.footnote, fontSize: 12, lineHeight: 15, color: palette.text2 },
});
