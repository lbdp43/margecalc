/**
 * Fiche produit — create (scan step, then the form) and edit (« Modifier le produit »).
 *
 * Route params (contract, see form/model.ts `ProductFormParams`):
 *   { productId }                       edit that product (no scan step)
 *   { scanData: prefill }               new product prefilled (duty calculator, scan…), no scan step
 *   { start: 'form' } | { manual: true } new product, manual entry (no scan step)
 *   {}                                  new product, starts with « Scanner un produit »
 *
 * One form with three sections (Produit · Contenant & achat · Services & prix),
 * a sticky « Enregistrer » bar, and ONE request that saves the product with
 * all its services (inline `servings`). See BRIEF §2 for RC1–RC13.
 *
 * Lot 2 (UX audit n° 6, mockup 4): a successful bottle scan opens the form
 * directly (no « Étiquette lue · Continuer » screen) with a dismissible
 * banner « Étiquette lue : Jameson Irish Whiskey · 70 cl · 40 % vol. ·
 * Reprendre la photo », the purchase price first and focused (decimal
 * keypad), the category's usual service already chosen at its suggested
 * price, and the margin tiles right under it; what the label gave (name,
 * category, container, degree, TVA) follows. A failed read keeps the friendly
 * card and « Continuer sans lecture ».
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BottleScanResult, Category, CustomContainer, ServingType } from '@margebar/shared';
import {
  AnimatedNumber,
  Badge,
  Button,
  ChipRow,
  EmptyState,
  FadeIn,
  FiscalCategorySheet,
  NavBar,
  Screen,
  StickyActionBar,
  TextField,
  categoryIcon,
  dialog,
  toast,
} from '../../components/ui';
import { fontFamily, marginColors, palette, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { NBSP, formatCoeff, plural } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';
import { usePriceRounding } from '../../utils/priceRounding';
import { afterProductDeleted, afterProductSaved } from '../../navigation/routes';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { useAuthStore } from '../../store/auth.store';
import { useRatesStore } from '../../store/rates.store';
import { useSystemParamsStore } from '../../store/systemParams.store';
import * as productService from '../../services/product.service';
import * as categoryService from '../../services/category.service';
import * as servingService from '../../services/serving.service';
import * as containerService from '../../services/container.service';
import * as scanService from '../../services/scan.service';
import {
  clearProductDraft,
  deleteFormPrefs,
  getFormPrefs,
  getProductDraft,
  saveFormPrefs,
  saveProductDraft,
} from '../../services/draft.service';
import { isOnline } from '../../services/offline';
import { ScanPhase, ScanStep, ScanStepProps } from './form/ScanStep';
import { ScanBanner, type ScanBannerInfo } from './form/ScanBanner';
import { PhotoCard } from './form/PhotoCard';
import { PurchaseSection } from './form/PurchaseSection';
import { PricingSection, pricingMeta } from './form/PricingSection';
import { FormSkeleton } from './form/FormSkeleton';
import { FieldError, FieldLabel, FormSection } from './form/FieldBits';
import { SAVED_CALCS_KEY, SavedCalc, SavedCalcsSheet, parseSavedCalcs } from './form/SavedCalcsSheet';
import { FieldErrors, FieldKey, describeSaveError } from './form/errors';
import { deleteWithUndo } from './list/productActions';
import {
  FormValues,
  NO_PHOTO,
  ProductFormParams,
  ProductPrefill,
  applyPrefill,
  buildPayload,
  derive,
  emptyValues,
  fingerprint,
  lossServices,
  prefsFromValues,
  resolveCategoryId,
  serviceName,
  summaryOf,
  validate,
  valuesFromProduct,
} from './form/model';
import { PhotoError, PickSource, PickedImage, pickImage, preparePhoto, recoverPendingImage } from './form/photo';
import { CUSTOM_DOSE, defaultFiscalSlug, formatMargin, priceFromMode, round2, suggestedPrice, usualServices } from './form/pricing';

type Props = NativeStackScreenProps<any, 'ProductForm'>;
/** `details`: container, degree, duties and TVA, apart from the purchase price after a scan. */
type SectionKey = 'identity' | 'purchase' | 'pricing' | 'details';

const SECTION_OF: Record<FieldKey, SectionKey> = {
  photo: 'identity',
  name: 'identity',
  category: 'identity',
  supplier: 'identity',
  container: 'purchase',
  purchase: 'purchase',
  degree: 'purchase',
  tva: 'purchase',
  services: 'pricing',
};

/** Which error each value key clears when it changes. */
const CLEARS: Array<[keyof FormValues, FieldKey]> = [
  ['name', 'name'],
  ['categoryId', 'category'],
  ['supplier', 'supplier'],
  ['containerCl', 'container'],
  ['purchase', 'purchase'],
  ['horsDroits', 'purchase'],
  ['fiscalSlug', 'purchase'],
  ['degree', 'degree'],
  ['horsDroits', 'degree'],
  ['fiscalSlug', 'degree'],
  ['tvaRate', 'tva'],
  ['services', 'services'],
  ['customDoseCl', 'services'],
  ['photo', 'photo'],
];

/** After a scan these fields sit in the « details » section, under the prices. */
const QUICK_DETAILS = new Set<FieldKey>(['container', 'degree', 'tva']);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The category's usual service(s), switched on at the suggested price (they
 * follow the purchase price until touched). Only when no service is chosen yet.
 */
function withUsualServices(
  v: FormValues,
  slug: string | null | undefined,
  servingTypes: ServingType[],
  goodPct: number,
  rounding: number,
): { values: FormValues; keys: string[] } | null {
  if (Object.keys(v.services).length) return null;
  const usual = usualServices(slug, v.containerCl, servingTypes);
  if (!usual) return null;
  const services: FormValues['services'] = {};
  const containerCl = v.containerCl ?? 0;
  for (const key of usual.keys) {
    const dose = key === CUSTOM_DOSE ? (usual.customDoseCl ?? 0) : (servingTypes.find((t) => t.id === key)?.volumeCl ?? 0);
    const cost = v.purchase !== null && v.purchase >= 0 && containerCl > 0 && dose > 0 && !v.horsDroits ? (v.purchase * dose) / containerCl : 0;
    services[key] = { price: suggestedPrice(cost, v.tvaRate, goodPct, rounding), touched: false, mode: 'price', modeValue: null };
  }
  return {
    values: { ...v, services, selected: usual.keys[0], customDoseCl: usual.customDoseCl ?? v.customDoseCl },
    keys: usual.keys,
  };
}

/** What the scan's usual services were chosen for: the category read, the container, the « à l’unité » dose. */
interface UsualFor {
  slug: string;
  containerCl: number | null;
  customDoseCl: number | null;
}

/**
 * The services are exactly the usual ones the scan chose, untouched (prices
 * still the suggested ones, the « à l’unité » dose still the container read):
 * they may follow a corrected container or category.
 */
function untouchedUsual(v: FormValues, keys: string[] | null, f: UsualFor | null): boolean {
  if (!keys || !f) return false;
  const on = Object.keys(v.services);
  if (on.length !== keys.length || !keys.every((k) => !!v.services[k] && !v.services[k].touched)) return false;
  return !keys.includes(CUSTOM_DOSE) || v.customDoseCl === f.customDoseCl;
}

/** Web: focus the text input inside a wrapper (the kit's NumberInput takes no ref). */
function focusInputIn(node: unknown) {
  if (Platform.OS !== 'web' || !node) return;
  const el: any = node;
  const input = typeof el.querySelector === 'function' ? el.querySelector('input') : null;
  if (input && typeof input.focus === 'function') input.focus();
}

