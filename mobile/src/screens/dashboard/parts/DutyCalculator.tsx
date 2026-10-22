/**
 * Calculateur de droits — body (spec §4.5 + grafts 7, 8, 16), built from the kit.
 *
 *   Catégorie fiscale            13 catégories
 *   [flask] Spiritueux · Whisky, vodka…        Changer ⌄   → FiscalCategorySheet
 *   Prix d’achat HT · hors droits   [ 11,00            € ]   TextField (typed)
 *   Degré d’alcool                  [(−)   40 % vol.  (+)]  NumberInput large (graft 8)
 *   (« Le degré n’impacte pas l’accise pour cette catégorie » when relevant)
 *   Contenant                    Bouteille · 70 cl
 *   [2 cl] [4 cl] … [70 cl] … [Fût 30 L]       (scrolled to the selection)
 *   Result panel (answer first, breakdown after)
 *   « Enregistrer comme produit » (logged in) or `footer(draft)` (logged out
 *   CTA, which keeps the calculation across sign-up: ./savedCalcs)
 *
 * Out-of-range typing is never clamped silently: the calculation uses the
 * nearest allowed value while a line under the field says so, and the field
 * shows that value once editing ends.
 *
 * Changing the category applies its typical strength and container while
 * the user has not set them (a 40 % « Bière » would make no sense), and
 * always replaces a strength outside the category's range.
 * Numbers come from `calculateDroits` (@margebar/shared), the same function
 * the API and the product form use.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calculateDroits, DEFAULT_RATES, type DroitsResult, type Rate } from '@margebar/shared';
import { Button, Card, ChipRow, FadeIn, FiscalCategorySheet, NumberInput, PressableScale, SwapFade, TextField } from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { clamp, formatDegree, formatEuro, formatNumber, NBSP, parseLocaleFloat, toInputString } from '../../../utils/format';
import { useRatesStore } from '../../../store/rates.store';
import { useSystemParamsStore } from '../../../store/systemParams.store';
import { DutyResultPanel } from './DutyResultPanel';
import { categoryDefaults, CONTAINERS, containerMeta, rateExamples, rateIcon } from './duties';

export interface DutyDraft {
  rate: Rate;
  /** Purchase price HT without duties. */
  price: number;
  degree: number;
  volumeCl: number;
  result: DroitsResult;
  /** False while every input still holds its opening value (nothing was calculated yet). */
  edited: boolean;
}

export interface DutyCalculatorProps {
  /** Logged in: shows « Enregistrer comme produit ». */
  onSaveAsProduct?: (draft: DutyDraft) => void;
  /**
   * Rendered after the result (e.g. the logged-out sign-up card). A function
   * receives the current calculation, so the card can keep it across sign-up.
   */
  footer?: React.ReactNode | ((draft: DutyDraft) => React.ReactNode);
  /** The container chips bleed to the screen edges (inside a padded Screen). */
  bleed?: boolean;
}

/** Opening values (« Spiritueux · 11,00 € · 40 % vol. · 70 cl »). */
const INITIAL = { slug: 'spiritueux', price: 11, degree: 40, volumeCl: 70 };

const REFERENCE_URL = 'https://entreprendre.service-public.fr/vosdroits/F32101';
const PRICE_MAX = 99999;
const DEGREE_MAX = 100;
/** Below this width « % vol. » does not fit next to the stepper buttons: « 12,5 % ». */
const SHORT_DEGREE_BELOW = 360;

function useParam(key: string): string | undefined {
  return useSystemParamsStore((s) => s.params.find((p) => p.key === key)?.value);
}

