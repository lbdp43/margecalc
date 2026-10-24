/**
 * « Prix d’achat HT » sheet (lot 2 n° 8, mockup 3), opened from the product
 * detail (« Prix d’achat HT » row is tappable).
 *
 *   Prix d’achat HT                                              ×
 *   Hendrick’s Gin · 70 cl
 *   Nouveau prix                        32,50 → 35,10 € (+8 %)
 *   [ − 35,10 € + ]
 *   [+5 %] [+8 %] [+10 %]
 *   Prix de vente                    choisissez pour chaque service
 *   Shot 3 cl                                 actuel 6,00 € · 72,1 %
 *   (Garder le prix 6,00 € · marge 69,9 %) (✓ Garder la marge 6,50 € · marge 72,2 %)
 *   …
 *   ● Achat 35,10 € · 2 prix ajustés
 *   [ Enregistrer ]
 *
 * « Garder la marge » is the price that keeps the service's current margin at
 * the new cost (utils/pricing, rounded UP to the user's « Arrondi des prix »).
 * It is the default for a rise; « Garder le prix » for a drop (never a price
 * cut unless the user picks it). One POST /api/products/prices/batch with the
 * purchase price and the services (or the unit price), then the undo toast.
 *
 * A product priced by coefficient or by target margin (no services) gets a
 * third choice, « Garder le coefficient » / « Garder la marge cible »: only the
 * purchase price is sent and the price keeps following it (the default for a
 * rise). The two other choices fix the price, and the sheet says so.
 *
 * Each pair of cards is a radio group (aria-checked on web: react-native-web
 * 0.19 drops accessibilityState).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BatchPriceUpdate, calculateMargin, MarginMode, ProductWithMargin } from '@margebar/shared';
import { BottomSheet, Button, Chip, Icon, NumberInput, PressableScale } from '../../../components/ui';
import { marginColors, palette, radius, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatEuro, formatNumber, formatPercent, formatVolumeCl, NBSP, plural } from '../../../utils/format';
import { getMarginZone, MarginThresholds, useMarginThresholds } from '../../../utils/marginThresholds';
import { doseCost, marginAt, objectivePrice, roundUpToStep, samePrice } from '../../../utils/pricing';
import { usePriceRounding } from '../../../utils/priceRounding';
import { isOnline } from '../../../services/offline';
import { DOSE_KEY, PriceLine, priceLines } from './PriceEditSheet';
import { applyPricesWithUndo, writeErrorMessage } from './productActions';

const RISES = [5, 8, 10];
const round2 = (n: number) => Math.round(n * 100) / 100;
const m2 = (n: number) => (isFinite(n) ? Math.round(n * 100) / 100 : n);

type Choice = 'price' | 'margin' | 'follow';
/** « Hendrick’s Gin 70 cl », « Blonde des Plantes (fût 20 L) »: the name already says the volume. */
const HAS_VOLUME = /\d+(?:[.,]\d+)?\s*(?:cl|ml|l)\b/i;

export interface PurchaseOption {
  price: number;
  margin: number;
}

/** The two choices of one service at a new purchase price. `keepMargin` is null when no margin can be kept (no cost). */
export function purchaseOptions(product: ProductWithMargin, line: PriceLine, newPurchase: number, rounding: number): { before: number; keepPrice: PurchaseOption; keepMargin: PurchaseOption | null } {
  const tva = product.tvaRate;
  const oldCost = doseCost(product.purchasePriceHT, product.containerVolumeCl, line.volumeCl);
  const newCost = doseCost(newPurchase, product.containerVolumeCl, line.volumeCl);
  const before = marginAt(oldCost, tva, line.price);
  // Margins shown are rounded to 0,01 like the API's `computed` (the detail prints the same « 69,1 % »).
  const keepPrice = { price: line.price, margin: m2(marginAt(newCost, tva, line.price)) };
  let keepMargin: PurchaseOption | null = null;
  if (newCost > 0 && isFinite(before) && before < 100) {
    const exact = objectivePrice(newCost, tva, before);
    if (exact !== null) {
      const price = roundUpToStep(exact, rounding);
      keepMargin = { price, margin: m2(marginAt(newCost, tva, price)) };
    }
  }
  return { before: m2(before), keepPrice, keepMargin };
}

/**
 * A coefficient / target-margin product sold without services: the price it
 * would follow at the new purchase price (only `purchasePriceHT` is sent).
 * Null for a fixed-price product, or when it cannot be computed.
 */
