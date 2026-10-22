/**
 * Quick price change for one service, from the product detail.
 * Results lead (graft 1: Marge · Gain/dose · Coeff), the big stepper follows
 * (decimal keypad, RC13), then « Enregistrer le prix ».
 *
 * Saves through PUT /api/products/:id/servings, which replaces the whole set:
 * every other service is sent unchanged.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { calculateServingMargin, ProductWithMargin, ServingType } from '@margebar/shared';
import { BottomSheet, Button, NumberInput, ResultGrid, ResultTile, sortedServings } from '../../../components/ui';
import { palette, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatCoeff, formatEuro, formatNumber, formatPercent } from '../../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../../utils/marginThresholds';
import { isOnline } from '../../../services/offline';
import * as servingService from '../../../services/serving.service';
import { freshToast, writeErrorMessage } from './productActions';

export interface PriceEditTarget {
  servingType: ServingType;
  label: string;
  price: number;
}

/**
 * Coefficient from unrounded values (price HT ÷ cost of the dose), rounded once
 * to 0,01 like the backend's `computed.coefficient`: the sheet and the detail
 * always print the same « ×3,59 ». NaN when the dose costs nothing.
 */
export function servingCoefficient(product: ProductWithMargin, servingType: ServingType, priceTTC: number): number {
  const ht = priceTTC / (1 + product.tvaRate);
  const cost = product.containerVolumeCl > 0 ? (product.purchasePriceHT * servingType.volumeCl) / product.containerVolumeCl : 0;
  if (!(cost > 0) || !isFinite(ht)) return NaN;
  return Math.round((ht / cost) * 100) / 100;
}

export function PriceEditSheet({ product, target, onClose }: { product: ProductWithMargin | null; target: PriceEditTarget | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const t = useMarginThresholds();
  // Narrow phones: three tiles of ~100 px, the captions must stay short.
  const { width } = useWindowDimensions();
  const roomy = width >= 380;
  const [shown, setShown] = useState<PriceEditTarget | null>(target);
  const [price, setPrice] = useState<number>(target?.price ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (target) {
      setShown(target);
      setPrice(target.price);
      setSaved(false);
      setSaving(false);
      setError(null);
    }
  }, [target]);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const result = useMemo(() => {
    if (!product || !shown || !(price > 0)) return null;
    try {
      return calculateServingMargin(product.purchasePriceHT, product.containerVolumeCl, product.tvaRate, shown.servingType, price);
    } catch {
      return null;
    }
  }, [product, shown, price]);

  // Lowest TTC price (to 0,10 €) that reaches the objective margin.
  const objectivePrice = useMemo(() => {
    if (!product || !shown || !result) return null;
    const cost = result.costPerServingHT;
    if (!(cost > 0) || t.good >= 100) return null;
    const ttc = (cost / (1 - t.good / 100)) * (1 + product.tvaRate);
    return Math.ceil(ttc * 10 - 1e-6) / 10;
  }, [product, shown, result, t.good]);

  const zone = result ? getMarginZone(result.marginPercent, t) : 'red';
  const coeff = product && shown && result ? servingCoefficient(product, shown.servingType, price) : NaN;
  const coeffKnown = isFinite(coeff);
  const unchanged = !!shown && Math.abs(price - shown.price) < 0.005;

  const save = async () => {
    if (!product || !shown || saving) return;
    if (!(price > 0)) {
      setError('Indiquez un prix de vente supérieur à 0 €.');
      haptics.warning();
      return;
    }
    if (!isOnline()) {
      setError('Pas de connexion : le prix n’a pas été enregistré. Réessayez une fois connecté.');
      haptics.warning();
      return;
    }
    setError(null);
    setSaving(true);
    const started = Date.now();
    try {
      const servings = sortedServings(product).map((s) => ({
        servingTypeId: s.servingTypeId,
        sellingPriceTTC: s.servingTypeId === shown.servingType.id ? Math.round(price * 100) / 100 : s.sellingPriceTTC,
      }));
      await servingService.upsertProductServings(product.id, servings);
      await new Promise((r) => setTimeout(r, Math.max(0, 400 - (Date.now() - started))));
      queryClient.invalidateQueries({ queryKey: ['product', product.id] });
      queryClient.invalidateQueries({ queryKey: ['productServings', product.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSaving(false);
      setSaved(true);
      haptics.success();
      // Shown as soon as the sheet closes, never behind an older toast.
      freshToast('success', `Nouveau prix enregistré : ${shown.label}, ${formatEuro(price)}`);
      closeTimer.current = setTimeout(onClose, 650);
    } catch (err) {
      setSaving(false);
      setError(writeErrorMessage(err, 'save'));
      haptics.warning();
    }
  };

  return (
    <BottomSheet
      visible={!!target}
      onClose={onClose}
      title={shown ? `Prix · ${shown.label}` : 'Prix'}
      subline={product?.name}
      footer={
        <Button
          title={unchanged ? 'Prix inchangé' : 'Enregistrer le prix'}
          icon="checkmark-circle"
          onPress={save}
          loading={saving}
          success={saved}
          disabled={unchanged && !saved}
          fullWidth
          testID="price-save"
        />
      }
    >
      <ResultGrid>
        <ResultTile
          label="Marge"
          value={result ? formatPercent(result.marginPercent) : '–'}
          zone={zone}
          highlight
          caption={roomy ? `objectif ${formatPercent(t.good, 0)}` : `obj. ${formatPercent(t.good, 0)}`}
          accessibilityLabel={result ? `Marge ${formatNumber(result.marginPercent, 1)} pour cent, objectif ${formatNumber(t.good, 0)} pour cent` : 'Marge non calculée'}
        />
        <ResultTile
          label="Gain/dose"
          value={result ? formatEuro(result.marginPerServingHT, { sign: true }) : '–'}
          valueColor={result ? undefined : palette.text3}
          caption="HT"
        />
        <ResultTile
          label="Coeff"
          value={!result ? '–' : coeffKnown ? formatCoeff(coeff) : '—'}
          caption={result && !coeffKnown ? 'coût nul' : roomy ? 'prix HT ÷ coût' : 'HT ÷ coût'}
          accessibilityLabel={result && coeffKnown ? `Coefficient ${formatNumber(coeff, 2)}, prix hors taxes divisé par le coût` : 'Coefficient non calculable'}
        />
      </ResultGrid>
      <NumberInput
        size="large"
        label="Prix de vente TTC"
        value={price}
        onChange={(v) => {
          setPrice(v);
          if (error) setError(null);
        }}
        step={0.1}
        min={0.1}
        max={9999}
        decimals={2}
        format={(n) => formatEuro(n)}
        suffix="€"
        accessibilityLabel="Prix de vente TTC"
        style={styles.input}
        testID="price-input"
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : objectivePrice && result ? (
        <Text style={styles.hint}>
          {result.marginPercent >= t.good
            ? `Objectif atteint : au-dessus de ${formatPercent(t.good, 0)} de marge dès ${formatEuro(objectivePrice)} TTC.`
            : `Dès ${formatEuro(objectivePrice)} TTC, ce service dépasse ${formatPercent(t.good, 0)} de marge.`}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  input: { marginTop: 16 },
  hint: { ...type.footnote, color: palette.text2, marginTop: 12 },
  error: { ...type.footnote, color: palette.bad, marginTop: 12 },
});
