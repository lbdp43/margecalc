/**
 * « Contenant & achat »: container chips (the user's containers + « Autre »),
 * then one card with the purchase price, the degree, the optional « prix hors
 * droits » entry (duties added from the official rates) and the TVA.
 *
 * Lot 2 (after a bottle scan, mockup 4): `part="purchase"` renders the
 * purchase price alone, at the top of the form, and `part="rest"` the
 * container, degree, duties and TVA further down.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { CustomContainer, DroitsResult, Rate } from '@margebar/shared';
import { CONTAINER_PRESETS } from '@margebar/shared';
import type { ChipItem } from '../../../components/ui';
import {
  Card,
  ChipRow,
  ListRow,
  NumberInput,
  PressableScale,
  SegmentedControl,
  ValueRow,
  fiscalRateLabel,
} from '../../../components/ui';
import { elevation, motion, palette, radius, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatDegree, formatEuro, formatPercent, formatVolumeCl } from '../../../utils/format';
import { ControlRow, FieldError, FieldLabel } from './FieldBits';
import type { FieldErrors } from './errors';
import { FormValues, purchaseMaxMessage } from './model';
import {
  FISCAL_TO_PRODUCT_CATEGORY,
  PURCHASE_MAX,
  TYPING_MAX,
  containerLabel,
  containerNoun,
  defaultFiscalSlug,
  degreeMatters,
  round2,
  typicalDegree,
} from './pricing';

const OTHER = 'other';
const DEGREE_STEP = 0.5;

interface PurchaseSectionProps {
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  errors: FieldErrors;
  containers: CustomContainer[] | undefined;
  rates: Rate[];
  duties: DroitsResult | null;
  autoEntrepreneur: boolean;
  /** Product category slug: picks the likely fiscal category when « hors droits » is switched on. */
  categorySlug?: string;
  onOpenFiscal: () => void;
  /** 'purchase': the purchase price card alone · 'rest': everything else · 'all' (default). */
  part?: 'all' | 'purchase' | 'rest';
  /** Wraps the purchase price field (focus it after a scan). */
  purchaseRef?: React.Ref<View>;
}

const TVA_CHOICES = [0.2, 0.1, 0.055];

const tvaText = (t: number) => {
  const pct = round2(t * 100);
  return formatPercent(pct, Number.isInteger(pct) ? 0 : 1);
};

