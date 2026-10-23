/**
 * « Services & prix » (spec §4.4 + grafts 1–3, 12, 13; lot 1 n° 1):
 * service chips (« déjà tarifé » check), the live result tiles ABOVE the
 * control (eyes up, thumb down), then Prix € / Marge % / Coeff ×, the large
 * stepper, the zone-tinted slider with the objective detent and the
 * « Prix conseillés » chips (objective price rounded up to the user's
 * « Arrondi des prix », then round prices; one tap sets the price) with
 * « Objectif atteint (+6,6 pts) » once the price reaches the objective.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ServingType } from '@margebar/shared';
import {
  Button,
  Card,
  ChipRow,
  FadeIn,
  NumberInput,
  ResultGrid,
  ResultTile,
  SegmentedControl,
  Skeleton,
  Slider,
  SuggestedPriceChips,
  SwapFade,
  dialog,
  toast,
} from '../../../components/ui';
import type { ChipItem } from '../../../components/ui';
import { servingIconName } from '../../../components/ui/ServingTypeIcon';
import { marginColors, palette, radius, type } from '../../../theme';
import { getMarginZone, MarginThresholds } from '../../../utils/marginThresholds';
import { clamp, formatCoeff, formatEuro, formatPercent, formatVolumeCl, roundToStep } from '../../../utils/format';
import { ControlRow, FieldError } from './FieldBits';
import { Derived, FormValues, orderedServiceKeys, priceMaxMessage, resultOf, serviceName, shownModeValue } from './model';
import {
  CUSTOM_DOSE,
  PRICE_MAX,
  PriceMode,
  ServiceState,
  TYPING_MAX,
  dosesSentence,
  formatMargin,
  priceForMargin,
  priceFromMode,
  pricingSetup,
  round2,
  serviceNoun,
  servingsText,
  soldWhole,
  suggestedPrice,
  tvaLabel,
} from './pricing';

const MODES: { key: PriceMode; label: string; hint: string; accessibilityLabel: string }[] = [
  { key: 'price', label: 'Prix', hint: '€', accessibilityLabel: 'Saisir le prix de vente' },
  { key: 'margin', label: 'Marge', hint: '%', accessibilityLabel: 'Saisir la marge visée' },
  { key: 'coeff', label: 'Coeff', hint: '×', accessibilityLabel: 'Saisir le coefficient' },
];

/** A second tap on « Retirer » within this window is the same tap (the next card mounts under the finger). */
const REMOVE_GUARD_MS = 600;

interface PricingSectionProps {
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  servingTypes: ServingType[];
  loading: boolean;
  /** The service types could not be loaded (and none are cached). */
  loadError?: boolean;
  onRetry?: () => void;
  derived: Derived;
  thresholds: MarginThresholds;
  error?: string;
  /** Sliding / typing: lets the sticky summary update without tweening. */
  onLiveChange?: (live: boolean) => void;
  /** An « Annuler » toast was shown (the screen clears it when the form goes away). */
  onUndoToast?: () => void;
}

/** Meta of the section header: « 14 verres par bouteille », « Vendu à l’unité ». */
export function pricingMeta(values: FormValues, d: Derived, servingTypes: ServingType[]): string | null {
  const key = values.selected && values.services[values.selected] ? values.selected : null;
  if (!key) return null;
  const st = servingTypes.find((s) => s.id === key);
  return dosesSentence(d.containerCl, d.doseOf(key), serviceNoun(key === CUSTOM_DOSE ? 'dose' : st?.name));
}

/** Tile amounts: no cents once they stop fitting (« 1 250 € », « 102 € » for a total). */
const tileEuro = (n: number, wholeFrom = 1000) => formatEuro(n, { decimals: Math.abs(n) >= wholeFrom ? 0 : 2 });

