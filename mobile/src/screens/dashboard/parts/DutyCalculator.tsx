/**
 * Calculateur de droits — body (spec §4.5 + grafts 7, 8, 16).
 *
 *   Catégorie fiscale            13 catégories
 *   [flask] Spiritueux · Whisky, vodka…        Changer ⌄   → FiscalCategorySheet
 *   Prix HT hors droits [− 11,00 € +]   Degré d’alcool [− 40 % +]
 *   (« Le degré n’impacte pas l’accise pour cette catégorie » when relevant)
 *   Contenant                    Bouteille · 70 cl
 *   [2 cl] [4 cl] … [70 cl] … [Fût 30 L]       (scrolled to the selection)
 *   Result panel (answer first, breakdown after)
 *   « Enregistrer comme produit » (logged in) or `footer` (logged out CTA)
 *
 * Changing the category applies its typical strength and container while
 * the user has not set them (a 40 % « Bière » would make no sense), and
 * always replaces a strength outside the category's range.
 * Numbers come from `calculateDroits` (@margebar/shared), the same function
 * the API and the product form use.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calculateDroits, DEFAULT_RATES, type DroitsResult, type Rate } from '@margebar/shared';
import { Button, Card, ChipRow, FadeIn, FiscalCategorySheet, PressableScale, SwapFade } from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { formatEuro, formatNumber, NBSP } from '../../../utils/format';
import { useRatesStore } from '../../../store/rates.store';
import { useSystemParamsStore } from '../../../store/systemParams.store';
import { StepperField } from './StepperField';
import { DutyResultPanel } from './DutyResultPanel';
import { categoryDefaults, CONTAINERS, containerMeta, rateExamples, rateIcon } from './duties';

export interface DutyDraft {
  rate: Rate;
  /** Purchase price HT without duties. */
  price: number;
  degree: number;
  volumeCl: number;
  result: DroitsResult;
}

export interface DutyCalculatorProps {
  /** Logged in: shows « Enregistrer comme produit ». */
  onSaveAsProduct?: (draft: DutyDraft) => void;
  /** Legacy (DroitsCalculator): shows « Enregistrer le calcul ». */
  onSaveLegacy?: (draft: DutyDraft) => void;
  /** Rendered after the result (e.g. the logged-out sign-up card). */
  footer?: React.ReactNode;
  /** The container chips bleed to the screen edges (inside a padded Screen). */
  bleed?: boolean;
}

const REFERENCE_URL = 'https://entreprendre.service-public.fr/vosdroits/F32101';

function useParam(key: string): string | undefined {
  return useSystemParamsStore((s) => s.params.find((p) => p.key === key)?.value);
}

