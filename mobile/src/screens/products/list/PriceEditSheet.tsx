/**
 * « Changer le prix »: the one quick price sheet (lot 1 n° 1, 5; mockup 1),
 * opened from the product detail, the long press on a product card and the
 * dashboard « À revoir » tile (« Corriger »).
 *
 *   Prix · Verre 5 cl                                   ×
 *   Whisky Nikka From the Barrel
 *   [service chips when the product has several]
 *   Marge 65,2 % · Gain/dose +7,12 € (+1,75 € HT) · Coeff ×2,87
 *   Prix de vente TTC                         avant 11,00 €
 *   [ − 13,10 € + ]
 *   Prix conseillés                         Arrondi 0,10 € ⌄
 *   [13,10 € objectif 65 %] [13,50 €] [14,00 €]
 *   ✓ Objectif atteint (+0,2 pts)
 *   [ Enregistrer 13,10 € ]
 *
 * Works for every product: with services (the whole set is sent, changed or
 * not) and sold à l’unité / without service types (the selling price). Several
 * services can be changed before one save. Lot 2: one POST
 * /api/products/prices/batch, then the undo toast « Nouveau prix … · Annuler ⑥ »
 * posts the returned previous values back (list/productActions `applyPricesWithUndo`).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { BatchPriceUpdate, calculateServingMargin, ProductWithMargin, ServingType } from '@margebar/shared';
import {
  BottomSheet,
  Button,
  ChipRow,
  Icon,
  NumberInput,
  ResultGrid,
  ResultTile,
  SuggestedPriceChips,
  servingLabel,
  sortedServings,
} from '../../../components/ui';
import { palette, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatCoeff, formatEuro, formatNumber, formatPercent, NBSP, plural } from '../../../utils/format';
import { getMarginZone, MarginThresholds, useMarginThresholds } from '../../../utils/marginThresholds';
import { doseCost, samePrice, suggestedPrice } from '../../../utils/pricing';
import { getPriceRounding } from '../../../utils/priceRounding';
import { isOnline } from '../../../services/offline';
import { serviceNoun } from '../form/pricing';
import { doseLabel, soldWhole } from '../../../utils/servings';
import { applyPricesWithUndo, writeErrorMessage } from './productActions';

/** Key of the product's own dose (a product sold without service types). */
export const DOSE_KEY = '__dose';

export interface PriceEditTarget {
  /** Service type id, or DOSE_KEY. Default: the primary service. */
  key?: string;
  /** Price the sheet starts on (« Corriger »: the suggested price). Default: the current price. */
  price?: number;
}

/** One price of a product: a service, or the product's own dose. */
export interface PriceLine {
  key: string;
  /** « Verre 5 cl », « À l’unité », « Dose 25 cl ». */
  label: string;
  volumeCl: number;
  servingType?: ServingType;
  /** Current TTC price. */
  price: number;
}

/** Every price of a product, primary first. A product without services has one line: its dose. */
export function priceLines(product: ProductWithMargin): PriceLine[] {
  const lines: PriceLine[] = [];
  for (const s of sortedServings(product)) {
    if (!s.servingType) continue;
    lines.push({
      key: s.servingTypeId,
      label: servingLabel(s.servingType.name, s.servingType.volumeCl),
      volumeCl: s.servingType.volumeCl,
      servingType: s.servingType,
      price: s.sellingPriceTTC,
    });
  }
  if (lines.length) return lines;
  const dose = product.doseVolumeCl;
  return [
    {
      key: DOSE_KEY,
      label: doseLabel(product.containerVolumeCl, dose),
      volumeCl: dose,
      price: product.computed?.sellingPriceTTC ?? product.sellingPriceTTC ?? 0,
    },
  ];
}

/**
 * « Corriger »: the primary price set to the suggested price (objective,
 * rounded up to the user's « Arrondi des prix »). It only ever raises a price:
 * a price that already reaches the objective opens unchanged, as does a
 * product without a purchase price (nothing to suggest).
 */
export function fixTarget(product: ProductWithMargin, thresholds: MarginThresholds, rounding: number = getPriceRounding()): PriceEditTarget | null {
  const line = priceLines(product)[0];
  if (!line) return null;
  const cost = doseCost(product.purchasePriceHT, product.containerVolumeCl, line.volumeCl);
  const price = suggestedPrice(cost, product.tvaRate, thresholds.good, rounding);
  return price === null || price <= line.price + 0.004 ? { key: line.key } : { key: line.key, price };
}

/**
 * Coefficient from unrounded values (price HT ÷ cost of the dose), rounded once
 * to 0,01 like the backend's `computed.coefficient`: the sheet and the detail
 * always print the same « ×3,59 ». NaN when the dose costs nothing.
 */
export function servingCoefficient(product: ProductWithMargin, volumeCl: number, priceTTC: number): number {
  const ht = priceTTC / (1 + product.tvaRate);
  const cost = doseCost(product.purchasePriceHT, product.containerVolumeCl, volumeCl);
  if (!(cost > 0) || !isFinite(ht)) return NaN;
  return Math.round((ht / cost) * 100) / 100;
}