export function PricingSection({
  values,
  setValues,
  servingTypes,
  loading,
  loadError,
  onRetry,
  derived: d,
  thresholds: t,
  error,
  onLiveChange,
  onUndoToast,
}: PricingSectionProps) {
  const tva = values.tvaRate;
  const lastMode = useRef<PriceMode>('price');
  const lastRemove = useRef(0);
  const enabled = orderedServiceKeys(values, servingTypes);
  const selected = values.selected && values.services[values.selected] ? values.selected : enabled[0] ?? null;

  const sortedTypes = useMemo(
    () => [...servingTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.volumeCl - b.volumeCl),
    [servingTypes],
  );

  const items: ChipItem[] = useMemo(() => {
    const list: ChipItem[] = sortedTypes.map((st) => {
      const on = !!values.services[st.id];
      const fits = !(d.containerCl > 0) || st.volumeCl <= d.containerCl;
      return {
        key: st.id,
        label: serviceName(st.id, values, servingTypes),
        icon: servingIconName(st.name, st.volumeCl),
        done: on && values.services[st.id].price > 0,
        disabled: !fits && !on,
        accessibilityLabel: `${serviceName(st.id, values, servingTypes)}${on ? ', tarifé' : ''}${!fits && !on ? ', plus grand que le contenant' : ''}`,
      };
    });
    const customOn = !!values.services[CUSTOM_DOSE];
    list.push({
      key: CUSTOM_DOSE,
      label: customOn ? serviceName(CUSTOM_DOSE, values, servingTypes) : 'Autre dose',
      icon: 'options-outline',
      done: customOn && values.services[CUSTOM_DOSE].price > 0,
      accessibilityLabel: customOn ? `${serviceName(CUSTOM_DOSE, values, servingTypes)}, tarifé` : 'Autre dose (sans type de service)',
    });
    return list;
  }, [sortedTypes, values, servingTypes, d.containerCl]);

  const enable = useCallback(
    (key: string, replace: boolean) => {
      setValues((v) => {
        const services: Record<string, ServiceState> = replace ? {} : { ...v.services };
        let customDoseCl = v.customDoseCl;
        if (key === CUSTOM_DOSE && !(customDoseCl && customDoseCl > 0)) {
          const c = v.containerCl ?? 0;
          customDoseCl = c > 0 && c <= 50 ? c : 4;
        }
        const containerCl = v.containerCl ?? 0;
        const dose = key === CUSTOM_DOSE ? customDoseCl ?? 0 : servingTypes.find((s) => s.id === key)?.volumeCl ?? 0;
        const cost = d.costKnown && containerCl > 0 && dose > 0 ? (d.purchaseHT * dose) / containerCl : 0;
        services[key] = { price: suggestedPrice(cost, v.tvaRate, t.good), touched: false, mode: lastMode.current, modeValue: null };
        return { ...v, services, selected: key, customDoseCl };
      });
    },
    [setValues, servingTypes, d.costKnown, d.purchaseHT, t.good],
  );

  const onSelect = useCallback(
    async (key: string) => {
      if (values.services[key]) {
        setValues((v) => ({ ...v, selected: key }));
        return;
      }
      const hasCustom = !!values.services[CUSTOM_DOSE];
      const hasReal = Object.keys(values.services).some((k) => k !== CUSTOM_DOSE);
      if (key === CUSTOM_DOSE && hasReal) {
        const ok = await dialog.confirm({
          title: 'Remplacer les services ?',
          message: 'Une dose libre se vend seule : les services déjà tarifés seront retirés de ce produit.',
          confirmLabel: 'Remplacer',
        });
        if (!ok) return;
        enable(key, true);
        return;
      }
      if (key !== CUSTOM_DOSE && hasCustom) {
        const ok = await dialog.confirm({
          title: 'Remplacer la dose libre ?',
          message: `« ${serviceName(key, values, servingTypes)} » remplacera la dose libre de ce produit.`,
          confirmLabel: 'Remplacer',
        });
        if (!ok) return;
        enable(key, true);
        return;
      }
      enable(key, false);
    },
    [values, setValues, enable, servingTypes],
  );

  // Removing is reversible (toast « Annuler ») and a quick double tap removes ONE service.
  const removeService = useCallback(
    (key: string) => {
      const now = Date.now();
      if (now - lastRemove.current < REMOVE_GUARD_MS) return;
      const removed = values.services[key];
      if (!removed) return;
      lastRemove.current = now;
      const name = serviceName(key, values, servingTypes);
      const doseCl = values.customDoseCl;
      setValues((v) => {
        if (!v.services[key]) return v;
        const services = { ...v.services };
        delete services[key];
        const rest = orderedServiceKeys({ ...v, services }, servingTypes);
        return { ...v, services, selected: rest[0] ?? null };
      });
      const restore = () =>
        setValues((v) => {
          if (v.services[key]) return v;
          // A free dose sells alone: never bring it back next to services (or the reverse).
          const conflict = key === CUSTOM_DOSE ? Object.keys(v.services).some((k) => k !== CUSTOM_DOSE) : !!v.services[CUSTOM_DOSE];
          if (conflict) return v;
          return {
            ...v,
            services: { ...v.services, [key]: removed },
            selected: key,
            customDoseCl: key === CUSTOM_DOSE ? doseCl : v.customDoseCl,
          };
        });
      toast.clear();
      onUndoToast?.();
      toast.info(`« ${name} » retiré`, { action: { label: 'Annuler', onPress: restore } });
    },
    [values, servingTypes, setValues, onUndoToast],
  );

  return (
    <View>
      {loading && !servingTypes.length ? (
        <View style={styles.skeletonRow}>
          <Skeleton width={112} height={44} radius={22} />
          <Skeleton width={120} height={44} radius={22} />
          <Skeleton width={96} height={44} radius={22} />
        </View>
      ) : (
        <>
          {loadError ? (
            <View style={styles.inlineRetry} accessibilityLiveRegion="polite">
              <Text style={styles.inlineRetryText}>Les services n’ont pas pu être chargés.</Text>
              <Button title="Réessayer" variant="tonal" size="sm" icon="refresh" onPress={onRetry} testID="services-retry" />
            </View>
          ) : null}
          <ChipRow items={items} selectedKey={selected} onSelect={onSelect} accessibilityLabel="Services" />
        </>
      )}
      <FieldError message={error} />

      {selected ? (
        <ServicePricing
          key={selected}
          serviceKey={selected}
          values={values}
          setValues={setValues}
          servingTypes={servingTypes}
          d={d}
          t={t}
          tva={tva}
          onModeChange={(m) => {
            lastMode.current = m;
          }}
          onRemove={removeService}
          onLiveChange={onLiveChange}
        />
      ) : (
        <Card style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="wine-outline" size={24} color={palette.em700} />
          </View>
          <Text style={styles.emptyTitle}>Comment le servez-vous ?</Text>
          <Text style={styles.emptyText}>
            {loadError
              ? 'Réessayez de charger les services (verre, shot, pinte…), ou vendez-le à la dose libre avec « Autre dose ».'
              : 'Choisissez un ou plusieurs services ci-dessus. Le prix de vente, la marge et le gain s’affichent ici, en direct.'}
          </Text>
        </Card>
      )}
    </View>
  );
}

