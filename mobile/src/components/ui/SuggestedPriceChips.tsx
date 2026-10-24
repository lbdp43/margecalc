/**
 * « Prix conseillés » (lot 1 n° 1, mockup 1): touchable price chips under a
 * selling price, so the right price is one tap away instead of a sentence to
 * copy.
 *
 *   <SuggestedPriceChips costHT={cost} tva={0.2} price={price} onSelect={setPrice} />
 *
 *   Prix conseillés                         Arrondi 0,10 € ⌄
 *   [ 13,10 € ✓ ] [ 13,50 €   ] [ 14,00 €   ]
 *   [ objectif 65 %] [ marge 66,2 %] [ marge 67,4 %]
 *   ✓ Objectif atteint (+0,2 pts)            ← or « Sous l’objectif de 65 % (−6,4 pts) »
 *
 * - The first chip is the objective price rounded UP to the user's « Arrondi
 *   des prix » (utils/pricing), the next ones are round prices above it.
 * - A price that already reaches the objective is never offered a lower one:
 *   only the chips at or above it stay (the others leave empty slots, so the
 *   chips keep their size), and with none left the block says « Objectif
 *   atteint (+17,1 pts) » with the floor price, to the cent, as a plain line
 *   (« Prix plancher à l’objectif : 1,95 € »), not a button. « The price » is the one typed or
 *   stepped to: a price picked with a chip does not hide the chips under it,
 *   so 11,00 € → tap 13,50 € still offers 13,10 €.
 * - The chip equal to the current price is selected (em700, lime check).
 * - « Arrondi 0,10 € » opens an inline 0,05 · 0,10 · 0,50 € control (saved
 *   for the account, like Réglages): no second sheet over a sheet.
 * - Renders nothing when no price can be suggested (no purchase price, an
 *   objective of 100 %): the caller keeps its own hint.
 * - Margin colours and the objective come from the user's thresholds.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { fontFamily, palette, radius, type } from '../../theme';
import { formatEuro, formatPercent, formatPoints, NBSP } from '../../utils/format';
import { MarginThresholds, useMarginThresholds } from '../../utils/marginThresholds';
import { marginAt, objectivePrice, priceSuggestions, samePrice } from '../../utils/pricing';
import { PRICE_ROUNDINGS, PriceRounding, usePriceRounding } from '../../utils/priceRounding';
import { savePriceRounding } from '../../store/systemParams.store';
import { fitFontSize } from '../../utils/textFit';
import { FadeIn } from './motion';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { SegmentedControl } from './SegmentedControl';

export interface SuggestedPriceChipsProps {
  /** HT cost of one dose (purchase price × dose ÷ container). */
  costHT: number;
  /** TVA rate (0.2). */
  tva: number;
  /** Current TTC price: its chip is selected, and it decides « Objectif atteint ». */
  price: number | null | undefined;
  /** A chip was tapped: set this TTC price. */
  onSelect: (price: number) => void;
  /** Default: the user's thresholds (Réglages). */
  thresholds?: MarginThresholds;
  /** Default: the user's « Arrondi des prix ». */
  rounding?: number;
  /** Show the « Arrondi 0,10 € » link and its inline control (default true). */
  roundingControl?: boolean;
  /** Hide the « Objectif atteint » / « Sous l’objectif » line (default false). */
  hideStatus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const GAP = 8;
const CHIP_PAD = 10;
const PRICE_SIZE = 19;
const CAPTION_SIZE = 13;

/** « 0,10 € » — the rounding step as the user reads it. */
export function roundingLabel(step: number): string {
  return formatEuro(step);
}

const spoken = (s: string) => s.replace(/ /g, ' ').replace(/€/g, 'euros').replace(/%/g, 'pour cent').replace(/pts/g, 'points');