export function followOption(product: ProductWithMargin, newPurchase: number): (PurchaseOption & { mode: MarginMode; label: string }) | null {
  if (product.marginMode === MarginMode.FIX_SELLING_PRICE || (product.servings?.length ?? 0) > 0) return null;
  try {
    const r = calculateMargin({
      purchasePriceHT: newPurchase,
      containerVolumeCl: product.containerVolumeCl,
      doseVolumeCl: product.doseVolumeCl,
      marginMode: product.marginMode,
      targetMarginPercent: product.targetMarginPercent ?? undefined,
      coefficient: product.coefficient ?? undefined,
      tvaRate: product.tvaRate,
    });
    if (!(r.sellingPriceTTC > 0)) return null;
    const coef = product.marginMode === MarginMode.FIX_COEFFICIENT;
    const target = product.targetMarginPercent ?? r.marginPercent;
    return {
      price: r.sellingPriceTTC,
      margin: r.marginPercent,
      mode: product.marginMode,
      label: coef ? `×${formatNumber(product.coefficient ?? r.coefficient, 2)}` : `cible ${formatPercent(target, Number.isInteger(target) ? 0 : 1)}`,
    };
  } catch {
    return null;
  }
}

export function PurchasePriceSheet({ product, open, onClose }: { product: ProductWithMargin | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const t = useMarginThresholds();
  const rounding = usePriceRounding();
  /** What the sheet edits, frozen while it is open. */
  const [shown, setShown] = useState<{ product: ProductWithMargin; lines: PriceLine[] } | null>(null);
  const [value, setValue] = useState<number>(0);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || !product) return;
    setShown({ product, lines: priceLines(product) });
    setValue(product.purchasePriceHT);
    setChoices({});
    setSaving(false);
    setSaved(false);
    setError(null);
    // Opened once per `open`: later refetches must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const p = shown?.product ?? null;
  const lines = shown?.lines ?? [];
  const old = p?.purchasePriceHT ?? 0;
  const changed = !!p && !samePrice(value, old);
  const rise = value > old + 0.004;
  const deltaPct = old > 0 ? (value / old - 1) * 100 : NaN;

  const rows = useMemo(
    () =>
      p
        ? lines.map((line) => {
            const o = purchaseOptions(p, line, value, rounding);
            const follow = line.key === DOSE_KEY ? followOption(p, value) : null;
            // A margin already kept by the current price (rounding): one choice only.
            const distinct = !!o.keepMargin && !samePrice(o.keepMargin.price, o.keepPrice.price);
            const fallback: Choice = rise && follow ? 'follow' : rise && distinct ? 'margin' : 'price';
            let choice: Choice = choices[line.key] ?? fallback;
            if ((choice === 'margin' && !distinct) || (choice === 'follow' && !follow)) choice = 'price';
            const chosen = choice === 'follow' && follow ? follow : choice === 'margin' && o.keepMargin ? o.keepMargin : o.keepPrice;
            return { line, ...o, follow, distinct, choice, chosen };
          })
        : [],
    [p, lines, value, rounding, choices, rise],
  );
  const adjusted = rows.filter((r) => !samePrice(r.chosen.price, r.line.price));

  const save = async () => {
    if (!p || saving) return;
    if (!(value >= 0) || !isFinite(value)) {
      setError(`Indiquez un prix d’achat de 0${NBSP}€ ou plus.`);
      haptics.warning();
      return;
    }
    if (!isOnline()) {
      setError('Pas de connexion : rien n’a été enregistré. Réessayez une fois connecté.');
      haptics.warning();
      return;
    }
    const update: BatchPriceUpdate = { productId: p.id, purchasePriceHT: round2(value) };
    const dose = lines.length === 1 && lines[0].key === DOSE_KEY ? rows[0] : null;
    if (dose) {
      // « Garder le coefficient / la marge cible »: the purchase price alone, the price follows it.
      // Otherwise a coefficient / target-margin product gets its chosen price fixed.
      if (dose.choice !== 'follow' && (adjusted.length || p.marginMode !== MarginMode.FIX_SELLING_PRICE)) update.sellingPriceTTC = round2(dose.chosen.price);
    } else if (adjusted.length) {
      update.servings = rows.map((r) => ({ servingTypeId: r.line.key, sellingPriceTTC: round2(r.chosen.price) }));
    }
    setError(null);
    setSaving(true);
    const started = Date.now();
    try {
      await applyPricesWithUndo(queryClient, [update], {
        message: adjusted.length
          ? `Achat ${formatEuro(value)} · ${plural(adjusted.length, 'prix ajusté', 'prix ajustés')}`
          : `Prix d’achat enregistré : ${formatEuro(value)}`,
      });
      await new Promise((r) => setTimeout(r, Math.max(0, 400 - (Date.now() - started))));
      setSaving(false);
      setSaved(true);
      haptics.success();
      closeTimer.current = setTimeout(onClose, 650);
    } catch (err) {
      setSaving(false);
      setError(writeErrorMessage(err, 'save'));
      haptics.warning();
    }
  };

  // A rise chip picked: its own « +5 % » (rounding to the cent would print « +4,8 % »).
  const chipPct = old > 0 ? RISES.find((pct) => samePrice(value, round2(old * (1 + pct / 100)))) : undefined;
  const pctText =
    chipPct !== undefined
      ? `+${chipPct}${NBSP}%`
      : isFinite(deltaPct)
        ? `${formatNumber(deltaPct, Math.abs(deltaPct - Math.round(deltaPct)) < 0.05 ? 0 : 1, { sign: true })}${NBSP}%`
        : null;
  const changeText = changed ? `${formatEuro(old, { bare: true })} → ${formatEuro(value)}${pctText ? ` (${pctText})` : ''}` : `actuel ${formatEuro(old)}`;
  const subline = p ? `${p.name}${HAS_VOLUME.test(p.name) ? '' : ` · ${formatVolumeCl(p.containerVolumeCl)}`} · droits inclus` : undefined;
  const summary = changed
    ? `Achat ${formatEuro(value)}${adjusted.length ? ` · ${plural(adjusted.length, 'prix ajusté', 'prix ajustés')}` : ' · prix de vente inchangés'}`
    : null;

  return (
    <BottomSheet
      visible={open}
      onClose={onClose}
      title="Prix d’achat HT"
      subline={subline}
      footer={
        <View style={styles.footer}>
          {summary ? (
            <View style={styles.summaryRow}>
              <View style={styles.dot} />
              <Text style={styles.summary} numberOfLines={2} testID="purchase-summary">
                {summary}
              </Text>
            </View>
          ) : null}
          <Button
            title={changed ? 'Enregistrer' : 'Prix inchangé'}
            icon="checkmark-circle"
            onPress={save}
            loading={saving}
            success={saved}
            disabled={!changed && !saved}
            fullWidth
            testID="purchase-save"
          />
        </View>
      }
      testID="purchase-sheet"
    >
      <View style={styles.labelRow}>
        <Text style={styles.label}>Nouveau prix</Text>
        <Text style={[styles.change, changed && rise ? styles.changeUp : null]} testID="purchase-change">
          {changeText}
        </Text>
      </View>
      <NumberInput
        size="large"
        value={value}
        onChange={(v) => {
          setValue(v);
          if (error) setError(null);
        }}
        step={0.1}
        min={0}
        max={100000}
        decimals={2}
        format={(n) => formatEuro(n)}
        suffix="€"
        accessibilityLabel="Nouveau prix d’achat HT"
        testID="purchase-input"
      />
      {old > 0 ? (
        <View style={styles.rises} accessibilityLabel="Hausses rapides">
          {RISES.map((pct) => {
            const target = round2(old * (1 + pct / 100));
            return (
              <Chip
                key={pct}
                label={`+${pct}${NBSP}%`}
                selected={samePrice(value, target)}
                onPress={() => setValue(target)}
                accessibilityLabel={`Plus ${pct} pour cent : ${formatEuro(target)}`}
                testID={`purchase-rise-${pct}`}
              />
            );
          })}
        </View>
      ) : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {changed && rows.length ? (
        <View style={styles.services}>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>Prix de vente</Text>
            <Text style={styles.sectionMeta}>{rows.length > 1 ? 'choisissez pour chaque service' : 'choisissez'}</Text>
          </View>
          {rows.map((r) => (
            <View key={r.line.key} style={styles.service} testID={`purchase-line-${r.line.key}`}>
              <View style={styles.serviceHead}>
                <Text style={styles.serviceName}>{r.line.label}</Text>
                <Text style={styles.serviceNow}>{`actuel ${formatEuro(r.line.price)}${isFinite(r.before) ? ` · ${formatPercent(r.before)}` : ''}`}</Text>
              </View>
              <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={r.line.label} testID={`purchase-group-${r.line.key}`}>
                {r.follow ? (
                  <OptionCard
                    title={r.follow.mode === MarginMode.FIX_COEFFICIENT ? `Garder le coefficient (${r.follow.label})` : `Garder la marge ${r.follow.label}`}
                    option={r.follow}
                    selected={r.choice === 'follow'}
                    thresholds={t}
                    onPress={() => setChoices((c) => ({ ...c, [r.line.key]: 'follow' }))}
                    testID={`purchase-follow-${r.line.key}`}
                  />
                ) : null}
                <View style={styles.options}>
                  <OptionCard
                    title="Garder le prix"
                    option={r.keepPrice}
                    selected={r.choice === 'price'}
                    thresholds={t}
                    onPress={() => setChoices((c) => ({ ...c, [r.line.key]: 'price' }))}
                    testID={`purchase-keep-price-${r.line.key}`}
                  />
                  {r.distinct && r.keepMargin ? (
                    <OptionCard
                      title="Garder la marge"
                      option={r.keepMargin}
                      selected={r.choice === 'margin'}
                      thresholds={t}
                      onPress={() => setChoices((c) => ({ ...c, [r.line.key]: 'margin' }))}
                      testID={`purchase-keep-margin-${r.line.key}`}
                    />
                  ) : null}
                </View>
              </View>
              {r.follow ? (
                <Text style={styles.caption} testID={`purchase-mode-note-${r.line.key}`}>
                  {r.choice === 'follow'
                    ? r.follow.mode === MarginMode.FIX_COEFFICIENT
                      ? 'Le prix suit le prix d’achat : seul l’achat est modifié.'
                      : 'Le prix suit le prix d’achat pour garder la marge cible.'
                    : r.follow.mode === MarginMode.FIX_COEFFICIENT
                      ? 'Le prix sera fixé : il ne suivra plus le coefficient.'
                      : 'Le prix sera fixé : il ne suivra plus la marge cible.'}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </BottomSheet>
  );
}

function OptionCard({
  title,
  option,
  selected,
  thresholds,
  onPress,
  testID,
}: {
  title: string;
  option: PurchaseOption;
  selected: boolean;
  thresholds: MarginThresholds;
  onPress: () => void;
  testID?: string;
}) {
  const zone = isFinite(option.margin) ? getMarginZone(option.margin, thresholds) : 'green';
  const marginText = isFinite(option.margin) ? `marge ${formatPercent(option.margin)}` : 'marge –';
  return (
    <PressableScale
      onPress={onPress}
      scaleTo="card"
      haptic="select"
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      // react-native-web 0.19 ignores accessibilityState: give the DOM its aria-checked.
      aria-checked={selected}
      accessibilityLabel={`${title} : ${formatEuro(option.price)}, ${marginText.replace('%', 'pour cent')}`}
      style={[styles.option, selected ? styles.optionOn : null]}
      testID={testID}
    >
      <View style={styles.optionTop}>
        <Text style={styles.optionTitle} numberOfLines={1}>
          {title}
        </Text>
        <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? palette.em700 : palette.lineStrong} />
      </View>
      <Text style={styles.optionPrice}>{formatEuro(option.price)}</Text>
      <Text style={[styles.optionMargin, { color: marginColors[zone].fg }]}>{marginText}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 4, marginBottom: 8, flexWrap: 'wrap' },
  label: { ...type.calloutStrong, color: palette.ink },
  change: { ...type.footnote, color: palette.text3 },
  changeUp: { color: palette.warn, fontFamily: type.footnoteStrong.fontFamily },
  rises: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  error: { ...type.footnote, color: palette.bad, marginTop: 12 },
  services: { marginTop: 22, gap: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  section: { ...type.title3, color: palette.ink },
  sectionMeta: { ...type.footnote, color: palette.text3 },
  service: { gap: 8 },
  serviceHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  serviceName: { ...type.headline, color: palette.ink },
  serviceNow: { ...type.footnote, color: palette.text3 },
  group: { gap: 10 },
  options: { flexDirection: 'row', gap: 10 },
  caption: { ...type.footnote, color: palette.text3 },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  optionOn: { borderWidth: 2, borderColor: palette.em700, backgroundColor: palette.em50, paddingHorizontal: 11, paddingVertical: 9 },
  optionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  optionTitle: { ...type.footnote, color: palette.text2, flex: 1, minWidth: 0 },
  optionPrice: { ...type.numM, color: palette.ink },
  optionMargin: { ...type.footnoteStrong },
  footer: { gap: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.em700 },
  summary: { ...type.footnoteStrong, color: palette.em700, flex: 1 },
});
