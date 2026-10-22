/**
 * « Gardez ce calcul »: a visitor's duty calculation survives the sign-up.
 *
 * When a logged-out visitor leaves the calculator through « Créer un compte
 * gratuit » or « J’ai déjà un compte », the calculation is appended to
 * « margebar_saved_calcs » (device storage). The product form's first step
 * offers that list (« Depuis le calculateur de droits »), and the empty
 * dashboard offers the latest one (« Reprendre votre calcul »).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SAVED_CALCS_KEY, parseSavedCalcs, type SavedCalc } from '../../products/form/SavedCalcsSheet';
import { formatVolumeCl } from '../../../utils/format';
import type { DutyDraft } from './DutyCalculator';
import { FISCAL_TO_PRODUCT_CATEGORY } from './duties';

/** Kept newest first; older ones drop off. */
const MAX_SAVED = 20;

const cents = (n: number) => Math.round(n * 100) / 100;

function sameCalc(a: SavedCalc, b: SavedCalc): boolean {
  return a.fiscalCategory === b.fiscalCategory && a.volumeCl === b.volumeCl && a.degree === b.degree && a.prixHTHorsDroit === b.prixHTHorsDroit;
}

export function savedCalcFromDraft(d: DutyDraft): SavedCalc {
  return {
    id: `calc-${Date.now().toString(36)}`,
    // « Spiritueux 70 cl », « Bière 33 cl » (the rate's « (plus de 2,8 %) » is
    // for the tax, not a product name): a starting name the form lets the user change.
    name: `${d.rate.label.replace(/\s*\([^)]*\)/g, '').trim() || d.rate.label} ${formatVolumeCl(d.volumeCl)}`,
    fiscalCategory: d.rate.slug,
    prixHTHorsDroit: cents(d.price),
    volumeCl: d.volumeCl,
    degree: d.degree,
    prixHTAvecDroits: cents(d.result.prixHTAvecDroits),
    prixTTC: cents(d.result.prixTTC),
  };
}

export async function loadSavedCalcs(): Promise<SavedCalc[]> {
  try {
    return parseSavedCalcs(await AsyncStorage.getItem(SAVED_CALCS_KEY));
  } catch {
    return [];
  }
}

/**
 * Keeps the calculation on this device (newest first; the same calculation
 * twice moves to the top instead of being duplicated). Never throws: storage
 * may be full or blocked, and the sign-up must go on regardless.
 */
export async function rememberCalc(d: DutyDraft): Promise<void> {
  try {
    const calc = savedCalcFromDraft(d);
    const list = await loadSavedCalcs();
    const next = [calc, ...list.filter((c) => !sameCalc(c, calc))].slice(0, MAX_SAVED);
    await AsyncStorage.setItem(SAVED_CALCS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * Product form prefill (`scanData`, see screens/products/form/model.ts) for a
 * saved calculation: same fields as « Enregistrer comme produit », so the form
 * opens in « Prix hors droits » with the duties itemised. No name: the user
 * types the real product name.
 */
export function calcPrefill(c: SavedCalc) {
  const category = FISCAL_TO_PRODUCT_CATEGORY[c.fiscalCategory];
  return {
    ...(category ? { category } : null),
    fiscalCategory: c.fiscalCategory,
    containerVolumeCl: c.volumeCl,
    alcoholDegree: c.degree,
    prixHTHorsDroit: c.prixHTHorsDroit,
    prixHTAvecDroits: c.prixHTAvecDroits,
  };
}