/** « nom », « nom et degré », « nom, contenance et degré ». */
const joinFr = (list: string[]) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`);

/** A draft younger than this is resumed directly after a page reload. */
const RELOAD_RESUME_MS = 10 * 60 * 1000;

/**
 * Web: the page was reloaded on the new-product form. Read once when the app
 * loads (the URL is then the reloaded one) and consumed by the first form that
 * mounts, so a reload elsewhere never resumes a draft later on.
 */
let reloadedOnFormPending: boolean = (() => {
  if (Platform.OS !== 'web') return false;
  try {
    const g = globalThis as any;
    const nav = g.performance?.getEntriesByType?.('navigation')?.[0];
    return nav?.type === 'reload' && /\/produits\/nouveau/.test(g.location?.pathname ?? '');
  } catch {
    return false;
  }
})();

/** A draft is kept once there is real work in it (a photo alone is not worth one). */
const draftWorthy = (v: FormValues) => !!v.name.trim() || v.purchase !== null || Object.keys(v.services).length > 0;

const isWeb = Platform.OS === 'web';
const web = globalThis as any;
const webPath = (): string | null => {
  const loc = web.location;
  return loc ? `${loc.pathname}${loc.search}` : null;
};

export function ProductFormScreen({ route, navigation }: Props) {
  const params = (route.params ?? {}) as ProductFormParams;
  const productId = params.productId;
  const editing = !!productId;
  const prefill: ProductPrefill | undefined = params.scanData;
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { width: winW } = useWindowDimensions();
  const thresholds = useMarginThresholds();
  const rounding = usePriceRounding();
  const rates = useRatesStore((s) => s.rates);
  const seuilSS = useSystemParamsStore((s) => {
    const p = s.params.find((x) => x.key === 'seuil_cotisation_ss');
    const n = p ? parseFloat(p.value) : NaN;
    return isFinite(n) ? n : 18;
  });

  // ─── Data ────────────────────────────────────────────────────────────────
  const categoriesQ = useOfflineQuery<Category[]>(['categories'], categoryService.getCategories);
  const servingTypesQ = useOfflineQuery<ServingType[]>(['servingTypes'], servingService.getServingTypes);
  const containersQ = useOfflineQuery<CustomContainer[]>(['containers'], containerService.getContainers);
  const categories = categoriesQ.data ?? [];
  const servingTypes = servingTypesQ.data ?? [];

  const productQ = useQuery({
    queryKey: productService.productKeys.detail(productId ?? 'new'),
    queryFn: () => productService.getProduct(productId as string),
    enabled: editing,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: (n, err: any) => !(err?.response?.status >= 400 && err?.response?.status < 500) && n < 2,
  });

  // ─── State ───────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'scan' | 'form'>(editing || prefill || params.start === 'form' || (!!params.manual && params.manual !== 'false') ? 'form' : 'scan');
  const stepRef = useRef(step);
  stepRef.current = step;
  const [values, setValues] = useState<FormValues>(() => {
    const base = emptyValues(user);
    return prefill ? applyPrefill(base, prefill, []) : base;
  });
  const [hydrated, setHydrated] = useState(!editing);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success'>('idle');
  const [deleting, setDeleting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Scan step
  const [phase, setPhase] = useState<ScanPhase>('intro');
  const [scanPhoto, setScanPhoto] = useState<string | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const [scanResult, setScanResult] = useState<BottleScanResult | null>(null);
  const scanResultRef = useRef<BottleScanResult | null>(null);
  scanResultRef.current = scanResult;
  const [scanError, setScanError] = useState<ScanStepProps['error']>(null);
  const [draft, setDraft] = useState<{ name: string; savedAt: number; form: FormValues } | null>(null);
  const [savedCalcs, setSavedCalcs] = useState<SavedCalc[]>([]);
  const [calcsOpen, setCalcsOpen] = useState(false);

  // « Continuer sans attendre »: the read keeps going in the background.
  const [lateReading, setLateReading] = useState(false);

  // Lot 2: the form opened straight from a read (banner, purchase price first).
  const [scanBanner, setScanBanner] = useState<ScanBannerInfo | null>(null);
  const [quick, setQuick] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  /** The usual services the scan switched on (the section says « habituel en … » while they are the chosen ones). */
  const usualKeys = useRef<string[] | null>(null);
  /** The category and container they were chosen for (a corrected container or category chooses them again). */
  const usualFor = useRef<UsualFor | null>(null);
  const rememberUsual = useCallback((u: { values: FormValues; keys: string[] } | null, slug: string | null | undefined) => {
    usualKeys.current = u?.keys ?? null;
    usualFor.current = u && slug ? { slug, containerCl: u.values.containerCl, customDoseCl: u.values.customDoseCl } : null;
  }, []);
  /** A read landed before the service types: switch the usual service on once they arrive. */
  const pendingUsual = useRef<string | null>(null);
  const purchaseRef = useRef<View>(null);

  const scanToken = useRef(0);
  const scanAbort = useRef<AbortController | null>(null);
  /** Token of a read the user skipped: its result only fills the fields still empty. */
  const lateScan = useRef<number | null>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  const createdId = useRef<string | null>(null);
  const allowLeave = useRef(false);
  /** The validation toast is on screen (it goes as soon as a field it pointed at changes). */
  const validationToast = useRef(false);
  /** An « Annuler » toast of this screen may be up: it must not outlive the form (its undo would do nothing). */
  const undoToast = useRef(false);
  const markUndoToast = useCallback(() => {
    undoToast.current = true;
  }, []);
  const clearUndoToast = useCallback(() => {
    if (!undoToast.current) return;
    undoToast.current = false;
    toast.clear();
  }, []);
  /** The user chose a container (a late scan result then leaves it alone). */
  const containerTouched = useRef(false);
  const baseline = useRef<string>(fingerprint(values));
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const servingTypesRef = useRef(servingTypes);
  servingTypesRef.current = servingTypes;
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;
  const roundingRef = useRef(rounding);
  roundingRef.current = rounding;
  const prevValues = useRef(values);
  const categoryHint = useRef<{ categoryId?: string | null; category?: string | null; fiscalCategory?: string | null }>(
    prefill ? { categoryId: prefill.categoryId, category: prefill.category, fiscalCategory: prefill.fiscalCategory } : {},
  );
  const tvaTouched = useRef(false);
  const wasReload = useRef<boolean | null>(null);
  if (wasReload.current === null) {
    wasReload.current = reloadedOnFormPending && !editing && !prefill;
    reloadedOnFormPending = false;
  }
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<SectionKey, number>>({ identity: 0, purchase: 0, pricing: 0, details: 0 });

  const patch = useCallback((p: Partial<FormValues>) => {
    if ('tvaRate' in p) tvaTouched.current = true;
    if ('containerCl' in p || 'containerOther' in p) containerTouched.current = true;
    setValues((v) => ({ ...v, ...p }));
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Leaving the screen abandons a read in flight (nothing would show it).
      scanAbort.current?.abort();
      if (undoToast.current) toast.clear();
    };
  }, []);

  const quotaQ = useQuery({
    queryKey: ['scanQuota'],
    queryFn: scanService.getScanQuota,
    enabled: step === 'scan' && !editing,
    staleTime: 60_000,
    retry: false,
  });

  // ─── Hydration (edit) ────────────────────────────────────────────────────
  useEffect(() => {
    if (!editing || hydrated || !productQ.data || !productQ.isFetchedAfterMount) return;
    let cancelled = false;
    getFormPrefs(productQ.data.id).then((prefs) => {
      if (cancelled) return;
      const v = valuesFromProduct(productQ.data!, prefs, user, rates, seuilSS);
      baseline.current = fingerprint(v);
      prevValues.current = v;
      setValues(v);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [editing, hydrated, productQ.data, productQ.isFetchedAfterMount, user, rates, seuilSS]);

  // Category of a new product: only from the prefill / scan hint. Without one it
  // stays empty and validation names the field — never a silent « Spiritueux »
  // (it drives the filters, the dashboard and the softs TVA).
  useEffect(() => {
    if (editing || !categories.length) return;
    if (values.categoryId && categories.some((c) => c.id === values.categoryId)) return;
    const hinted = resolveCategoryId(categories, categoryHint.current);
    const id = hinted && categories.some((c) => c.id === hinted) ? hinted : null;
    if (!id) {
      if (values.categoryId) setValues((v) => ({ ...v, categoryId: null })); // a category that no longer exists
      return;
    }
    setValues((v) => {
      const next = { ...v, categoryId: id };
      if (v.horsDroits === false && !categoryHint.current.fiscalCategory) next.fiscalSlug = defaultFiscalSlug(categories.find((c) => c.id === id)?.slug);
      return next;
    });
    if (fingerprint(valuesRef.current) === baseline.current) {
      // the automatic choice is not a user change
      baseline.current = fingerprint({ ...valuesRef.current, categoryId: id });
    }
  }, [editing, categories, values.categoryId]);

  // Softs are usually sold at 10 % (until the user picks a rate).
  const categorySlug = categories.find((c) => c.id === values.categoryId)?.slug;
  useEffect(() => {
    if (editing || tvaTouched.current || user?.isAutoEntrepreneur) return;
    const def = typeof user?.defaultTvaRate === 'number' ? user.defaultTvaRate : 0.2;
    const want = categorySlug === 'softs' ? 0.1 : def;
    setValues((v) => (Math.abs(v.tvaRate - want) < 1e-6 ? v : { ...v, tvaRate: want }));
  }, [categorySlug, editing, user]);

  // Clear a field's error as soon as it changes.
  useEffect(() => {
    const prev = prevValues.current;
    prevValues.current = values;
    if (!Object.keys(errors).length) return;
    const next = { ...errors };
    let changed = false;
    for (const [k, f] of CLEARS) {
      if (next[f] && prev[k] !== values[k]) {
        delete next[f];
        changed = true;
      }
    }
    if (changed) {
      setErrors(next);
      // The validation toast is stale as soon as a field it pointed at changes
      // (the inline errors that remain say the rest).
      if (validationToast.current) {
        validationToast.current = false;
        toast.clear();
      }
    }
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived numbers ─────────────────────────────────────────────────────
  const d = useMemo(() => derive(values, servingTypes, rates, seuilSS), [values, servingTypes, rates, seuilSS]);

  // Suggested prices follow the purchase price; Marge / Coeff services keep their value.
  const costKey = `${d.costKnown}|${d.purchaseHT}|${d.containerCl}|${values.tvaRate}|${values.customDoseCl}|${servingTypes.length}|${thresholds.good}|${rounding}`;
  useEffect(() => {
    if (!hydrated) return;
    setValues((v) => {
      let changed = false;
      const services = { ...v.services };
      for (const [k, s] of Object.entries(v.services)) {
        const cost = d.costOf(k);
        let price = s.price;
        if (!s.touched) price = suggestedPrice(cost, v.tvaRate, thresholds.good, rounding);
        else if (s.mode !== 'price' && s.modeValue !== null && cost > 0) price = round2(priceFromMode(s.mode, s.modeValue, cost, v.tvaRate));
        if (price > 0 && Math.abs(price - s.price) > 0.001) {
          services[k] = { ...s, price };
          changed = true;
        }
      }
      return changed ? { ...v, services } : v;
    });
  }, [costKey, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // The read landed before the service types: switch the usual service on as soon as they arrive.
  useEffect(() => {
    const slug = pendingUsual.current;
    if (!slug || step !== 'form' || !servingTypes.length) return;
    pendingUsual.current = null;
    const usual = withUsualServices(valuesRef.current, slug, servingTypes, thresholds.good, rounding);
    if (!usual) return;
    rememberUsual(usual, slug);
    setValues(usual.values);
  }, [servingTypes, step, thresholds.good, rounding, rememberUsual]);

  // The usual services follow what the label said until the user touches them: a corrected container
  // (« À l’unité » 33 → 50 cl, a 33 cl bottle → a keg: Demi + Pinte) or category (a wine read as a
  // spirit: Verre de vin 12 cl) chooses them again, at the suggested price. Never once one is touched.
  useEffect(() => {
    const f = usualFor.current;
    if (!f || step !== 'form' || !servingTypes.length) return;
    const slugChanged = !!categorySlug && categorySlug !== f.slug;
    if (!slugChanged && values.containerCl === f.containerCl) return;
    const cur = valuesRef.current;
    if (!untouchedUsual(cur, usualKeys.current, f)) return;
    const slug = categorySlug ?? f.slug;
    const next = withUsualServices({ ...cur, services: {} }, slug, servingTypes, thresholds.good, rounding);
    // No usual service there (a category without one, a container too small): keep these as they are.
    if (!next) return;
    // The suggested price of each, duties included (as the « follow the purchase price » effect computes it).
    const dv = derive(next.values, servingTypes, rates, seuilSS);
    const services: FormValues['services'] = {};
    for (const [k, svc] of Object.entries(next.values.services)) {
      services[k] = { ...svc, price: suggestedPrice(dv.costOf(k), next.values.tvaRate, thresholds.good, rounding) };
    }
    rememberUsual(next, slug);
    setValues((v) => ({ ...v, services, selected: next.values.selected, customDoseCl: next.values.customDoseCl }));
  }, [categorySlug, values.containerCl, step, servingTypes, thresholds.good, rounding, rates, seuilSS, rememberUsual]);

  // After a read: the purchase price is the one field left, focus it (decimal keypad; web only, see FOUNDATION §4).
  useEffect(() => {
    if (!focusTick || step !== 'form') return;
    const t = setTimeout(() => focusInputIn(purchaseRef.current), 360);
    return () => clearTimeout(t);
  }, [focusTick, step]);

  // ─── Draft (new product): saved as you type ─────────────────────────────
  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    if (step === 'scan') {
      getProductDraft<FormValues>(user?.id).then((dr) => {
        if (!cancelled && dr) setDraft({ name: dr.name, savedAt: dr.savedAt, form: dr.form });
      });
      AsyncStorage.getItem(SAVED_CALCS_KEY)
        .then((raw) => {
          if (!cancelled) setSavedCalcs(parseSavedCalcs(raw));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [editing, step, user?.id]);

  useEffect(() => {
    if (editing || step !== 'form' || saveState !== 'idle') return;
    const fp = fingerprint(values);
    if (fp === baseline.current || !draftWorthy(values)) return;
    const t = setTimeout(() => {
      saveProductDraft(user?.id, values.name.trim(), values).then((ok) => ok && setDraftSaved(true));
    }, 700);
    return () => clearTimeout(t);
  }, [values, editing, step, saveState, user?.id]);

  // ─── Leaving ─────────────────────────────────────────────────────────────
  // NavBar, Android back, browser back and reload. Unsaved edits of an existing
  // product, or a save in flight, are guarded. (A new product needs no guard:
  // its draft keeps the work, and a reload resumes it.)
  const dirtyEdit = editing && hydrated && step === 'form' && fingerprint(values) !== baseline.current;
  const guardActive = dirtyEdit || saveState === 'saving';
  /** Web: the form's own history entry, put back when a browser back is refused. */
  const ownEntry = useRef<{ state: unknown; path: string } | null>(null);
  /** A browser back popped the form's entry while the dialog decides. */
  const restored = useRef(false);
  const confirming = useRef(false);
  /**
   * Captured while the form is on screen and its URL long settled (the first
   * edit, a save), never at mount: the router writes the new URL after the
   * screen's first effects.
   */
  const captureEntry = useCallback(() => {
    const path = isWeb ? webPath() : null;
    if (path && web.history) ownEntry.current = { state: web.history.state, path };
  }, []);

  useEffect(() => {
    if (!isWeb || !guardActive) return;
    captureEntry();
    // Reload / tab close: the browser's own « leave this page? » prompt.
    const onBeforeUnload = (ev: any) => {
      ev.preventDefault();
      ev.returnValue = '';
      return '';
    };
    web.addEventListener?.('beforeunload', onBeforeUnload);
    return () => web.removeEventListener?.('beforeunload', onBeforeUnload);
  }, [guardActive, captureEntry]);

  /**
   * After a refused browser back the URL is already the previous screen's while
   * the form stays: push the form's entry back so the URL, the next back and a
   * reload all match the screen. False when the URL is still the form's (NavBar).
   */
  const restoreEntry = useCallback((): boolean => {
    if (!isWeb) return false;
    const own = ownEntry.current;
    const path = webPath();
    if (!own || !path || !web.history || path === own.path) return false;
    web.history.pushState(own.state, '', own.path);
    // The router still counts the refused back as the pop in progress: the next
    // navigation (« Enregistrer », the NavBar back) would then overwrite the
    // form's entry instead of going back, leaving « detail, detail ». A no-op
    // state change settles it (same URL, same entry).
    setTimeout(() => {
      if (mounted.current) navigation.setParams({});
    }, 0);
    return true;
  }, [navigation]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e: any) => {
        if (allowLeave.current) return;
        // A save in flight finishes here: leaving now would say « Brouillon
        // conservé » and then jump to the saved product a few seconds later.
        if (saving.current) {
          e.preventDefault();
          restoreEntry();
          toast.info('Enregistrement en cours…');
          return;
        }
        const dirty = fingerprint(valuesRef.current) !== baseline.current;
        if (!dirty || step !== 'form') {
          clearUndoToast();
          return;
        }
        if (!editing) {
          clearUndoToast();
          // The draft keeps the work: save it now and say so.
          if (!draftWorthy(valuesRef.current)) return;
          saveProductDraft(user?.id, valuesRef.current.name.trim(), valuesRef.current);
          toast.info('Brouillon conservé');
          return;
        }
        e.preventDefault();
        if (restoreEntry()) restored.current = true;
        if (confirming.current) return; // a second back while the dialog is open
        confirming.current = true;
        dialog
          .confirm({
            title: 'Quitter sans enregistrer ?',
            message: 'Vos modifications de ce produit seront perdues.',
            confirmLabel: 'Quitter sans enregistrer',
            cancelLabel: 'Continuer la modification',
            destructive: true,
            icon: 'exit-outline',
          })
          .then((ok) => {
            confirming.current = false;
            const replay = restored.current;
            restored.current = false;
            if (!ok || !mounted.current) return;
            allowLeave.current = true;
            clearUndoToast();
            // A browser back: replay it from the restored entry, so the history
            // reads « …, detail » with the form as the forward entry.
            if (replay) web.history.back();
            else navigation.dispatch(e.data.action);
            // The removal normally unmounts the form; if it did not, guard again.
            setTimeout(() => {
              if (mounted.current) allowLeave.current = false;
            }, 1500);
          });
      }),
    [navigation, step, editing, user?.id, clearUndoToast, restoreEntry],
  );

  // ─── Scan ────────────────────────────────────────────────────────────────
  /**
   * A read the user skipped (« Continuer sans attendre ») landed: fill only the
   * fields that are still empty — the user's own entries always win — and say so.
   * The quota it used is not wasted.
   */
  const applyLateScan = useCallback(
    (res: BottleScanResult) => {
      const cur = valuesRef.current;
      const next: Partial<FormValues> = {};
      const filled: string[] = [];
      const name = res.name?.trim();
      if (name && !cur.name.trim()) {
        next.name = name;
        filled.push('nom');
      }
      if (!cur.categoryId && res.category) {
        const id = resolveCategoryId(categories, { category: res.category });
        if (id && categories.some((c) => c.id === id)) {
          next.categoryId = id;
          categoryHint.current = { category: res.category };
          filled.push('catégorie');
        }
      }
      if (res.containerVolumeCl && res.containerVolumeCl > 0 && !containerTouched.current && cur.containerCl !== res.containerVolumeCl) {
        next.containerCl = res.containerVolumeCl;
        next.containerOther = false;
        filled.push('contenance');
      }
      if (cur.degree === null && typeof res.alcoholDegree === 'number' && res.alcoholDegree > 0 && res.alcoholDegree <= 100) {
        next.degree = res.alcoholDegree;
        filled.push('degré');
      }
      if (cur.purchase === null && res.estimatedPriceHT && res.estimatedPriceHT > 0) {
        next.purchase = round2(res.estimatedPriceHT);
        filled.push('prix d’achat');
      }
      if (!filled.length) return;
      // Re-check at apply time: a field typed meanwhile is never overwritten.
      setValues((v) => {
        const merged: FormValues = {
          ...v,
          ...(next.name && !v.name.trim() ? { name: next.name } : null),
          ...(next.categoryId && !v.categoryId ? { categoryId: next.categoryId } : null),
          ...(next.containerCl && !containerTouched.current ? { containerCl: next.containerCl, containerOther: false } : null),
          ...(next.degree !== undefined && v.degree === null ? { degree: next.degree } : null),
          ...(next.purchase !== undefined && v.purchase === null ? { purchase: next.purchase } : null),
        };
        // No service chosen yet: the category's usual one (lot 2).
        const slug = categories.find((c) => c.id === merged.categoryId)?.slug ?? res.category;
        const usual = withUsualServices(merged, slug, servingTypesRef.current, thresholdsRef.current.good, roundingRef.current);
        if (usual) rememberUsual(usual, slug);
        return usual ? usual.values : merged;
      });
      toast.success(`Étiquette lue${NBSP}: ${joinFr(filled)} pré-rempli${filled.length > 1 ? 's' : ''}`);
    },
    [categories, rememberUsual],
  );
  const applyLateScanRef = useRef(applyLateScan);
  applyLateScanRef.current = applyLateScan;

  const runScan = useCallback(
    async (img: PickedImage) => {
      const token = ++scanToken.current;
      scanAbort.current?.abort();
      lateScan.current = null;
      setLateReading(false);
      setScanPhoto(img.uri);
      setScanResult(null);
      setScanError(null);
      setPhotoReady(false);
      setPhase('preparing');
      let prepared;
      try {
        prepared = await preparePhoto(img, { forOcr: true });
      } catch (err: any) {
        if (token !== scanToken.current) return;
        setScanPhoto(null);
        setScanError({ title: 'Image illisible', message: err?.message || 'Impossible de lire cette image.', tone: 'bad' });
        setPhase('error');
        haptics.warning();
        return;
      }
      if (token !== scanToken.current) return;
      setScanPhoto(prepared.imageUrl);
      setValues((v) => ({ ...v, photo: { imageUrl: prepared.imageUrl, thumbnailUrl: prepared.thumbnailUrl, changed: true, source: 'scan' } }));
      setPhotoReady(true);
      setPhase('reading');
      const ctrl = new AbortController();
      scanAbort.current = ctrl;
      try {
        const res = await scanService.scanBottle(prepared.ocrBase64 as string, { signal: ctrl.signal });
        if (scanAbort.current === ctrl) scanAbort.current = null;
        queryClient.invalidateQueries({ queryKey: ['scanQuota'] });
        if (!mounted.current) return;
        if (lateScan.current === token) {
          lateScan.current = null;
          setLateReading(false);
          applyLateScanRef.current(res);
          return;
        }
        if (token !== scanToken.current) return;
        setScanResult(res);
        haptics.success();
        // Straight to the form (lot 2): no « Étiquette lue · Continuer » screen.
        arriveFromScanRef.current(res, token);
      } catch (err) {
        if (scanAbort.current === ctrl) scanAbort.current = null;
        if (!mounted.current || scanService.isScanCancelled(err)) return;
        if (lateScan.current === token) {
          // The user already moved on: a failed late read changes nothing.
          lateScan.current = null;
          setLateReading(false);
          return;
        }
        if (token !== scanToken.current) return;
        const info = scanService.describeScanError(err);
        setScanError({
          title: info.title,
          message: info.message,
          tone: info.kind === 'quota' || info.kind === 'cooldown' || info.kind === 'busy' || info.kind === 'offline' ? 'warn' : 'bad',
          icon:
            info.kind === 'offline'
              ? 'cloud-offline-outline'
              : info.kind === 'quota' || info.kind === 'busy'
                ? 'time-outline'
                : info.kind === 'cooldown'
                  ? 'hourglass-outline'
                  : info.kind === 'timeout'
                    ? 'timer-outline'
                    : 'alert-circle-outline',
        });
        setPhase('error');
        haptics.warning();
      }
    },
    [queryClient],
  );

  const onPick = useCallback(
    async (source: PickSource) => {
      let img: PickedImage | null = null;
      try {
        img = await pickImage(source);
      } catch (err: any) {
        if (err instanceof PhotoError) dialog.alert({ title: 'Accès à la photo refusé', message: err.message, tone: 'warn', icon: 'camera-outline' });
        return;
      }
      if (img) runScan(img);
    },
    [runScan],
  );

  // Android: the camera may have killed the activity — recover that photo.
  useEffect(() => {
    if (step !== 'scan') return;
    recoverPendingImage().then((img) => {
      if (img) runScan(img);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resumeFrom = useCallback(
    (form: FormValues) => {
      scanToken.current++;
      scanAbort.current?.abort();
      const v = { ...emptyValues(user), ...form, photo: form.photo ?? NO_PHOTO };
      tvaTouched.current = true;
      containerTouched.current = true;
      setValues(v);
      setDraftSaved(true);
      setStep('form');
    },
    [user],
  );

  const resumeDraft = useCallback(() => {
    if (draft) resumeFrom(draft.form);
  }, [draft, resumeFrom]);

  // Reloaded in the middle of a new product: put the work back on screen.
  useEffect(() => {
    if (!wasReload.current) return;
    let cancelled = false;
    getProductDraft<FormValues>(user?.id).then((dr) => {
      if (cancelled || !dr || Date.now() - dr.savedAt > RELOAD_RESUME_MS) return;
      resumeFrom(dr.form);
      markUndoToast();
      toast.info('Brouillon repris', {
        action: {
          label: 'Nouveau produit',
          onPress: () => {
            // The draft stays on the scan step's card: nothing is lost.
            const fresh = emptyValues(user);
            baseline.current = fingerprint(fresh);
            prevValues.current = fresh;
            tvaTouched.current = false;
            containerTouched.current = false;
            setValues(fresh);
            setDraftSaved(false);
            setPhase('intro');
            setStep('scan');
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Starting a new product while a draft waits: say that the new one will
   * replace it (it is overwritten as soon as the new form is saved as a draft)
   * and offer to resume it instead. Resolves true to go on with the new product.
   */
  const confirmOverDraft = useCallback(async (): Promise<boolean> => {
    if (!draft) return true;
    const choice = await dialog.show<'new' | 'resume' | null>({
      title: 'Un brouillon est en cours',
      message: `« ${draft.name || 'Produit sans nom'} » n’est pas encore enregistré. Ce nouveau produit remplacera ce brouillon.`,
      icon: 'document-text-outline',
      actions: [
        { label: 'Nouveau produit', value: 'new', style: 'primary' },
        { label: 'Reprendre le brouillon', value: 'resume', style: 'secondary' },
        { label: 'Annuler', value: null, style: 'cancel' },
      ],
    });
    if (choice === 'resume') resumeDraft();
    return choice === 'new';
  }, [draft, resumeDraft]);

  const prefillFromScan = useCallback(
    (res: BottleScanResult) => {
      categoryHint.current = { category: res.category };
      setValues((v) =>
        applyPrefill(
          v,
          {
            name: res.name || undefined,
            category: res.category,
            containerVolumeCl: res.containerVolumeCl,
            alcoholDegree: res.alcoholDegree,
            estimatedPriceHT: res.estimatedPriceHT,
          },
          categories,
        ),
      );
    },
    [categories],
  );

  const continueFromScan = useCallback(async () => {
    if (!(await confirmOverDraft())) return;
    scanToken.current++;
    if (scanResultRef.current) prefillFromScan(scanResultRef.current);
    setStep('form');
  }, [prefillFromScan, confirmOverDraft]);

  /**
   * A read succeeded (lot 2): fill the form, switch the category's usual
   * service on, show the « Étiquette lue » banner and open the form with the
   * purchase price first and focused.
   */
  const arriveFromScan = useCallback(
    async (res: BottleScanResult, token: number) => {
      if (draft) {
        const go = await confirmOverDraft();
        if (!mounted.current || token !== scanToken.current) return;
        if (!go) {
          // « Reprendre le brouillon » opened the form already; « Annuler » goes back to the camera step.
          if (stepRef.current === 'scan') {
            setScanPhoto(null);
            setScanResult(null);
            setPhotoReady(false);
            setValues((v) => ({ ...v, photo: NO_PHOTO }));
            setPhase('intro');
          }
          return;
        }
      }
      scanToken.current++;
      categoryHint.current = { category: res.category };
      const slug = res.category || null;
      const filled = applyPrefill(
        valuesRef.current,
        {
          name: res.name || undefined,
          category: res.category,
          containerVolumeCl: res.containerVolumeCl,
          alcoholDegree: res.alcoholDegree,
          estimatedPriceHT: res.estimatedPriceHT,
        },
        categories,
      );
      const usual = withUsualServices(filled, slug, servingTypesRef.current, thresholdsRef.current.good, roundingRef.current);
      setValues(usual ? usual.values : filled);
      rememberUsual(usual, slug);
      pendingUsual.current = usual || servingTypesRef.current.length ? null : slug;
      setScanBanner({
        name: (res.name ?? '').trim(),
        containerCl: res.containerVolumeCl && res.containerVolumeCl > 0 ? res.containerVolumeCl : null,
        degree: typeof res.alcoholDegree === 'number' ? res.alcoholDegree : null,
      });
      setQuick(true);
      setStep('form');
      setFocusTick((n) => n + 1);
    },
    [draft, confirmOverDraft, categories, rememberUsual],
  );
  const arriveFromScanRef = useRef(arriveFromScan);
  arriveFromScanRef.current = arriveFromScan;

  /** « Reprendre la photo » from the banner: back to the camera; a purchase price already typed is kept. */
  const retakeFromForm = useCallback(() => {
    scanToken.current++;
    scanAbort.current?.abort();
    lateScan.current = null;
    setLateReading(false);
    clearUndoToast();
    // The read was this very product: its draft is not « another » product to protect.
    clearProductDraft(user?.id);
    setDraft(null);
    setDraftSaved(false);
    const keepPurchase = valuesRef.current.purchase;
    const fresh = { ...emptyValues(user), purchase: keepPurchase, supplier: valuesRef.current.supplier };
    baseline.current = fingerprint(emptyValues(user));
    prevValues.current = fresh;
    tvaTouched.current = false;
    containerTouched.current = false;
    rememberUsual(null, null);
    pendingUsual.current = null;
    categoryHint.current = {};
    setValues(fresh);
    setErrors({});
    setScanBanner(null);
    setQuick(false);
    setScanPhoto(null);
    setScanResult(null);
    setScanError(null);
    setPhotoReady(false);
    setPhase('intro');
    setStep('scan');
  }, [user, clearUndoToast, rememberUsual]);

  /** « Continuer sans attendre »: go to the form now, the read fills the empty fields when it lands. */
  const skipScan = useCallback(async () => {
    const token = scanToken.current;
    if (!(await confirmOverDraft())) return;
    if (token !== scanToken.current) return; // retaken meanwhile
    if (scanResultRef.current) {
      // The read landed while the dialog was open: use it as « Continuer » would.
      prefillFromScan(scanResultRef.current);
    } else if (scanAbort.current) {
      lateScan.current = token;
      setLateReading(true);
    }
    scanToken.current++;
    setStep('form');
  }, [confirmOverDraft, prefillFromScan]);

  const startManual = useCallback(async () => {
    if (!(await confirmOverDraft())) return;
    scanToken.current++;
    scanAbort.current?.abort();
    setStep('form');
  }, [confirmOverDraft]);

  const retake = useCallback(() => {
    scanToken.current++;
    scanAbort.current?.abort();
    lateScan.current = null;
    setScanPhoto(null);
    setScanResult(null);
    setScanError(null);
    setPhotoReady(false);
    setValues((v) => ({ ...v, photo: NO_PHOTO }));
    setPhase('intro');
  }, []);

  const discardDraft = useCallback(() => {
    const dr = draft;
    if (!dr) return;
    clearProductDraft(user?.id);
    setDraft(null);
    toast.clear();
    markUndoToast();
    toast.info('Brouillon supprimé', {
      action: {
        label: 'Annuler',
        onPress: () => {
          saveProductDraft(user?.id, dr.name, dr.form);
          setDraft(dr);
        },
      },
    });
  }, [draft, user?.id, markUndoToast]);

  const pickCalc = useCallback(
    async (c: SavedCalc) => {
      if (!(await confirmOverDraft())) return;
      categoryHint.current = { fiscalCategory: c.fiscalCategory };
      setValues((v) => applyPrefill(v, { name: c.name, fiscalCategory: c.fiscalCategory, prixHTHorsDroit: c.prixHTHorsDroit, volumeCl: c.volumeCl, degree: c.degree, prixHTAvecDroits: c.prixHTAvecDroits }, categories));
      setStep('form');
    },
    [categories, confirmOverDraft],
  );

  // ─── Photo in the form ───────────────────────────────────────────────────
  const addPhoto = useCallback(async () => {
    const choice = await dialog.show<PickSource | null>({
      title: values.photo.imageUrl ? 'Remplacer la photo' : 'Ajouter une photo',
      message: 'Une photo nette de l’étiquette, de face.',
      icon: 'camera-outline',
      actions: [
        { label: 'Prendre une photo', value: 'camera', style: 'primary' },
        { label: 'Choisir une image', value: 'library', style: 'secondary' },
        { label: 'Annuler', value: null, style: 'cancel' },
      ],
    });
    if (!choice) return;
    let img: PickedImage | null = null;
    try {
      img = await pickImage(choice);
    } catch (err: any) {
      if (err instanceof PhotoError) dialog.alert({ title: 'Accès à la photo refusé', message: err.message, tone: 'warn', icon: 'camera-outline' });
      return;
    }
    if (!img) return;
    setPhotoBusy(true);
    try {
      const p = await preparePhoto(img, { forOcr: false });
      setValues((v) => ({ ...v, photo: { imageUrl: p.imageUrl, thumbnailUrl: p.thumbnailUrl, changed: true, source: 'picked' } }));
    } catch (err: any) {
      toast.error(err?.message || 'Impossible de lire cette image.');
    } finally {
      setPhotoBusy(false);
    }
  }, [values.photo.imageUrl]);

  const removePhoto = useCallback(() => {
    const prev = valuesRef.current.photo;
    setValues((v) => ({ ...v, photo: { imageUrl: null, thumbnailUrl: null, changed: true, source: 'none' } }));
    toast.clear();
    markUndoToast();
    toast.info('Photo retirée', {
      action: { label: 'Annuler', onPress: () => setValues((v) => (v.photo.imageUrl ? v : { ...v, photo: prev })) },
    });
  }, [markUndoToast]);

  // ─── Save ────────────────────────────────────────────────────────────────
  const quickRef = useRef(quick);
  quickRef.current = quick;
  const scrollToField = useCallback((key: FieldKey | null) => {
    if (!key) return;
    const section: SectionKey = quickRef.current && QUICK_DETAILS.has(key) ? 'details' : SECTION_OF[key];
    const y = sectionY.current[section] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, []);

  const save = useCallback(async () => {
    if (saving.current || photoBusy) return;
    const v = valuesRef.current;
    const dv = derive(v, servingTypes, rates, seuilSS);
    const check = validate(v, dv, servingTypes);
    if (check.first) {
      setErrors(check.fields);
      haptics.warning();
      scrollToField(check.first);
      // One fresh toast (never queued behind a stale one): the field's own
      // message, or « 3 champs à corriger » when there are several.
      toast.clear();
      if (check.message) {
        toast.error(check.message);
        validationToast.current = true;
      }
      return;
    }
    saving.current = true;
    captureEntry();
    clearUndoToast();
    // Selling below cost is allowed, but never silently (a typo in a price).
    const losses = lossServices(v, dv, servingTypes);
    if (losses.length) {
      const list = losses.map((l) => `« ${serviceName(l.key, v, servingTypes)} » (marge ${formatMargin(l.result.marginPercent)})`).join(', ');
      haptics.warning();
      const ok = await dialog.show<boolean>({
        title: 'Prix inférieur au coût',
        message: `${list} ${losses.length > 1 ? 'se vendent' : 'se vend'} à perte. Enregistrer quand même ?`,
        icon: 'warning-outline',
        tone: 'warn',
        // No cancel action: the scrim and Android back resolve undefined, i.e. « Corriger ».
        actions: [
          { label: 'Corriger le prix', value: false, style: 'primary' },
          { label: 'Enregistrer quand même', value: true, style: 'secondary' },
        ],
      });
      if (!ok) {
        saving.current = false;
        setValues((cur) => (cur.services[losses[0].key] ? { ...cur, selected: losses[0].key } : cur));
        scrollToField('services');
        return;
      }
    }
    setErrors({});
    setSaveState('saving');
    const started = Date.now();
    try {
      const id = productId ?? createdId.current;
      const body = buildPayload(v, dv, servingTypes, { editing: !!id });
      const saved = id ? await productService.updateProduct(id, body) : await productService.createProduct(body);
      if (!id) createdId.current = saved.id; // a retry updates instead of creating a duplicate (RC9)
      await saveFormPrefs(saved.id, prefsFromValues(v));
      if (!editing) clearProductDraft(user?.id);
      productService.refreshProductCaches(queryClient, saved);
      baseline.current = fingerprint(v);
      if (!mounted.current) {
        // The screen went away meanwhile (sign-out, deep link…): never navigate
        // from it; the caches are fresh and the toast still confirms the save.
        toast.success(`${saved.name} enregistré`);
        return;
      }
      const elapsed = Date.now() - started;
      if (elapsed < 400) await wait(400 - elapsed);
      setSaveState('success');
      haptics.success();
      await wait(520);
      allowLeave.current = true;
      afterProductSaved(navigation as any, saved.id);
      toast.success(`${saved.name} enregistré`);
    } catch (err) {
      const info = describeSaveError(err, 'save');
      saving.current = false;
      if (!mounted.current) return;
      setSaveState('idle');
      setErrors(info.fields);
      haptics.warning();
      const firstField = (Object.keys(info.fields) as FieldKey[])[0] ?? null;
      scrollToField(firstField);
      dialog.alert({
        title: info.title,
        message: info.message,
        tone: info.offline ? 'warn' : 'bad',
        icon: info.offline ? 'cloud-offline-outline' : 'alert-circle-outline',
      });
    }
  }, [photoBusy, servingTypes, rates, seuilSS, productId, editing, user?.id, queryClient, navigation, scrollToField, clearUndoToast, captureEntry]);

  /**
   * « Supprimer ce produit »: the same undo as the list and the detail (lot 2
   * n° 11, polish n° 1), no « définitive » dialog. The product leaves the lists
   * at once, the form closes (afterProductDeleted) and the toast « Aperol
   * supprimé · Annuler ⑥ » holds the DELETE until its countdown ends; « Annuler »
   * puts the product back with no request. Unsaved edits go with it (leaving
   * without saving, like « Quitter sans enregistrer »).
   */
  const remove = useCallback(() => {
    if (!productId || deleting || saving.current) return;
    // The name the lists know (an unsaved rename is not the product's name yet).
    const name = productQ.data?.name?.trim() || valuesRef.current.name.trim() || 'Ce produit';
    const id = productId;
    // A form toast (« Photo retirée · Annuler »…) is replaced by the delete's own: the unmount must not clear that one.
    undoToast.current = false;
    const ok = deleteWithUndo(queryClient, { id, name }, { onDeleted: () => deleteFormPrefs(id) });
    if (!ok) return; // offline: refused with its sentence, the form stays
    setDeleting(true);
    allowLeave.current = true;
    afterProductDeleted(navigation as any);
  }, [productId, deleting, productQ.data?.name, queryClient, navigation]);

  // ─── Render: scan step ───────────────────────────────────────────────────
  if (step === 'scan') {
    return (
      <>
        <ScanStep
          phase={phase}
          photoUri={scanPhoto}
          photoReady={photoReady}
          error={scanError}
          categories={categories}
          quota={quotaQ.data ?? null}
          draft={draft}
          savedCalcs={savedCalcs.length}
          onPick={onPick}
          onManual={startManual}
          onContinue={continueFromScan}
          onSkip={skipScan}
          onRetake={retake}
          onResumeDraft={resumeDraft}
          onDiscardDraft={discardDraft}
          onOpenCalcs={() => setCalcsOpen(true)}
        />
        <SavedCalcsSheet visible={calcsOpen} calcs={savedCalcs} onPick={pickCalc} onClose={() => setCalcsOpen(false)} />
      </>
    );
  }

  const title = editing ? 'Modifier le produit' : 'Nouveau produit';

  // ─── Render: edit loading / error ────────────────────────────────────────
  if (editing && !hydrated) {
    const status = (productQ.error as any)?.response?.status;
    const offline = !isOnline() || productQ.fetchStatus === 'paused';
    const failed = productQ.isError || offline;
    return (
      <Screen
        header={<NavBar title={title} />}
        // Same bar as the form, disabled: nothing pops in when the product arrives.
        stickyFooter={
          failed ? undefined : (
            <StickyActionBar summary="Chargement…" primary={{ title: 'Enregistrer', icon: 'checkmark-circle', disabled: true }} />
          )
        }
      >
        {failed ? (
          <EmptyState
            variant={offline ? 'offline' : 'default'}
            icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
            title={offline ? 'Hors ligne' : status === 404 ? 'Produit introuvable' : 'Chargement impossible'}
            text={
              offline
                ? 'La fiche s’affichera dès le retour du réseau : modifier un produit demande une connexion.'
                : status === 404
                  ? 'Ce produit n’existe plus : il a peut-être été supprimé depuis un autre appareil.'
                  : ((productQ.error as any)?.response?.data?.error as string) || 'Le produit n’a pas pu être chargé. Vérifiez votre connexion, puis réessayez.'
            }
            primary={status === 404 ? { label: 'Retour aux produits', icon: 'arrow-back', onPress: () => afterProductDeleted(navigation as any) } : { label: 'Réessayer', icon: 'refresh', onPress: () => productQ.refetch() }}
            style={styles.emptyState}
          />
        ) : (
          <FormSkeleton />
        )}
      </Screen>
    );
  }

  // ─── Render: form ────────────────────────────────────────────────────────
  const sum = summaryOf(values, d, servingTypes);
  const zone = sum.margin !== null ? getMarginZone(sum.margin, thresholds) : undefined;
  const zoneColor = zone ? marginColors[zone].fg : palette.text3;
  const meta = pricingMeta(values, d, servingTypes);
  // Several services: the weakest one, said as such. Narrow phones keep both
  // sides of the bar on one line (« min. » once on the left is enough).
  const marginWord = !sum.isMin ? 'marge' : winW < 340 ? 'min.' : 'marge min.';
  const coeffWord = sum.isMin && winW >= 380 ? 'Coeff min.' : 'Coeff';

  const footer = (
    <StickyActionBar
      summary={
        sum.count === 0 ? (
          'Aucun service tarifé'
        ) : sum.margin === null ? (
          `${plural(sum.count, 'service')} · ${sum.costKnown ? 'prix à compléter' : d.needsDegree ? 'degré à compléter' : 'prix d’achat à compléter'}`
        ) : (
          <Text
            style={[styles.summary, { color: zoneColor }]}
            numberOfLines={1}
            testID="sticky-summary"
            accessibilityLabel={`${plural(sum.count, 'service')}, marge ${sum.isMin ? 'minimale ' : ''}${formatMargin(sum.margin)}${zone ? `, ${marginColors[zone].label}` : ''}`}
          >
            {plural(sum.count, 'service')} · {marginWord}{' '}
            <AnimatedNumber
              value={sum.margin}
              from={null}
              instant={live}
              format={(n) => formatMargin(n)}
              style={[styles.summary, { color: zoneColor }]}
            />
          </Text>
        )
      }
      summaryZone={zone}
      summaryRight={
        categoriesQ.isOffline ? (
          <View style={styles.offline} accessibilityLabel="Hors ligne : l’enregistrement attendra le réseau">
            <Ionicons name="cloud-offline-outline" size={15} color={palette.text3} />
            <Text style={styles.offlineText}>Hors ligne</Text>
          </View>
        ) : sum.coeff ? (
          // Same service as the margin (the weakest margin is the lowest coefficient).
          `${coeffWord} ${formatCoeff(sum.coeff)}`
        ) : undefined
      }
      primary={{
        title: 'Enregistrer',
        icon: 'checkmark-circle',
        onPress: save,
        loading: saveState === 'saving',
        success: saveState === 'success',
        disabled: deleting || photoBusy,
        testID: 'product-save',
      }}
    />
  );

  // The form's blocks: in this order normally; after a scan, the purchase price and the prices first (mockup 4).
  const identityBlock = (first: boolean) => (
    <FormSection title="Produit" first={first}>
      <PhotoCard photo={values.photo} busy={photoBusy} error={errors.photo} onAdd={addPhoto} onRemove={removePhoto} />
      <TextField
        label="Nom du produit"
        value={values.name}
        onChangeText={(name) => patch({ name })}
        placeholder="Hendrick’s Gin"
        error={errors.name}
        returnKeyType="done"
        maxLength={200}
        containerStyle={styles.field}
        testID="field-name"
      />
      <View style={styles.field}>
        <FieldLabel label="Catégorie" error={!!errors.category} />
        {categories.length ? (
          <ChipRow
            items={categories.map((c) => ({ key: c.id, label: c.name, icon: categoryIcon(c.slug) }))}
            selectedKey={values.categoryId}
            onSelect={(categoryId) => {
              // « Prix hors droits » not on yet: its fiscal category follows the product category.
              const slug = categories.find((c) => c.id === categoryId)?.slug;
              patch(values.horsDroits ? { categoryId } : { categoryId, fiscalSlug: defaultFiscalSlug(slug) });
            }}
            accessibilityLabel="Catégorie"
          />
        ) : categoriesQ.isError ? (
          <View style={styles.inlineRetry}>
            <Text style={styles.inlineRetryText}>Les catégories n’ont pas pu être chargées.</Text>
            <Button title="Réessayer" variant="tonal" size="sm" icon="refresh" onPress={() => categoriesQ.refetch()} />
          </View>
        ) : (
          <Text style={styles.inlineRetryText}>Chargement des catégories…</Text>
        )}
        <FieldError message={errors.category} />
      </View>
      <TextField
        label="Fournisseur"
        meta="facultatif"
        value={values.supplier}
        onChangeText={(supplier) => patch({ supplier })}
        placeholder="France Boissons"
        error={errors.supplier}
        maxLength={200}
        containerStyle={styles.field}
        testID="field-supplier"
      />
    </FormSection>
  );
  const purchaseBlock = (part: 'all' | 'purchase' | 'rest') => (
    <PurchaseSection
      values={values}
      patch={patch}
      errors={errors}
      containers={containersQ.data}
      rates={rates}
      duties={d.duties}
      autoEntrepreneur={!!user?.isAutoEntrepreneur}
      categorySlug={categorySlug}
      onOpenFiscal={() => setFiscalOpen(true)}
      part={part}
      purchaseRef={part === 'purchase' ? purchaseRef : undefined}
    />
  );
  const pricingBlock = (
    <PricingSection
      values={values}
      setValues={setValues}
      servingTypes={servingTypes}
      loading={servingTypesQ.isLoading}
      loadError={servingTypesQ.isError && !servingTypes.length}
      onUndoToast={markUndoToast}
      onRetry={() => servingTypesQ.refetch()}
      derived={d}
      thresholds={thresholds}
      error={errors.services}
      onLiveChange={setLive}
      quick={quick}
    />
  );
  // « habituel en Spiritueux » while the usual service the scan chose for THIS category is the one priced
  // (its price may be the user's; a changed « à l’unité » dose is no longer the usual one).
  const usualKeysNow = usualKeys.current;
  const usualOn =
    !!usualKeysNow &&
    usualKeysNow.length === Object.keys(values.services).length &&
    usualKeysNow.every((k) => !!values.services[k]) &&
    (!usualKeysNow.includes(CUSTOM_DOSE) || values.customDoseCl === usualFor.current?.customDoseCl);
  const categoryLabel = categories.find((c) => c.id === values.categoryId)?.name;
  const usualMeta = usualOn && categoryLabel && !!categorySlug && usualFor.current?.slug === categorySlug ? `habituel en ${categoryLabel}` : null;

  return (
    <>
      <Screen
        header={
          <NavBar
            title={title}
            trailing={
              lateReading ? (
                <Badge variant="neutral" icon="scan-outline" label="Lecture…" size="sm" accessibilityLabel="Lecture de l’étiquette en cours" />
              ) : !editing && draftSaved ? (
                <Badge variant="neutral" icon="checkmark-circle" label="Brouillon" size="sm" />
              ) : undefined
            }
          />
        }
        stickyFooter={footer}
        scrollRef={scrollRef}
        testID="product-form"
      >
        {quick ? (
          <>
            {scanBanner ? (
              <FadeIn index={0}>
                <ScanBanner info={scanBanner} onRetake={retakeFromForm} onDismiss={() => setScanBanner(null)} />
              </FadeIn>
            ) : null}
            <FadeIn index={1} onLayout={(e) => (sectionY.current.purchase = e.nativeEvent.layout.y)}>
              {purchaseBlock('purchase')}
            </FadeIn>
            <FadeIn index={2} onLayout={(e) => (sectionY.current.pricing = e.nativeEvent.layout.y + 28)}>
              <FormSection title="Services & prix" meta={usualMeta ?? meta}>
                {pricingBlock}
              </FormSection>
            </FadeIn>
            <FadeIn index={3} onLayout={(e) => (sectionY.current.identity = e.nativeEvent.layout.y + 28)}>
              {identityBlock(false)}
            </FadeIn>
            <FadeIn index={4} onLayout={(e) => (sectionY.current.details = e.nativeEvent.layout.y + 28)}>
              <FormSection title="Contenant & degré">{purchaseBlock('rest')}</FormSection>
            </FadeIn>
          </>
        ) : (
          <>
            <FadeIn index={0} onLayout={(e) => (sectionY.current.identity = e.nativeEvent.layout.y)}>
              {identityBlock(true)}
            </FadeIn>

            <FadeIn index={1} onLayout={(e) => (sectionY.current.purchase = e.nativeEvent.layout.y + 28)}>
              <FormSection title="Contenant & achat">{purchaseBlock('all')}</FormSection>
            </FadeIn>

            <FadeIn index={2} onLayout={(e) => (sectionY.current.pricing = e.nativeEvent.layout.y + 28)}>
              <FormSection title="Services & prix" meta={meta}>
                {pricingBlock}
              </FormSection>
            </FadeIn>
          </>
        )}

        {editing ? (
          <FadeIn index={3}>
            <View style={styles.dangerZone}>
              <Button
                title="Supprimer ce produit"
                variant="destructive"
                icon="trash-outline"
                onPress={remove}
                disabled={saveState !== 'idle' || deleting}
                testID="product-delete"
              />
            </View>
          </FadeIn>
        ) : null}
      </Screen>
      <FiscalCategorySheet
        visible={fiscalOpen}
        value={values.fiscalSlug}
        onSelect={(r) => patch({ fiscalSlug: r.slug })}
        onClose={() => setFiscalOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 16 },
  summary: { ...type.footnoteStrong, fontFamily: fontFamily.semibold },
  inlineRetry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  inlineRetryText: { ...type.footnote, color: palette.text3, flexShrink: 1 },
  dangerZone: { marginTop: 28, alignItems: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  offlineText: { ...type.footnoteStrong, color: palette.text3 },
  emptyState: { marginTop: 40 },
});