export function DutyCalculator({ onSaveAsProduct, footer, bleed = true }: DutyCalculatorProps) {
  const { width } = useWindowDimensions();
  const storeRates = useRatesStore((s) => s.rates);
  const rates = storeRates?.length ? storeRates : DEFAULT_RATES;
  const year = useParam('tarif_annee') || '2026';
  const seuilSS = parseFloat(useParam('seuil_cotisation_ss') ?? '') || 18;
  const tvaRaw = parseFloat(useParam('tva_normal') ?? '');
  const tvaRate = isFinite(tvaRaw) && tvaRaw > 0 && tvaRaw < 1 ? tvaRaw : 0.2;
  const reference = useParam('lien_reference') || REFERENCE_URL;

  const [slug, setSlug] = useState(INITIAL.slug);
  // Raw values as typed (may be out of range while editing); the
  // calculation always uses the clamped ones.
  const [priceRaw, setPriceRaw] = useState(INITIAL.price);
  const [priceText, setPriceText] = useState(() => toInputString(INITIAL.price, 2));
  const [degreeRaw, setDegreeRaw] = useState(INITIAL.degree);
  const [volumeCl, setVolumeCl] = useState(INITIAL.volumeCl);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingDegree, setEditingDegree] = useState(false);
  const touched = useRef({ degree: false, container: false });

  const price = clamp(priceRaw, 0, PRICE_MAX);
  const degree = clamp(degreeRaw, 0, DEGREE_MAX);
  const rate = rates.find((r) => r.slug === slug) ?? rates.find((r) => r.slug === 'spiritueux') ?? rates[0];
  const result = useMemo(() => calculateDroits(rate, volumeCl, degree, price, tvaRate, seuilSS), [rate, volumeCl, degree, price, tvaRate, seuilSS]);

  const selectRate = useCallback((next: Rate) => {
    setSlug(next.slug);
    const d = categoryDefaults(next);
    setDegreeRaw((current) => {
      const c = clamp(current, 0, DEGREE_MAX);
      if (!touched.current.degree || c < d.min || c > d.max) {
        touched.current.degree = false;
        return d.degree;
      }
      return c;
    });
    if (!touched.current.container) setVolumeCl(d.volumeCl);
  }, []);

  // Prix d’achat: a typed field (as in the D1 mockup). Live while valid;
  // an empty or unreadable entry keeps the last price until blur.
  const changePriceText = useCallback((t: string) => {
    const cleaned = t.replace(/[^0-9.,\s]/g, '');
    setPriceText(cleaned);
    const n = parseLocaleFloat(cleaned);
    if (isFinite(n) && n >= 0) setPriceRaw(n);
  }, []);
  const focusPrice = useCallback(() => setEditingPrice(true), []);
  const blurPrice = useCallback(() => {
    const v = Number(clamp(priceRaw, 0, PRICE_MAX).toFixed(2));
    setEditingPrice(false);
    setPriceRaw(v);
    setPriceText(toInputString(v, 2));
  }, [priceRaw]);

  // Degré: the kit stepper. While typing, `max` is lifted so an
  // out-of-range value reaches us (and gets a message) instead of being
  // dropped; it is clamped when editing ends.
  const changeDegree = useCallback((v: number) => {
    touched.current.degree = true;
    setDegreeRaw(v);
  }, []);
  const editDegree = useCallback((editing: boolean) => {
    setEditingDegree(editing);
    if (!editing) setDegreeRaw((raw) => clamp(raw, 0, DEGREE_MAX));
  }, []);

  const changeContainer = useCallback((key: string) => {
    touched.current.container = true;
    setVolumeCl(Number(key));
  }, []);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const priceOver = priceRaw > PRICE_MAX;
  const degreeOver = degreeRaw > DEGREE_MAX;
  const hint = degreeOver
    ? {
        text: `Maximum ${formatDegree(DEGREE_MAX)} : c’est la valeur utilisée pour le calcul.`,
        tone: 'warn' as const,
      }
    : degreeHint(rate, degree, seuilSS);
  const edited = rate.slug !== INITIAL.slug || price !== INITIAL.price || degree !== INITIAL.degree || volumeCl !== INITIAL.volumeCl;
  const draft: DutyDraft = { rate, price, degree, volumeCl, result, edited };
  const footerNode = typeof footer === 'function' ? footer(draft) : footer;
  const formatDeg = width < SHORT_DEGREE_BELOW ? (n: number) => `${formatNumber(n, Number.isInteger(n) ? 0 : 1)}${NBSP}%` : formatDegree;

  return (
    <View>
      {/* Catégorie fiscale */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>Catégorie fiscale</Text>
        <Text style={styles.meta}>{`${rates.length} catégories`}</Text>
      </View>
      <Card onPress={openSheet} padding={0} accessibilityLabel={`Catégorie fiscale : ${rate.label}. Changer de catégorie`} testID="duty-category">
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

      {/* Prix d’achat */}
      <View style={styles.section} testID="duty-price">
        <TextField
          label="Prix d’achat HT"
          meta="hors droits"
          value={priceText}
          onChangeText={changePriceText}
          onFocus={focusPrice}
          onBlur={blurPrice}
          keyboardType="decimal-pad"
          inputMode="decimal"
          selectTextOnFocus
          maxLength={10}
          suffix="€"
          accessibilityLabel="Prix d’achat hors taxes, hors droits, en euros"
          error={priceOver ? `Maximum ${formatEuro(PRICE_MAX, { trimZeros: true })} : c’est la valeur utilisée pour le calcul.` : null}
          testID="duty-price-input"
        />
      </View>

      {/* Degré d’alcool */}
      <NumberInput
        size="large"
        label="Degré d’alcool"
        value={degreeRaw}
        onChange={changeDegree}
        step={0.5}
        min={0}
        max={editingDegree ? Infinity : DEGREE_MAX}
        decimals={1}
        format={formatDeg}
        suffix={`%${NBSP}vol.`}
        accessibilityLabel="Degré d’alcool"
        onEditingChange={editDegree}
        style={styles.degree}
        testID="duty-degree"
      />
      {hint ? (
        <FadeIn key={hint.text} offset={4} duration={160}>
          <View style={styles.hint} accessibilityLiveRegion="polite">
            <Ionicons
              name={hint.tone === 'warn' ? 'alert-circle-outline' : 'information-circle-outline'}
              size={17}
              color={hint.tone === 'warn' ? palette.warn : palette.text3}
              style={styles.hintIcon}
            />
            <Text style={[styles.hintText, hint.tone === 'warn' && styles.hintWarn]}>{hint.text}</Text>
          </View>
        </FadeIn>
      ) : null}

      {/* Contenant */}
      <View style={[styles.labelRow, styles.section]}>
        <Text style={styles.label}>Contenant</Text>
        <Text style={styles.meta}>{containerMeta(volumeCl)}</Text>
      </View>
      <ChipRow items={CONTAINERS} selectedKey={String(volumeCl)} onSelect={changeContainer} bleed={bleed} accessibilityLabel="Contenant" />

      {/* Résultat */}
      <View style={styles.section}>
        <DutyResultPanel
          result={result}
          rate={rate}
          price={price}
          volumeCl={volumeCl}
          seuilSS={seuilSS}
          tvaRate={tvaRate}
          instant={editingPrice || editingDegree}
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
          <Text style={styles.saveNote}>{`Le prix HT avec droits (${formatEuro(result.prixHTAvecDroits)}) devient votre prix${NBSP}d’achat.`}</Text>
        </View>
      ) : null}

      {footerNode ? <View style={styles.section}>{footerNode}</View> : null}

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