function lineResult(product: ProductWithMargin, line: PriceLine, price: number) {
  if (!(price > 0) || !(line.volumeCl > 0) || !(product.containerVolumeCl > 0)) return null;
  try {
    const st: ServingType = line.servingType ?? { id: '', userId: '', name: '', volumeCl: line.volumeCl, icon: '', sortOrder: 0 };
    return calculateServingMargin(product.purchasePriceHT, product.containerVolumeCl, product.tvaRate, st, price);
  } catch {
    return null;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function PriceEditSheet({ product, target, onClose }: { product: ProductWithMargin | null; target: PriceEditTarget | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const t = useMarginThresholds();
  // Narrow phones: three tiles of ~100 px, the captions must stay short.
  const { width } = useWindowDimensions();
  const roomy = width >= 380;
  /** What the sheet edits, frozen while it is open (and while it closes). */
  const [shown, setShown] = useState<{ product: ProductWithMargin; lines: PriceLine[] } | null>(null);
  const [active, setActive] = useState<string>('');
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!target || !product) return;
    const lines = priceLines(product);
    const first = lines.find((l) => l.key === target.key) ?? lines[0];
    const next: Record<string, number> = {};
    for (const l of lines) next[l.key] = l.price;
    if (first && typeof target.price === 'number' && target.price > 0) next[first.key] = round2(target.price);
    setShown({ product, lines });
    setActive(first?.key ?? '');
    setDrafts(next);
    setSaved(false);
    setSaving(false);
    setError(null);
    // Opened for a target: later refetches of the product must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const p = shown?.product ?? null;
  const lines = shown?.lines ?? [];
  const line = lines.find((l) => l.key === active) ?? lines[0] ?? null;
  const price = line ? drafts[line.key] ?? line.price : 0;
  const changed = lines.filter((l) => !samePrice(drafts[l.key] ?? l.price, l.price));
  const lineChanged = !!line && !samePrice(price, line.price);

  const result = useMemo(() => (p && line ? lineResult(p, line, price) : null), [p, line, price]);
  const before = useMemo(() => (p && line ? lineResult(p, line, line.price) : null), [p, line]);
  const cost = p && line ? doseCost(p.purchasePriceHT, p.containerVolumeCl, line.volumeCl) : 0;

  // « 65 % », « 67,5 % »: written as in the form.
  const objectiveText = formatPercent(t.good, Number.isInteger(t.good) ? 0 : 1);
  const zone = result ? getMarginZone(result.marginPercent, t) : 'red';
  const coeff = p && line && result ? servingCoefficient(p, line.volumeCl, price) : NaN;
  const coeffKnown = isFinite(coeff);
  const gainDelta = result && before && lineChanged ? result.marginPerServingHT - before.marginPerServingHT : 0;
  const noun = serviceNoun(line?.servingType?.name ?? (line?.key === DOSE_KEY && p && soldWhole(p.containerVolumeCl, line.volumeCl) ? 'bouteille' : 'dose'));

  const setPrice = (v: number) => {
    if (!line) return;
    setDrafts((d) => ({ ...d, [line.key]: v }));
    if (error) setError(null);
  };

  const save = async () => {
    if (!p || !line || saving) return;
    const invalid = lines.find((l) => !((drafts[l.key] ?? l.price) > 0));
    if (invalid) {
      setActive(invalid.key);
      setError(`Indiquez un prix de vente supérieur à 0${NBSP}€.`);
      haptics.warning();
      return;
    }
    if (!isOnline()) {
      setError(`Pas de connexion : le prix n’a pas été enregistré. Réessayez une fois connecté.`);
      haptics.warning();
      return;
    }
    setError(null);
    setSaving(true);
    const started = Date.now();
    try {
      const updates: BatchPriceUpdate[] =
        line.key === DOSE_KEY
          ? [{ productId: p.id, sellingPriceTTC: round2(price) }]
          : [{ productId: p.id, servings: lines.map((l) => ({ servingTypeId: l.key, sellingPriceTTC: round2(drafts[l.key] ?? l.price) })) }];
      const first = changed[0] ?? line;
      // Shown as soon as the sheet closes (toasts wait behind sheets), with « Annuler ».
      await applyPricesWithUndo(queryClient, updates, {
        message: !changed.length
          ? `Prix confirmé : ${first.label}, ${formatEuro(drafts[first.key] ?? price)}`
          : changed.length > 1
            ? `${plural(changed.length, 'nouveau prix', 'nouveaux prix')} enregistrés · ${p.name}`
            : `Nouveau prix enregistré : ${first.label}, ${formatEuro(drafts[first.key] ?? price)}`,
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

  // « Prix à vérifier » (an invoice computed it ×4): saving it unchanged confirms it.
  const confirming = !!p?.priceToReview && !changed.length;
  const saveTitle = !changed.length
    ? confirming
      ? `Confirmer ${formatEuro(price)}`
      : 'Prix inchangé'
    : changed.length > 1
      ? `Enregistrer ${changed.length}${NBSP}prix`
      : `Enregistrer ${formatEuro(drafts[changed[0].key])}`;

  return (
    <BottomSheet
      visible={!!target}
      onClose={onClose}
      title={line ? `Prix · ${line.label}` : 'Prix'}
      subline={p?.name}
      footer={
        <Button
          title={saveTitle}
          icon="checkmark-circle"
          onPress={save}
          loading={saving}
          success={saved}
          disabled={!changed.length && !saved && !confirming}
          fullWidth
          testID="price-save"
        />
      }
      testID="price-sheet"
    >
      {p?.priceToReview ? (
        <View style={styles.review} testID="price-review-note">
          <Icon name="alert-circle" size={18} color={palette.warnSolid} />
          <Text style={styles.reviewText}>Prix calculé à partir du prix d’achat (×4) : confirmez-le ou changez-le.</Text>
        </View>
      ) : null}
      {lines.length > 1 ? (
        <ChipRow
          items={lines.map((l) => ({
            key: l.key,
            label: l.label,
            done: !samePrice(drafts[l.key] ?? l.price, l.price),
            accessibilityLabel: `${l.label}, ${formatEuro(drafts[l.key] ?? l.price)}${samePrice(drafts[l.key] ?? l.price, l.price) ? '' : ', modifié'}`,
          }))}
          selectedKey={line?.key}
          onSelect={(k) => {
            setActive(k);
            setError(null);
          }}
          fade="surface"
          style={styles.services}
          accessibilityLabel="Services"
        />
      ) : null}
      <ResultGrid>
        <ResultTile
          label="Marge"
          value={result ? formatPercent(result.marginPercent) : '–'}
          zone={zone}
          highlight
          caption={roomy ? `objectif ${objectiveText}` : `obj. ${objectiveText}`}
          accessibilityLabel={result ? `Marge ${formatNumber(result.marginPercent, 1)} pour cent, objectif ${formatNumber(t.good, Number.isInteger(t.good) ? 0 : 1)} pour cent` : 'Marge non calculée'}
        />
        <ResultTile
          label="Gain/dose"
          value={result ? formatEuro(result.marginPerServingHT, { sign: true }) : '–'}
          valueColor={result ? undefined : palette.text3}
          caption={gainDelta && Math.abs(gainDelta) >= 0.005 ? `${formatEuro(gainDelta, { sign: true })} HT` : 'HT'}
          accessibilityLabel={
            result
              ? `Gain par dose ${formatEuro(result.marginPerServingHT)} hors taxes${gainDelta ? `, ${gainDelta > 0 ? 'plus' : 'moins'} ${formatEuro(Math.abs(gainDelta))} par rapport à avant` : ''}`
              : 'Gain non calculé'
          }
        />
        <ResultTile
          label="Coeff"
          value={!result ? '–' : coeffKnown ? formatCoeff(coeff) : '—'}
          caption={result && !coeffKnown ? 'coût nul' : roomy ? 'prix HT ÷ coût' : 'HT ÷ coût'}
          accessibilityLabel={result && coeffKnown ? `Coefficient ${formatNumber(coeff, 2)}, prix hors taxes divisé par le coût` : 'Coefficient non calculable'}
        />
      </ResultGrid>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Prix de vente TTC</Text>
        {lineChanged && line ? (
          <Text style={styles.before} testID="price-before">
            avant {formatEuro(line.price)}
          </Text>
        ) : null}
      </View>
      <NumberInput
        key={line?.key}
        size="large"
        value={price}
        onChange={setPrice}
        step={0.1}
        min={0.1}
        max={9999}
        decimals={2}
        format={(n) => formatEuro(n)}
        suffix="€"
        accessibilityLabel={`Prix de vente TTC${line ? `, ${line.label}` : ''}`}
        testID="price-input"
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {cost > 0 && p ? (
        <SuggestedPriceChips costHT={cost} tva={p.tvaRate} price={price} onSelect={setPrice} thresholds={t} style={styles.chips} testID="price-suggestions" />
      ) : line && p && result ? (
        <Text style={styles.hint}>
          Sans prix d’achat, {noun.this} est entièrement en marge : indiquez le prix d’achat dans la fiche pour un prix conseillé.
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  services: { marginBottom: 14 },
  review: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.warnBg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 14 },
  reviewText: { ...type.footnoteStrong, color: palette.warn, flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 18, marginBottom: 8 },
  label: { ...type.calloutStrong, color: palette.ink },
  before: { ...type.footnote, color: palette.text3 },
  chips: { marginTop: 18 },
  hint: { ...type.footnote, color: palette.text2, marginTop: 12 },
  error: { ...type.footnote, color: palette.bad, marginTop: 12 },
});
