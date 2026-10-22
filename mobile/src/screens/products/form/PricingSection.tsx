/**
 * « Services & prix » (spec §4.4 + grafts 1–3, 12, 13):
 * service chips (« déjà tarifé » check), the live result tiles ABOVE the
 * control (eyes up, thumb down), then Prix € / Marge % / Coeff ×, the large
 * stepper, the zone-tinted slider with the objective detent and the
 * « Dès 7,96 € TTC, ce verre dépasse 65 % de marge. » hint.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ServingType } from '@margebar/shared';
import {
  Button,
  Card,
  ChipRow,
  NumberInput,
  ResultGrid,
  ResultTile,
  SegmentedControl,
  Skeleton,
  Slider,
  SwapFade,
  dialog,
} from '../../../components/ui';
import type { ChipItem } from '../../../components/ui';
import { servingIconName } from '../../../components/ui/ServingTypeIcon';
import { marginColors, palette, radius, type } from '../../../theme';
import { getMarginZone, MarginThresholds } from '../../../utils/marginThresholds';
import { clamp, formatEuro, formatNumber, formatPercent, formatVolumeCl, NBSP } from '../../../utils/format';
import { ControlRow, FieldError } from './FieldBits';
import { Derived, FormValues, orderedServiceKeys, serviceName, shownModeValue } from './model';
import {
  CUSTOM_DOSE,
  PriceMode,
  ServiceState,
  dosesSentence,
  priceForMargin,
  priceFromMode,
  pricingSetup,
  round2,
  serviceNoun,
  serviceResult,
  suggestedPrice,
  tvaLabel,
} from './pricing';

const MODES: { key: PriceMode; label: string; hint: string; accessibilityLabel: string }[] = [
  { key: 'price', label: 'Prix', hint: '€', accessibilityLabel: 'Saisir le prix de vente' },
  { key: 'margin', label: 'Marge', hint: '%', accessibilityLabel: 'Saisir la marge visée' },
  { key: 'coeff', label: 'Coeff', hint: '×', accessibilityLabel: 'Saisir le coefficient' },
];

interface PricingSectionProps {
  values: FormValues;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  servingTypes: ServingType[];
  loading: boolean;
  derived: Derived;
  thresholds: MarginThresholds;
  error?: string;
  /** Sliding / typing: lets the sticky summary update without tweening. */
  onLiveChange?: (live: boolean) => void;
}

/** Meta of the section header: « 14 verres par bouteille ». */
export function pricingMeta(values: FormValues, d: Derived, servingTypes: ServingType[]): string | null {
  const key = values.selected && values.services[values.selected] ? values.selected : null;
  if (!key) return null;
  const st = servingTypes.find((s) => s.id === key);
  return dosesSentence(d.containerCl, d.doseOf(key), serviceNoun(key === CUSTOM_DOSE ? 'dose' : st?.name));
}