interface ServicePricingProps {
  serviceKey: string;
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  servingTypes: ServingType[];
  d: Derived;
  t: MarginThresholds;
  tva: number;
  onModeChange: (m: PriceMode) => void;
  onRemove: (key: string) => void;
  onLiveChange?: (live: boolean) => void;
}

function ServicePricing({ serviceKey: key, values, setValues, servingTypes, d, t, tva, onModeChange, onRemove, onLiveChange }: ServicePricingProps) {
  const s = values.services[key];
  const { width: winW, height: winH } = useWindowDimensions();
  const short = winH < 740;
  const [dragging, setDragging] = useState(false);
  const anchor = useRef(s.price);
  if (!dragging) anchor.current = s.price;

  const dose = d.doseOf(key);
  const cost = d.costOf(key);
  const st = servingTypes.find((x) => x.id === key);
  const whole = soldWhole(d.containerCl, dose);
  const noun = serviceNoun(key === CUSTOM_DOSE ? (whole ? 'bouteille' : 'dose') : st?.name);
  const result = resultOf(key, values, d);
  const zone = result ? getMarginZone(result.marginPercent, t) : undefined;
  const setup = pricingSetup(s.mode, cost, tva, t, anchor.current);
  const needsCost = s.mode !== 'price' && !(cost > 0);
  const shown = shownModeValue(s, cost, tva);
  const objective = priceForMargin(cost, tva, t.good);
  const glasses = d.containerCl > 0 && dose > 0 ? d.containerCl / dose : 0;
  // Whole servings in the caption (« ≈ 23 shots »); the total keeps the exact count.
  const glassesText = glasses > 0 ? servingsText(glasses, noun) : undefined;
  const priceHT = s.price > 0 ? s.price / (1 + tva) : null;
  const coeff = result && result.costPerServingHT > 0 ? result.sellingPriceHT / result.costPerServingHT : null;
  const objectiveText = formatPercent(t.good, Number.isInteger(t.good) ? 0 : 1);
  const priceError = s.mode === 'price' && s.price > PRICE_MAX ? `${priceMaxMessage()}.` : null;

  // Narrow phones: tighter tiles at 340–379 px, two columns below 340 px, so no value is cut.
  const columns = winW < 340 ? 2 : 3;
  const tileStyle = winW < 380 && columns === 3 ? styles.tileCompact : undefined;

  // A value below the track (a price under the cost, a negative margin) extends
  // the track instead of parking the knob on a price that was never set. The
  // low end is frozen while dragging so the track never moves under the finger.
  const anchorShown = useRef(shown);
  if (!dragging) anchorShown.current = shown;
  let sliderMin = setup.min;
  const low = anchorShown.current;
  if (!needsCost && isFinite(low) && low < setup.min) {
    if (s.mode === 'price') sliderMin = Math.max(0, Math.floor(low * 2) / 2);
    else if (s.mode === 'margin') sliderMin = Math.max(-100, Math.floor(low / 5) * 5);
    else sliderMin = Math.max(0, Math.floor(low * 10) / 10);
  }
  const sliderValue = roundToStep(clamp(isFinite(shown) ? shown : sliderMin, sliderMin, setup.max), setup.step);

  const update = useCallback(
    (patch: Partial<ServiceState>) =>
      setValues((v) => (v.services[key] ? { ...v, services: { ...v.services, [key]: { ...v.services[key], ...patch } } } : v)),
    [setValues, key],
  );

  const onValue = useCallback(
    (n: number) => {
      if (s.mode === 'price') {
        update({ price: round2(Math.max(0, n)), touched: true, modeValue: null });
        return;
      }
      const price = round2(priceFromMode(s.mode, n, cost, tva));
      if (!(price > 0)) return;
      update({ price, touched: true, modeValue: n });
    },
    [s.mode, cost, tva, update],
  );

  // With a cost, the « Prix conseillés » chips say it all (lot 1 n° 1); the sentence stays for what is missing.
  const chips = !d.needsDegree && cost > 0 && t.good < 100;
  const hint = d.needsDegree
    ? 'Indiquez le degré pour calculer les droits, puis la marge.'
    : cost > 0
      ? `Dès ${formatEuro(objective)} TTC, ${noun.this} dépasse ${objectiveText} de marge.`
      : needsCost
        ? 'Indiquez le prix d’achat pour calculer en marge ou en coefficient.'
        : 'Indiquez le prix d’achat pour voir la marge.';
  const pickSuggested = useCallback((price: number) => update({ price, touched: true, modeValue: null }), [update]);

  const tiles = {
    priceTTC: <ResultTile key="ttc" label="Prix TTC" value={s.price > 0 ? tileEuro(s.price) : '–'} caption={tvaLabel(tva)} style={tileStyle} />,
    priceHT: <ResultTile key="ht" label="Prix HT" value={priceHT !== null ? tileEuro(priceHT) : '–'} caption={`HT · ${formatVolumeCl(dose)}`} style={tileStyle} />,
    margin: (
      <ResultTile
        key="margin"
        label="Marge"
        value={result ? formatMargin(result.marginPercent) : '–'}
        zone={zone}
        highlight
        caption={`${winW < 380 ? 'obj.' : 'objectif'} ${objectiveText}`}
        style={tileStyle}
      />
    ),
    cost: <ResultTile key="cost" label="Coût/dose" value={result ? tileEuro(result.costPerServingHT) : '–'} caption="HT" style={tileStyle} />,
    gain: (
      <ResultTile
        key="gain"
        label="Gain/dose"
        value={result ? tileEuro(result.marginPerServingHT) : '–'}
        valueColor={zone ? marginColors[zone].fg : undefined}
        caption="HT"
        style={tileStyle}
      />
    ),
    coeff: <ResultTile key="coeff" label="Coeff" value={coeff ? formatCoeff(coeff) : '–'} caption="prix HT ÷ coût" style={tileStyle} />,
    total: <ResultTile key="total" label="Gain total" value={result ? tileEuro(result.marginPerContainer, 100) : '–'} caption={glassesText} style={tileStyle} />,
  };
  // Graft 1: the answer above the control. On short phones only the compact
  // strip (Marge · Gain/dose · Coeff) stays above, so the Marge tile is still in
  // view while the thumb is on the slider; the rest moves below it.
  const above = short
    ? [tiles.margin, tiles.gain, tiles.coeff]
    : [tiles.priceTTC, tiles.priceHT, tiles.margin, tiles.cost, tiles.gain, whole ? tiles.coeff : tiles.total];
  const below = short ? (whole ? [tiles.priceTTC, tiles.priceHT, tiles.cost] : [tiles.priceHT, tiles.cost, tiles.total]) : null;

  return (
    <FadeIn offset={6} duration={160}>
      <ResultGrid style={styles.tiles} columns={columns}>
        {above}
      </ResultGrid>

      <Card style={styles.card} testID="pricing-card">
        {key === CUSTOM_DOSE ? (
          <View style={styles.doseRow}>
            <ControlRow title="Dose servie" caption="en centilitres" divider={false}>
              <NumberInput
                value={values.customDoseCl}
                onChange={(n) => setValues((v) => ({ ...v, customDoseCl: n }))}
                step={1}
                min={0.5}
                max={100000}
                decimals={1}
                format={(n) => formatVolumeCl(n)}
                suffix="cl"
                placeholder="—"
                accessibilityLabel="Dose servie en centilitres"
                testID="field-dose"
              />
            </ControlRow>
          </View>
        ) : null}

        <SegmentedControl
          options={MODES}
          value={s.mode}
          onChange={(m) => {
            onModeChange(m);
            update({ mode: m, modeValue: null });
          }}
          accessibilityLabel="Mode de calcul"
        />

        <SwapFade value={s.mode} style={styles.valueArea}>
          <View style={styles.valueHead}>
            <Text style={styles.valueLabel}>{setup.label}</Text>
            <Text style={styles.valueMeta}>
              {s.mode === 'price' ? `TTC · ${tvaLabel(tva)}` : s.mode === 'margin' ? `sur le prix HT · ${formatEuro(s.price)} TTC` : `× coût HT · ${formatEuro(s.price)} TTC`}
            </Text>
          </View>
          <NumberInput
            size="large"
            value={needsCost ? null : roundToStep(isFinite(shown) ? shown : 0, Math.pow(10, -setup.decimals))}
            onChange={onValue}
            step={setup.inputStep}
            // Prix: 0 stays 0 (validation names the service) and a typo above the
            // maximum is reported, never clamped silently.
            min={s.mode === 'price' ? 0 : setup.min}
            max={s.mode === 'price' ? TYPING_MAX : setup.max}
            decimals={setup.decimals}
            format={setup.format}
            suffix={setup.suffix}
            disabled={needsCost}
            placeholder="—"
            accessibilityLabel={`${setup.a11y}, ${serviceName(key, values, servingTypes)}`}
            onEditingChange={onLiveChange}
            style={priceError ? styles.inputError : null}
            testID="pricing-input"
          />
          <FieldError message={priceError} />
          <Slider
            style={styles.slider}
            value={sliderValue}
            onChange={onValue}
            min={sliderMin}
            max={setup.max}
            step={setup.step}
            marker={needsCost ? undefined : setup.marker}
            zones={needsCost ? undefined : setup.zones}
            formatLabel={setup.formatLabel}
            disabled={needsCost}
            onSlidingChange={(v) => {
              setDragging(v);
              onLiveChange?.(v);
            }}
            accessibilityLabel={setup.a11y}
            accessibilityValueText={isFinite(shown) ? setup.format(shown) : undefined}
            testID="pricing-slider"
          />
        </SwapFade>

        {chips ? (
          <SuggestedPriceChips costHT={cost} tva={tva} price={s.price} onSelect={pickSuggested} thresholds={t} style={styles.suggestions} testID="pricing-suggestions" />
        ) : (
          <View style={styles.hint}>
            <Ionicons name="information-circle-outline" size={18} color={palette.text3} />
            <Text style={styles.hintText}>{hint}</Text>
          </View>
        )}

        {below ? (
          <ResultGrid style={styles.tilesBelow} columns={columns}>
            {below}
          </ResultGrid>
        ) : null}

        <View style={styles.cardFoot}>
          {/* Neutral, not red: removing a service is undoable; red stays for « Supprimer ce produit ». */}
          <Button
            title="Retirer ce service"
            variant="text"
            size="sm"
            icon={<Ionicons name="remove-circle-outline" size={18} color={palette.text2} />}
            textStyle={styles.removeText}
            onPress={() => onRemove(key)}
            accessibilityLabel={`Retirer le service ${serviceName(key, values, servingTypes)}`}
            testID="service-remove"
          />
        </View>
      </Card>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  skeletonRow: { flexDirection: 'row', gap: 8 },
  inlineRetry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  inlineRetryText: { ...type.footnote, color: palette.text2, flexShrink: 1 },
  tiles: { marginTop: 14 },
  tilesBelow: { marginTop: 14 },
  tileCompact: { paddingHorizontal: 9 },
  card: { marginTop: 12 },
  doseRow: { marginHorizontal: -16, marginTop: -4, marginBottom: 8 },
  valueArea: { marginTop: 16 },
  valueHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  valueLabel: { ...type.calloutStrong, color: palette.ink },
  valueMeta: { ...type.footnote, color: palette.text3 },
  inputError: { borderRadius: radius.lg + 2, borderWidth: 2, borderColor: palette.bad, margin: -2 },
  slider: { marginTop: 18 },
  suggestions: { marginTop: 18 },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surface2,
  },
  hintText: { ...type.footnoteStrong, color: palette.text2, flexShrink: 1 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: -8 },
  removeText: { color: palette.text2 },
  empty: { marginTop: 14, alignItems: 'flex-start' },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { ...type.headline, color: palette.ink },
  emptyText: { ...type.callout, color: palette.text2, marginTop: 4 },
});