export function SuggestedPriceChips({
  costHT,
  tva,
  price,
  onSelect,
  thresholds,
  rounding,
  roundingControl = true,
  hideStatus = false,
  style,
  testID = 'suggested-prices',
}: SuggestedPriceChipsProps) {
  const userThresholds = useMarginThresholds();
  const userRounding = usePriceRounding();
  const t = thresholds ?? userThresholds;
  const step = rounding ?? userRounding;
  const [rowWidth, setRowWidth] = useState(0);
  /** Measured width of the widest long caption (« objectif 65 % », « marge 66,2 % »). */
  const [captionWidths, setCaptionWidths] = useState<Record<string, number>>({});
  const [picking, setPicking] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The price the chips are measured against: the one given, unless it was just
  // set by one of these chips (then the earlier one stays, so the row does not
  // change under the finger).
  const picked = useRef<number | null>(null);
  const base = useRef<number | null | undefined>(price);
  if (!samePrice(price, picked.current)) {
    base.current = price;
    picked.current = null;
  }
  const select = useCallback(
    (p: number) => {
      picked.current = p;
      onSelect(p);
    },
    [onSelect],
  );
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const onRowLayout = useCallback((e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width), []);
  const pickRounding = useCallback((key: string) => {
    const next = PRICE_ROUNDINGS.find((r) => String(r) === key) as PriceRounding | undefined;
    if (!next) return;
    savePriceRounding(next);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    // The thumb slides, then the control folds away.
    closeTimer.current = setTimeout(() => setPicking(false), 420);
  }, []);

  const all = priceSuggestions(costHT, tva, t.good, step);
  if (!all.length) return null;

  const current = typeof price === 'number' && price > 0 ? marginAt(costHT, tva, price) : NaN;
  const met = isFinite(current) && current >= t.good - 1e-9;
  // Already at the objective: never suggest a price cut (only the chips at or above the price stay).
  const floor = Math.min(price as number, typeof base.current === 'number' && base.current > 0 ? base.current : Infinity);
  const suggestions = met ? all.filter((s) => s.price >= floor - 0.004) : all;
  if (!suggestions.length && hideStatus) return null;
  // The gap of the margin as the tiles print it (to 0,01 like the API, then 0,1):
  // « 58,6 % » and « −6,4 pts » always agree. Never « 0,0 pts »: a price a cent
  // under the objective reads « −0,1 pts », one just on it « +0,1 pts ».
  const shown = Math.round(Math.round(current * 100) / 10 + 1e-9) / 10;
  const gap = !isFinite(current) ? NaN : met ? Math.max(0.1, shown - t.good) : Math.min(-0.1, shown - t.good);

  const objective = formatPercent(t.good, Number.isInteger(t.good) ? 0 : 1);
  // Room for the text inside one chip (3 slots, 2 gaps, padding, 1 px border):
  // the chips keep that width when fewer of them are left.
  const slots = all.length;
  const chipText = rowWidth > 0 ? (rowWidth - GAP * (slots - 1)) / slots - CHIP_PAD * 2 - 2 : 0;
  const prices = suggestions.map((s) => formatEuro(s.price));
  const priceSize = chipText > 0 ? Math.min(...prices.map((p) => fitFontSize(p, chipText, PRICE_SIZE, 14))) : PRICE_SIZE;
  const longCaptions = suggestions.map((s) => (s.kind === 'objective' ? `objectif ${objective}` : `marge ${formatPercent(s.margin)}`));
  // The long captions are measured off screen (exact on every font and zoom); on a
  // narrow chip they become « obj. 65 % » and « 66,2 % » instead of being cut.
  const short = chipText > 0 && longCaptions.some((c) => (captionWidths[c] ?? 0) > chipText + 0.5);
  const captions = short ? suggestions.map((s) => (s.kind === 'objective' ? `obj. ${objective}` : formatPercent(s.margin))) : longCaptions;


  return (
    <View style={style} testID={testID}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          Prix conseillés
        </Text>
        {roundingControl ? (
          <PressableScale
            onPress={() => setPicking((v) => !v)}
            scaleTo="chip"
            haptic="select"
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Arrondi des prix : ${spoken(roundingLabel(step))}. Modifier`}
            accessibilityState={{ expanded: picking }}
            style={styles.link}
            testID={`${testID}-rounding`}
          >
            <Text style={styles.linkText}>Arrondi {roundingLabel(step)}</Text>
            <Icon name={picking ? 'chevron-up' : 'chevron-down'} size={14} color={palette.em700} />
          </PressableScale>
        ) : null}
      </View>

      {picking ? (
        <FadeIn offset={4} duration={160} style={styles.picker}>
          <SegmentedControl
            options={PRICE_ROUNDINGS.map((r) => ({ key: String(r), label: roundingLabel(r), accessibilityLabel: `Arrondir à ${spoken(roundingLabel(r))}` }))}
            value={String(step)}
            onChange={pickRounding}
            accessibilityLabel="Arrondi des prix conseillés"
          />
          <Text style={styles.pickerNote}>Toujours vers le haut : jamais sous l’objectif.</Text>
        </FadeIn>
      ) : null}

      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {longCaptions.map((c) => (
          <Text
            key={c}
            style={styles.caption}
            numberOfLines={1}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              setCaptionWidths((m) => (Math.abs((m[c] ?? -1) - w) < 0.5 ? m : { ...m, [c]: w }));
            }}
          >
            {c}
          </Text>
        ))}
      </View>
      {suggestions.length ? (
        <View style={styles.row} onLayout={onRowLayout}>
          {suggestions.map((s, i) => {
            const on = samePrice(price, s.price);
            const label = `${spoken(prices[i])}, ${s.kind === 'objective' ? `objectif ${spoken(objective)}` : `marge ${spoken(formatPercent(s.margin))}`}`;
            return (
              <PressableScale
                key={`${s.kind}-${s.price}`}
                onPress={() => select(s.price)}
                scaleTo="chip"
                haptic="select"
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && styles.chipOn]}
                testID={`${testID}-${i}`}
              >
                <Text style={[styles.price, priceSize < PRICE_SIZE && { fontSize: priceSize, letterSpacing: -0.02 * priceSize }, on && styles.priceOn]} numberOfLines={1}>
                  {prices[i]}
                </Text>
                <Text style={[styles.caption, on && styles.captionOn]} numberOfLines={1}>
                  {captions[i]}
                </Text>
                {on ? (
                  <View style={styles.check} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Icon name="checkmark" size={13} color={palette.onLime} />
                  </View>
                ) : null}
              </PressableScale>
            );
          })}
          {/* Empty slots: the chips left keep their width instead of stretching. */}
          {Array.from({ length: slots - suggestions.length }, (_, i) => (
            <View key={`slot-${i}`} style={styles.slot} />
          ))}
        </View>
      ) : null}

      {hideStatus || !isFinite(current) ? null : (
        <View
          style={[styles.status, met ? styles.statusMet : null]}
          accessibilityLiveRegion="polite"
          accessible
          accessibilityLabel={met ? `Objectif atteint, ${spoken(formatPoints(gap))}` : `Sous l’objectif de ${spoken(objective)}, ${spoken(formatPoints(gap))}`}
          testID={`${testID}-status`}
        >
          <Icon name={met ? 'checkmark-circle' : 'flag-outline'} size={18} color={met ? palette.good : palette.text3} />
          <Text style={[styles.statusText, met ? styles.statusTextMet : null]}>
            {met ? `Objectif atteint (${formatPoints(gap)})` : `Sous l’objectif de ${objective} (${formatPoints(gap)})`}
          </Text>
        </View>
      )}
      {/* The lowest price reaching the objective, to the cent (the form's slider marker says the same). */}
      {suggestions.length ? null : (
        <Text style={styles.floor} testID={`${testID}-floor`}>
          Prix plancher à l’objectif{NBSP}: {formatEuro(objectivePrice(costHT, tva, t.good) ?? all[0].price)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 28 },
  title: { ...type.calloutStrong, color: palette.ink, flexShrink: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  linkText: { ...type.footnoteStrong, color: palette.em700 },
  picker: { marginTop: 8, gap: 6 },
  pickerNote: { ...type.footnote, color: palette.text3 },
  // Room above for the selected chip's check badge.
  row: { flexDirection: 'row', gap: GAP, marginTop: 14 },
  // Off-screen copies of the long captions, at their natural width.
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, alignItems: 'flex-start' },
  chip: {
    flex: 1,
    minWidth: 0,
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    backgroundColor: palette.surface,
    paddingHorizontal: CHIP_PAD,
    paddingVertical: 10,
    justifyContent: 'center',
    overflow: 'visible',
  },
  chipOn: { backgroundColor: palette.em700, borderColor: palette.em700 },
  price: { fontFamily: fontFamily.extrabold, fontSize: PRICE_SIZE, lineHeight: 24, letterSpacing: -0.4, color: palette.ink, fontVariant: ['tabular-nums'] },
  priceOn: { color: palette.onEmerald },
  caption: { fontFamily: fontFamily.semibold, fontSize: CAPTION_SIZE, lineHeight: 17, color: palette.text3, marginTop: 1, fontVariant: ['tabular-nums'] },
  captionOn: { color: palette.onEmerald2 },
  check: {
    position: 'absolute',
    top: -7,
    right: -5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.lime,
    borderWidth: 2,
    borderColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: palette.surface2,
  },
  statusMet: { backgroundColor: palette.goodBg },
  statusText: { ...type.footnoteStrong, color: palette.text2, flexShrink: 1 },
  statusTextMet: { color: palette.good },
  slot: { flex: 1, minWidth: 0 },
  floor: { ...type.footnote, color: palette.text3, marginTop: 8 },
});