export function DutyCalculator({ onSaveAsProduct, onSaveLegacy, footer, bleed = true }: DutyCalculatorProps) {
  const storeRates = useRatesStore((s) => s.rates);
  const rates = storeRates?.length ? storeRates : DEFAULT_RATES;
  const year = useParam('tarif_annee') || '2026';
  const seuilSS = parseFloat(useParam('seuil_cotisation_ss') ?? '') || 18;
  const tvaRaw = parseFloat(useParam('tva_normal') ?? '');
  const tvaRate = isFinite(tvaRaw) && tvaRaw > 0 && tvaRaw < 1 ? tvaRaw : 0.2;
  const reference = useParam('lien_reference') || REFERENCE_URL;

  const [slug, setSlug] = useState('spiritueux');
  const [price, setPrice] = useState(11);
  const [degree, setDegree] = useState(40);
  const [volumeCl, setVolumeCl] = useState(70);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const touched = useRef({ degree: false, container: false });

  const rate = rates.find((r) => r.slug === slug) ?? rates.find((r) => r.slug === 'spiritueux') ?? rates[0];
  const result = useMemo(() => calculateDroits(rate, volumeCl, degree, price, tvaRate, seuilSS), [rate, volumeCl, degree, price, tvaRate, seuilSS]);

  const selectRate = useCallback(
    (next: Rate) => {
      setSlug(next.slug);
      const d = categoryDefaults(next);
      setDegree((current) => {
        if (!touched.current.degree || current < d.min || current > d.max) {
          touched.current.degree = false;
          return d.degree;
        }
        return current;
      });
      if (!touched.current.container) setVolumeCl(d.volumeCl);
    },
    [],
  );

  const changeDegree = useCallback((v: number) => {
    touched.current.degree = true;
    setDegree(v);
  }, []);

  const changeContainer = useCallback((key: string) => {
    touched.current.container = true;
    setVolumeCl(Number(key));
  }, []);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const hint = degreeHint(rate, degree, seuilSS);
  const draft: DutyDraft = { rate, price, degree, volumeCl, result };

  return (
    <View>
      {/* Catégorie fiscale */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Catégorie fiscale</Text>
        <Text style={styles.meta}>{`${rates.length} catégories`}</Text>
      </View>
      <Card
        onPress={openSheet}
        padding={0}
        accessibilityLabel={`Catégorie fiscale : ${rate.label}. Changer de catégorie`}
        testID="duty-category"
      >
        <View style={styles.picker}>
          <View style={styles.pickerIcon}>
            <Ionicons name={rateIcon(rate)} size={21} color={palette.em700} />
          </View>
          <SwapFade value={rate.slug} style={styles.pickerTexts}>
            <Text style={styles.pickerTitle} numberOfLines={1}>
              {rate.label}
            </Text>
            <Text style={styles.pickerSub} numberOfLines={1}>
              {rateExamples(rate)}
            </Text>
          </SwapFade>
          <View style={styles.change}>
            <Text style={styles.changeText}>Changer</Text>
            <Ionicons name="chevron-down" size={16} color={palette.em700} />
          </View>
        </View>
      </Card>

      {/* Prix + degré */}
      <View style={styles.inputs}>
        <StepperField
          label="Prix HT hors droits"
          value={price}
          onChange={setPrice}
          step={0.1}
          min={0}
          max={99999}
          decimals={2}
          fixedDecimals
          unit="€"
          unitSpoken="euros"
          accessibilityLabel="Prix d’achat HT hors droits"
          onEditingChange={setTyping}
          style={styles.priceField}
          testID="duty-price"
        />
        <StepperField
          label="Degré d’alcool"
          value={degree}
          onChange={changeDegree}
          step={0.5}
          min={0}
          max={100}
          decimals={1}
          unit={`%${NBSP}vol.`}
          unitShort="%"
          unitSpoken="pour cent"
          onEditingChange={setTyping}
          style={styles.degreeField}
          testID="duty-degree"
        />
      </View>
      {hint ? (
        <FadeIn key={hint.text} offset={4} duration={160}>
          <View style={styles.hint} accessibilityLiveRegion="polite">
            <Ionicons
              name={hint.tone === 'warn' ? 'alert-circle-outline' : 'information-circle-outline'}
              size={17}
              color={hint.tone === 'warn' ? palette.warn : palette.text3}
              style={styles.hintIcon}
            />
            <Text style={[styles.hintText, hint.tone === 'warn' && { color: palette.warn }]}>{hint.text}</Text>
          </View>
        </FadeIn>
      ) : null}

      {/* Contenant */}
      <View style={[styles.labelRow, styles.section]}>
        <Text style={styles.label}>Contenant</Text>
        <Text style={styles.meta}>{containerMeta(volumeCl)}</Text>
      </View>
      <ChipRow
        items={CONTAINERS}
        selectedKey={String(volumeCl)}
        onSelect={changeContainer}
        bleed={bleed}
        accessibilityLabel="Contenant"
      />

      {/* Résultat */}
      <View style={styles.section}>
        <DutyResultPanel
          result={result}
          rate={rate}
          price={price}
          volumeCl={volumeCl}
          seuilSS={seuilSS}
          tvaRate={tvaRate}
          instant={typing}
        />
      </View>

      {onSaveAsProduct ? (
        <View style={styles.section}>
          <Button
            title="Enregistrer comme produit"
            icon="add-circle-outline"
            onPress={() => onSaveAsProduct(draft)}
            fullWidth
            testID="duty-save-product"
          />
          <Text style={styles.saveNote}>
            {`Le prix HT avec droits (${formatEuro(result.prixHTAvecDroits)}) devient votre prix d’achat.`}
          </Text>
        </View>
      ) : null}
      {onSaveLegacy ? (
        <View style={styles.section}>
          <Button title="Enregistrer le calcul" icon="bookmark-outline" variant="secondary" onPress={() => onSaveLegacy(draft)} fullWidth />
        </View>
      ) : null}

      {footer ? <View style={styles.section}>{footer}</View> : null}

      <PressableScale
        onPress={() => Linking.openURL(reference).catch(() => {})}
        scaleTo="chip"
        accessibilityRole="link"
        accessibilityLabel={`Barème officiel des douanes ${year}, ouvrir la source sur service-public.fr`}
        style={styles.source}
        hitSlop={6}
      >
        <Ionicons name="shield-checkmark-outline" size={16} color={palette.em700} />
        <Text style={styles.sourceText}>{`Barème officiel des douanes ${year}`}</Text>
        <Ionicons name="open-outline" size={14} color={palette.em700} />
      </PressableScale>

      <FiscalCategorySheet visible={sheetOpen} value={rate.slug} onSelect={selectRate} onClose={closeSheet} rates={rates} />
    </View>
  );
}

/** Contextual note under the price / degree row. */
function degreeHint(rate: Rate, degree: number, seuilSS: number): { text: string; tone: 'info' | 'warn' } | null {
  const seuil = `${formatNumber(seuilSS)}${NBSP}%${NBSP}vol.`;
  if (rate.slug === 'biere_legere' && degree > 2.8) {
    return { text: `Au-delà de 2,8${NBSP}%${NBSP}vol., choisissez la catégorie « Bière ».`, tone: 'warn' };
  }
  if ((rate.slug === 'biere' || rate.slug === 'petite_brasserie') && degree > 0 && degree <= 2.8) {
    return { text: `Jusqu’à 2,8${NBSP}%${NBSP}vol., choisissez la catégorie « Bière légère ».`, tone: 'warn' };
  }
  if (rate.calcType === 'A') {
    const cotisation = rate.cotisationRate > 0 && !!rate.cotisationCond;
    return {
      text: cotisation
        ? `Le degré n’impacte pas l’accise pour cette catégorie. Il compte seulement pour la cotisation sécu., au-delà de ${seuil}`
        : 'Le degré n’impacte pas l’accise pour cette catégorie.',
      tone: 'info',
    };
  }
  return null;
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8, marginTop: 4 },
  label: { ...type.label, color: palette.text2 },
  meta: { ...type.footnoteStrong, color: palette.text3 },
  section: { marginTop: 20 },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingLeft: 12, paddingRight: 8, paddingVertical: 10 },
  pickerIcon: { width: 44, height: 44, borderRadius: radius.icon, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
  pickerTexts: { flex: 1, minWidth: 0 },
  pickerTitle: { ...type.headline, color: palette.ink },
  pickerSub: { ...type.footnote, color: palette.text3, marginTop: 1 },
  change: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44, paddingHorizontal: 8, borderRadius: radius.sm },
  changeText: { ...type.calloutStrong, color: palette.em700 },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 },
  priceField: { flexGrow: 1.2, flexBasis: 176, minWidth: 0 },
  degreeField: { flexGrow: 1, flexBasis: 146, minWidth: 0 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  hintIcon: { marginTop: 1 },
  hintText: { ...type.footnote, color: palette.text3, flex: 1 },
  saveNote: { ...type.footnote, color: palette.text3, textAlign: 'center', marginTop: 10 },
  source: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', gap: 6, minHeight: 44, marginTop: 12, paddingHorizontal: 8 },
  sourceText: { ...type.footnoteStrong, color: palette.em700 },
});