export function PricingSection({ values, setValues, servingTypes, loading, derived: d, thresholds: t, error, onLiveChange }: PricingSectionProps) {
  const tva = values.tvaRate;
  const lastMode = useRef<PriceMode>('price');
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
        const cost = containerCl > 0 && dose > 0 ? (d.purchaseHT * dose) / containerCl : 0;
        services[key] = { price: suggestedPrice(cost, v.tvaRate, t.good), touched: false, mode: lastMode.current, modeValue: null };
        return { ...v, services, selected: key, customDoseCl };
      });
    },
    [setValues, servingTypes, d.purchaseHT, t.good],
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
          title: 'Remplacer les services ?',
          message: 'Une dose libre se vend seule : les services déjà tarifés seront retirés de ce produit.',
          confirmLabel: 'Remplacer',
        });
        if (!ok) return;
        enable(key, true);
        return;
      }
      if (key !== CUSTOM_DOSE && hasCustom) {
        const ok = await dialog.confirm({
          title: 'Remplacer la dose libre ?',
          message: `« ${serviceName(key, values, servingTypes)} » remplacera la dose libre de ce produit.`,
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

  return (
    <View>
      {loading && !servingTypes.length ? (
        <View style={styles.skeletonRow}>
          <Skeleton width={112} height={44} radius={22} />
          <Skeleton width={120} height={44} radius={22} />
          <Skeleton width={96} height={44} radius={22} />
        </View>
      ) : (
        <ChipRow items={items} selectedKey={selected} onSelect={onSelect} accessibilityLabel="Services" />
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
          onLiveChange={onLiveChange}
          multiple={enabled.length > 1}
        />
      ) : (
        <Card style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="wine-outline" size={24} color={palette.em700} />
          </View>
          <Text style={styles.emptyTitle}>Comment le servez-vous ?</Text>
          <Text style={styles.emptyText}>
            Choisissez un ou plusieurs services ci-dessus. Le prix de vente, la marge et le gain s’affichent ici, en direct.
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
  multiple: boolean;
  onModeChange: (m: PriceMode) => void;
  onLiveChange?: (live: boolean) => void;
}

function ServicePricing({ serviceKey: key, values, setValues, servingTypes, d, t, tva, multiple, onModeChange, onLiveChange }: ServicePricingProps) {
  const s = values.services[key];
  const [dragging, setDragging] = useState(false);
  const anchor = useRef(s.price);
  if (!dragging) anchor.current = s.price;

  const dose = d.doseOf(key);
  const cost = d.costOf(key);
  const st = servingTypes.find((x) => x.id === key);
  const noun = serviceNoun(key === CUSTOM_DOSE ? 'dose' : st?.name);
  const result = serviceResult(d.purchaseHT, d.containerCl, tva, dose, s.price);
  const zone = result ? getMarginZone(result.marginPercent, t) : undefined;
  const setup = pricingSetup(s.mode, cost, tva, t, anchor.current);
  const needsCost = s.mode !== 'price' && !(cost > 0);
  const shown = shownModeValue(s, cost, tva);
  const objective = priceForMargin(cost, tva, t.good);
  const glasses = d.containerCl > 0 && dose > 0 ? d.containerCl / dose : 0;
  const glassesText = glasses > 0 ? `${formatNumber(glasses, Number.isInteger(Math.round(glasses * 10) / 10) ? 0 : 1)}${NBSP}${glasses >= 2 ? noun.many : noun.one}` : undefined;

  const update = useCallback(
    (patch: Partial<ServiceState>) =>
      setValues((v) => (v.services[key] ? { ...v, services: { ...v.services, [key]: { ...v.services[key], ...patch } } } : v)),
    [setValues, key],
  );

  const onValue = useCallback(
    (n: number) => {
      if (s.mode === 'price') {
        update({ price: round2(n), touched: true, modeValue: null });
        return;
      }
      const price = round2(priceFromMode(s.mode, n, cost, tva));
      if (!(price > 0)) return;
      update({ price, touched: true, modeValue: n });
    },
    [s.mode, cost, tva, update],
  );

  const remove = () =>
    setValues((v) => {
      const services = { ...v.services };
      delete services[key];
      const rest = orderedServiceKeys({ ...v, services }, servingTypes);
      return { ...v, services, selected: rest[0] ?? null };
    });

  const sliderValue = clamp(isFinite(shown) ? shown : setup.min, setup.min, setup.max);

  return (
    <View>
      {/* Graft 1: the answer above the control */}
      <ResultGrid style={styles.tiles}>
        <ResultTile label="Prix TTC" value={formatEuro(s.price)} caption={tvaLabel(tva)} />
        <ResultTile label="Prix HT" value={result ? formatEuro(result.sellingPriceHT) : '–'} caption={`HT · ${formatVolumeCl(dose)}`} />
        <ResultTile
          label="Marge"
          value={result ? formatPercent(result.marginPercent) : '–'}
          zone={zone}
          highlight
          caption={`objectif ${formatPercent(t.good, 0)}`}
        />
        <ResultTile label="Coût/dose" value={result ? formatEuro(result.costPerServingHT) : '–'} caption="HT" />
        <ResultTile
          label="Gain/dose"
          value={result ? formatEuro(result.marginPerServingHT) : '–'}
          valueColor={zone ? marginColors[zone].fg : undefined}
          caption="HT"
        />
        <ResultTile label="Gain total" value={result ? formatEuro(result.marginPerContainer) : '–'} caption={glassesText} />
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
            value={needsCost ? null : round2Mode(shown, setup.decimals)}
            onChange={onValue}
            step={setup.inputStep}
            min={s.mode === 'price' ? 0.1 : setup.min}
            max={s.mode === 'price' ? 10000 : setup.max}
            decimals={setup.decimals}
            format={setup.format}
            suffix={setup.suffix}
            disabled={needsCost}
            placeholder={setup.format(0)}
            accessibilityLabel={`${setup.a11y}, ${serviceName(key, values, servingTypes)}`}
            onEditingChange={onLiveChange}
            testID="pricing-input"
          />
          <Slider
            style={styles.slider}
            value={sliderValue}
            onChange={onValue}
            min={setup.min}
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
            accessibilityValueText={setup.format(sliderValue)}
            testID="pricing-slider"
          />
        </SwapFade>

        <View style={styles.hint}>
          <Ionicons
            name={cost > 0 ? (result && result.marginPercent >= t.good ? 'checkmark-circle' : 'flag-outline') : 'information-circle-outline'}
            size={18}
            color={cost > 0 && result && result.marginPercent >= t.good ? palette.good : palette.text3}
          />
          <Text style={styles.hintText}>
            {cost > 0
              ? `Dès ${formatEuro(objective)} TTC, ${noun.this} dépasse ${formatPercent(t.good, 0)} de marge.`
              : needsCost
                ? 'Indiquez le prix d’achat pour calculer en marge ou en coefficient.'
                : 'Indiquez le prix d’achat pour voir la marge.'}
          </Text>
        </View>

        <View style={styles.cardFoot}>
          <Text style={styles.footMeta} numberOfLines={1}>
            {multiple ? 'Chaque service a son prix' : 'Ajoutez d’autres services au-dessus'}
          </Text>
          <Button
            title="Retirer"
            variant="destructive"
            size="sm"
            icon="remove-circle-outline"
            onPress={remove}
            accessibilityLabel={`Retirer le service ${serviceName(key, values, servingTypes)}`}
            testID="service-remove"
          />
        </View>
      </Card>
    </View>
  );
}

/** Keeps the stepper free of float noise (e.g. 64,99999 %). */
function round2Mode(n: number, decimals: number): number {
  if (!isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

const styles = StyleSheet.create({
  skeletonRow: { flexDirection: 'row', gap: 8 },
  tiles: { marginTop: 14 },
  card: { marginTop: 12 },
  doseRow: { marginHorizontal: -16, marginTop: -4, marginBottom: 8 },
  valueArea: { marginTop: 16 },
  valueHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  valueLabel: { ...type.calloutStrong, color: palette.ink },
  valueMeta: { ...type.footnote, color: palette.text3 },
  slider: { marginTop: 18 },
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
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, marginBottom: -6 },
  footMeta: { ...type.footnote, color: palette.text3, flexShrink: 1 },
  empty: { marginTop: 14, alignItems: 'flex-start' },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { ...type.headline, color: palette.ink },
  emptyText: { ...type.callout, color: palette.text2, marginTop: 4 },
});