/** Contextual note under the degree. */
function degreeHint(rate: Rate, degree: number, seuilSS: number): { text: string; tone: 'info' | 'warn' } | null {
  const seuil = `${formatNumber(seuilSS)}${NBSP}%${NBSP}vol.`;
  if (rate.slug === 'biere_legere' && degree > 2.8) {
    return {
      text: `Au-delà de 2,8${NBSP}%${NBSP}vol., choisissez la catégorie « Bière ».`,
      tone: 'warn',
    };
  }
  if ((rate.slug === 'biere' || rate.slug === 'petite_brasserie') && degree > 0 && degree <= 2.8) {
    return {
      text: `Jusqu’à 2,8${NBSP}%${NBSP}vol., choisissez la catégorie « Bière légère ».`,
      tone: 'warn',
    };
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
    marginTop: 4,
  },
  label: { ...type.label, color: palette.text2 },
  meta: { ...type.footnoteStrong, color: palette.text3 },
  section: { marginTop: 20 },
  degree: { marginTop: 16 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
  },
  pickerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.icon,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTexts: { flex: 1, minWidth: 0 },
  pickerTitle: { ...type.headline, color: palette.ink },
  pickerSub: { ...type.footnote, color: palette.text3, marginTop: 1 },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 44,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  changeText: { ...type.calloutStrong, color: palette.em700 },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
  },
  hintIcon: { marginTop: 1 },
  hintText: { ...type.footnote, color: palette.text3, flex: 1 },
  hintWarn: { color: palette.warn },
  saveNote: {
    ...type.footnote,
    color: palette.text3,
    textAlign: 'center',
    marginTop: 10,
  },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    minHeight: 44,
    marginTop: 12,
    paddingHorizontal: 8,
  },
  sourceText: { ...type.footnoteStrong, color: palette.em700 },
});