export function PurchaseSection({
  values,
  patch,
  errors,
  containers,
  rates,
  duties,
  autoEntrepreneur,
  categorySlug,
  onOpenFiscal,
  part = 'all',
  purchaseRef,
}: PurchaseSectionProps) {
  const list = useMemo(() => {
    const src = containers && containers.length ? containers.map((c) => ({ name: c.name, volumeCl: c.volumeCl })) : CONTAINER_PRESETS.map((c) => ({ name: c.label, volumeCl: c.volumeCl }));
    const seen = new Set<number>();
    return src
      .filter((c) => c.volumeCl > 0 && !seen.has(c.volumeCl) && seen.add(c.volumeCl))
      .sort((a, b) => a.volumeCl - b.volumeCl);
  }, [containers]);

  const cl = values.containerCl ?? 0;
  const match = list.find((c) => Math.abs(c.volumeCl - cl) < 0.001);
  const showOther = values.containerOther || (!match && cl > 0);
  const selectedKey = showOther ? OTHER : match ? String(match.volumeCl) : null;

  const items: ChipItem[] = useMemo(
    () => [
      ...list.map((c) => ({ key: String(c.volumeCl), label: containerLabel(c.name, c.volumeCl) })),
      { key: OTHER, label: 'Autre', icon: 'create-outline' as const },
    ],
    [list],
  );

  const rate = rates.find((r) => r.slug === values.fiscalSlug);
  const noun = containerNoun(cl || 70);
  const degreeCounts = values.horsDroits && degreeMatters(rate);
  const missingDegree = degreeCounts && !(values.degree !== null && values.degree > 0);

  // Typed values are kept as typed: an out-of-range one is reported, never clamped silently.
  const purchaseError =
    errors.purchase ?? (values.purchase !== null && values.purchase > PURCHASE_MAX ? purchaseMaxMessage() : undefined);

  const tvaOptions = useMemo(() => {
    const opts = TVA_CHOICES.slice();
    if (!opts.some((t) => Math.abs(t - values.tvaRate) < 1e-6)) opts.push(values.tvaRate);
    return opts.map((t) => ({ key: String(t), label: tvaText(t), accessibilityLabel: `TVA ${tvaText(t)}` }));
  }, [values.tvaRate]);

  const toggleHorsDroits = () => {
    const v = !values.horsDroits;
    haptics.select();
    // A fiscal category that does not match the product category is a leftover default.
    const fits = categorySlug ? FISCAL_TO_PRODUCT_CATEGORY[values.fiscalSlug] === categorySlug : true;
    patch(v && !fits ? { horsDroits: v, fiscalSlug: defaultFiscalSlug(categorySlug) } : { horsDroits: v });
  };

  const onDegree = (n: number) => {
    // The first « + » on an empty degree starts at the category's usual degree
    // (40 % vol. for a spirit) instead of 0,5 % — 80 taps saved.
    const seed = typicalDegree(categorySlug);
    if (values.degree === null && seed !== null && Math.abs(n - DEGREE_STEP) < 1e-9) patch({ degree: seed });
    else patch({ degree: n });
  };

  const purchaseRow = (
    <View ref={purchaseRef} collapsable={false}>
      <ControlRow
        title="Prix d’achat HT"
        caption={values.horsDroits ? `hors droits · par ${noun}` : `droits inclus · par ${noun}`}
        error={purchaseError}
        stacked
        divider={part !== 'purchase'}
        testID="row-purchase"
      >
        <NumberInput
          size="large"
          value={values.purchase}
          onChange={(n) => patch({ purchase: n })}
          step={0.1}
          min={0}
          max={TYPING_MAX}
          decimals={2}
          format={(n) => formatEuro(n)}
          suffix="€"
          placeholder="—"
          accessibilityLabel="Prix d’achat HT"
          style={purchaseError ? styles.inputError : null}
          testID="field-purchase"
        />
      </ControlRow>
    </View>
  );

  if (part === 'purchase') {
    return (
      <Card noPadding style={styles.cardAlone}>
        {purchaseRow}
      </Card>
    );
  }

  return (
    <View>
      <FieldLabel label="Contenant" meta={cl > 0 ? `${noun} de ${formatVolumeCl(cl)}` : null} error={!!errors.container} />
      <ChipRow
        items={items}
        selectedKey={selectedKey}
        onSelect={(k) => {
          if (k === OTHER) patch({ containerOther: true });
          else patch({ containerOther: false, containerCl: Number(k) });
        }}
        accessibilityLabel="Contenant"
      />
      {showOther ? (
        <Card variant="flat" noPadding style={styles.otherCard}>
          <ControlRow title="Contenance" caption="en centilitres" divider={false}>
            <NumberInput
              value={values.containerCl}
              onChange={(n) => patch({ containerCl: n })}
              step={1}
              min={1}
              max={100000}
              decimals={1}
              format={(n) => formatVolumeCl(n)}
              suffix="cl"
              placeholder="—"
              accessibilityLabel="Contenance en centilitres"
              testID="field-container"
            />
          </ControlRow>
        </Card>
      ) : null}
      <FieldError message={errors.container} />

      <Card noPadding style={styles.card}>
        {part === 'all' ? purchaseRow : null}

        <ControlRow
          title="Degré"
          caption={degreeCounts ? 'requis pour les droits' : 'facultatif'}
          error={errors.degree}
          // Stacked: « 40 % vol. » never makes the row jump to two lines on the first « + ».
          stacked
          testID="row-degree"
        >
          <NumberInput
            value={values.degree}
            onChange={onDegree}
            step={DEGREE_STEP}
            min={0}
            max={100}
            decimals={1}
            format={formatDegree}
            suffix="% vol."
            placeholder="—"
            accessibilityLabel="Degré d’alcool"
            style={errors.degree ? styles.inputErrorMd : null}
            testID="field-degree"
          />
        </ControlRow>

        <PressableScale
          scaleTo="none"
          onPress={toggleHorsDroits}
          accessibilityRole="switch"
          accessibilityState={{ checked: values.horsDroits }}
          aria-checked={values.horsDroits}
          accessibilityLabel="Prix d’achat hors droits"
          accessibilityHint="Ajoute l’accise et la sécurité sociale au prix d’achat"
          style={[styles.switchRow, styles.divider]}
          testID="switch-hors-droits"
        >
          {({ pressed }: { pressed: boolean }) => (
            <>
              {pressed ? <View style={[StyleSheet.absoluteFill, styles.rowPressed]} /> : null}
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Prix hors droits</Text>
                <Text style={styles.rowCaption}>Ajouter l’accise et la sécurité sociale</Text>
              </View>
              {/* Visual only: the whole 60 px row is the control (no second focus stop). */}
              <SwitchVisual on={values.horsDroits} />
            </>
          )}
        </PressableScale>

        {values.horsDroits ? (
          <View style={[styles.duties, styles.divider]}>
            <ListRow
              icon="shield-checkmark-outline"
              title={rate?.label ?? 'Catégorie fiscale'}
              subtitle={rate ? `Catégorie fiscale · ${fiscalRateLabel(rate)}` : 'Choisissez la catégorie fiscale'}
              subtitleLines={2}
              onPress={onOpenFiscal}
              style={styles.fiscalRow}
              accessibilityLabel={`Catégorie fiscale : ${rate?.label ?? 'à choisir'}`}
            />
            {duties ? (
              <View style={styles.dutyValues}>
                <ValueRow label="Droits (accise + sécu.)" value={`+${formatEuro(duties.totalDroits)}`} />
                <ValueRow label="Prix d’achat avec droits" value={formatEuro(duties.prixHTAvecDroits)} strong last />
              </View>
            ) : null}
            {missingDegree ? (
              <Note icon="information-circle-outline" text="Indiquez le degré ci-dessus : les droits de cette catégorie en dépendent." tone="warn" />
            ) : rate && !degreeMatters(rate) ? (
              <Note icon="information-circle-outline" text="Le degré n’impacte pas l’accise pour cette catégorie." />
            ) : null}
          </View>
        ) : null}

        {autoEntrepreneur ? (
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>TVA</Text>
              <Text style={styles.rowCaption}>Auto-entrepreneur : prix sans TVA</Text>
            </View>
          </View>
        ) : (
          <View style={styles.tvaRow}>
            <View style={styles.tvaTexts}>
              <Text style={styles.rowTitle}>TVA</Text>
              <Text style={styles.rowCaption}>sur la vente</Text>
            </View>
            <SegmentedControl
              options={tvaOptions}
              value={String(values.tvaRate)}
              onChange={(k) => patch({ tvaRate: Number(k) })}
              accessibilityLabel="Taux de TVA"
              style={styles.tvaSeg}
            />
          </View>
        )}
      </Card>
    </View>
  );
}

/** The look of a switch (40 × 24, em600 when on), for a row that is the control itself. */
function SwitchVisual({ on }: { on: boolean }) {
  const reduce = useReducedMotion();
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: reduce ? (on ? 16 : 0) : withTiming(on ? 16 : 0, { duration: motion.duration.fast, easing: motion.easing.standard }) }],
  }));
  return (
    <View pointerEvents="none" style={[styles.track, on ? styles.trackOn : null]}>
      <Animated.View style={[styles.thumb, thumb]} />
    </View>
  );
}

function Note({ icon, text, tone }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; tone?: 'warn' }) {
  return (
    <View style={[styles.note, tone === 'warn' ? { backgroundColor: palette.warnBg } : null]} accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={18} color={tone === 'warn' ? palette.warn : palette.text3} />
      <Text style={[styles.noteText, tone === 'warn' ? { color: palette.ink } : null]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { marginTop: 16 },
  cardAlone: { marginTop: 16 },
  otherCard: { marginTop: 10, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 20 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 60 },
  rowPressed: { backgroundColor: palette.surface2 },
  track: { width: 40, height: 24, borderRadius: 12, padding: 2, backgroundColor: palette.surface3 },
  trackOn: { backgroundColor: palette.em600 },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: palette.surface, ...elevation.e1 },
  rowTitle: { ...type.calloutStrong, color: palette.ink },
  rowCaption: { ...type.footnote, color: palette.text3, marginTop: 1 },
  duties: { paddingHorizontal: 4, paddingBottom: 10 },
  fiscalRow: { paddingHorizontal: 12 },
  dutyValues: { paddingHorizontal: 12 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.surface2,
  },
  noteText: { ...type.footnoteStrong, color: palette.text2, flexShrink: 1 },
  // A 2 px bad ring around the stepper (the kit's NumberInput has no error state).
  inputError: { borderRadius: radius.lg + 2, borderWidth: 2, borderColor: palette.bad, margin: -2 },
  inputErrorMd: { borderRadius: radius.md + 2, borderWidth: 2, borderColor: palette.bad, margin: -2, alignSelf: 'flex-start' },
  tvaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  tvaTexts: { flexGrow: 1, flexBasis: 80 },
  tvaSeg: { flexGrow: 1, flexBasis: 190, maxWidth: 240 },
});
