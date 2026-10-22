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
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { formatCoeff, formatPercent, plural } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';
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
import { PhotoCard } from './form/PhotoCard';
import { PurchaseSection } from './form/PurchaseSection';
import { PricingSection, pricingMeta } from './form/PricingSection';
import { FormSkeleton } from './form/FormSkeleton';
import { FieldError, FieldLabel, FormSection } from './form/FieldBits';
import { SAVED_CALCS_KEY, SavedCalc, SavedCalcsSheet, parseSavedCalcs } from './form/SavedCalcsSheet';
import { FieldErrors, FieldKey, describeSaveError } from './form/errors';
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
  prefsFromValues,
  resolveCategoryId,
  summaryOf,
  validate,
  valuesFromProduct,
} from './form/model';
import { PhotoError, PickSource, PickedImage, pickImage, preparePhoto, recoverPendingImage } from './form/photo';
import { priceFromMode, round2, suggestedPrice, defaultFiscalSlug } from './form/pricing';

type Props = NativeStackScreenProps<any, 'ProductForm'>;
type SectionKey = 'identity' | 'purchase' | 'pricing';

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
  ['tvaRate', 'tva'],
  ['services', 'services'],
  ['customDoseCl', 'services'],
  ['photo', 'photo'],
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A draft is kept once there is real work in it (a photo alone is not worth one). */
const draftWorthy = (v: FormValues) => !!v.name.trim() || v.purchase !== null || Object.keys(v.services).length > 0;

export function ProductFormScreen({ route, navigation }: Props) {
  const params = (route.params ?? {}) as ProductFormParams;
  const productId = params.productId;
  const editing = !!productId;
  const prefill: ProductPrefill | undefined = params.scanData;
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const thresholds = useMarginThresholds();
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
  const [scanError, setScanError] = useState<ScanStepProps['error']>(null);
  const [draft, setDraft] = useState<{ name: string; savedAt: number; form: FormValues } | null>(null);
  const [savedCalcs, setSavedCalcs] = useState<SavedCalc[]>([]);
  const [calcsOpen, setCalcsOpen] = useState(false);

  const scanToken = useRef(0);
  const saving = useRef(false);
  const createdId = useRef<string | null>(null);
  const allowLeave = useRef(false);
  const baseline = useRef<string>(fingerprint(values));
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const prevValues = useRef(values);
  const categoryHint = useRef<{ categoryId?: string | null; category?: string | null; fiscalCategory?: string | null }>(
    prefill ? { categoryId: prefill.categoryId, category: prefill.category, fiscalCategory: prefill.fiscalCategory } : {},
  );
  const tvaTouched = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<SectionKey, number>>({ identity: 0, purchase: 0, pricing: 0 });

  const patch = useCallback((p: Partial<FormValues>) => {
    if ('tvaRate' in p) tvaTouched.current = true;
    setValues((v) => ({ ...v, ...p }));
  }, []);

  const quotaQ = useQuery({
    queryKey: ['scanQuota'],
    queryFn: scanService.getScanQuota,
    enabled: step === 'scan' && !editing,
    staleTime: 60_000,
    retry: false,
  });

  // The prefill is now in the form: drop it from the route so the web URL stays
  // clean (« /produits/nouveau » instead of « ?scanData=[object Object] »).
  useEffect(() => {
    if (prefill) (navigation as any).setParams({ scanData: undefined });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Category of a new product: the prefill / scan hint, else the first category.
  useEffect(() => {
    if (editing || !categories.length) return;
    if (values.categoryId && categories.some((c) => c.id === values.categoryId)) return;
    const id = resolveCategoryId(categories, categoryHint.current) ?? categories[0].id;
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
      // The validation toast is stale once everything it pointed at is fixed.
      if (!Object.keys(next).length) toast.clear();
    }
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived numbers ─────────────────────────────────────────────────────
  const d = useMemo(() => derive(values, servingTypes, rates, seuilSS), [values, servingTypes, rates, seuilSS]);

  // Suggested prices follow the purchase price; Marge / Coeff services keep their value.
  const costKey = `${d.purchaseHT}|${d.containerCl}|${values.tvaRate}|${values.customDoseCl}|${servingTypes.length}|${thresholds.good}`;
  useEffect(() => {
    if (!hydrated) return;
    setValues((v) => {
      let changed = false;
      const services = { ...v.services };
      for (const [k, s] of Object.entries(v.services)) {
        const cost = d.costOf(k);
        let price = s.price;
        if (!s.touched) price = suggestedPrice(cost, v.tvaRate, thresholds.good);
        else if (s.mode !== 'price' && s.modeValue !== null && cost > 0) price = round2(priceFromMode(s.mode, s.modeValue, cost, v.tvaRate));
        if (price > 0 && Math.abs(price - s.price) > 0.001) {
          services[k] = { ...s, price };
          changed = true;
        }
      }
      return changed ? { ...v, services } : v;
    });
  }, [costKey, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e: any) => {
        if (allowLeave.current) return;
        const dirty = fingerprint(valuesRef.current) !== baseline.current;
        if (!dirty || step !== 'form') return;
        if (!editing) {
          // The draft keeps the work: save it now and say so.
          if (!draftWorthy(valuesRef.current)) return;
          saveProductDraft(user?.id, valuesRef.current.name.trim(), valuesRef.current);
          toast.info('Brouillon conservé');
          return;
        }
        e.preventDefault();
        dialog
          .confirm({
            title: 'Quitter sans enregistrer ?',
            message: 'Vos modifications de ce produit seront perdues.',
            confirmLabel: 'Quitter sans enregistrer',
            cancelLabel: 'Continuer la modification',
            destructive: true,
            icon: 'exit-outline',
          })
          .then((ok) => {
            if (ok) {
              allowLeave.current = true;
              navigation.dispatch(e.data.action);
            }
          });
      }),
    [navigation, step, editing, user?.id],
  );

  // ─── Scan ────────────────────────────────────────────────────────────────
  const runScan = useCallback(
    async (img: PickedImage) => {
      const token = ++scanToken.current;
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
      try {
        const res = await scanService.scanBottle(prepared.ocrBase64 as string);
        if (token !== scanToken.current) return;
        setScanResult(res);
        setPhase('result');
        haptics.success();
        queryClient.invalidateQueries({ queryKey: ['scanQuota'] });
      } catch (err) {
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

  const continueFromScan = useCallback(() => {
    scanToken.current++;
    const res = scanResult;
    if (res) {
      categoryHint.current = { category: res.category };
      setValues((v) => {
        const next = applyPrefill(v, {
          name: res.name || undefined,
          category: res.category,
          containerVolumeCl: res.containerVolumeCl,
          alcoholDegree: res.alcoholDegree,
          estimatedPriceHT: res.estimatedPriceHT,
        }, categories);
        return next;
      });
    }
    setStep('form');
  }, [scanResult, categories]);

  const retake = useCallback(() => {
    scanToken.current++;
    setScanPhoto(null);
    setScanResult(null);
    setScanError(null);
    setPhotoReady(false);
    setValues((v) => ({ ...v, photo: NO_PHOTO }));
    setPhase('intro');
  }, []);

  const resumeDraft = useCallback(() => {
    if (!draft) return;
    const v = { ...emptyValues(user), ...draft.form, photo: draft.form.photo ?? NO_PHOTO };
    tvaTouched.current = true;
    setValues(v);
    setDraftSaved(true);
    setStep('form');
  }, [draft, user]);

  const discardDraft = useCallback(() => {
    clearProductDraft(user?.id);
    setDraft(null);
    toast.info('Brouillon supprimé');
  }, [user?.id]);

  const pickCalc = useCallback(
    (c: SavedCalc) => {
      categoryHint.current = { fiscalCategory: c.fiscalCategory };
      setValues((v) => applyPrefill(v, { name: c.name, fiscalCategory: c.fiscalCategory, prixHTHorsDroit: c.prixHTHorsDroit, volumeCl: c.volumeCl, degree: c.degree, prixHTAvecDroits: c.prixHTAvecDroits }, categories));
      setStep('form');
    },
    [categories],
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
    setValues((v) => ({ ...v, photo: { imageUrl: null, thumbnailUrl: null, changed: true, source: 'none' } }));
  }, []);

  // ─── Save ────────────────────────────────────────────────────────────────
  const scrollToField = useCallback((key: FieldKey | null) => {
    if (!key) return;
    const y = sectionY.current[SECTION_OF[key]] ?? 0;
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
      if (check.message) toast.error(check.message);
      return;
    }
    saving.current = true;
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
  }, [photoBusy, servingTypes, rates, seuilSS, productId, editing, user?.id, queryClient, navigation, scrollToField]);

  const remove = useCallback(async () => {
    if (!productId || deleting) return;
    const v = valuesRef.current;
    const n = Object.keys(v.services).filter((k) => k !== '__dose').length;
    const name = v.name.trim() || 'Ce produit';
    const ok = await dialog.confirm({
      title: 'Supprimer ce produit ?',
      message:
        n > 0
          ? `${name} et ${n > 1 ? `ses ${n} services seront supprimés` : 'son service seront supprimés'}. Cette action est définitive.`
          : `${name} sera supprimé. Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await productService.deleteProduct(productId);
      productService.forgetProduct(queryClient, productId);
      deleteFormPrefs(productId);
      allowLeave.current = true;
      afterProductDeleted(navigation as any);
      toast.success(`${name} supprimé`);
    } catch (err) {
      setDeleting(false);
      const info = describeSaveError(err, 'delete');
      dialog.alert({ title: info.title, message: info.message, tone: info.offline ? 'warn' : 'bad', icon: info.offline ? 'cloud-offline-outline' : 'alert-circle-outline' });
    }
  }, [productId, deleting, queryClient, navigation]);

  // ─── Render: scan step ───────────────────────────────────────────────────
  if (step === 'scan') {
    return (
      <>
        <ScanStep
          phase={phase}
          photoUri={scanPhoto}
          photoReady={photoReady}
          result={scanResult}
          error={scanError}
          categories={categories}
          quota={quotaQ.data ?? null}
          draft={draft}
          savedCalcs={savedCalcs.length}
          onPick={onPick}
          onManual={() => {
            scanToken.current++;
            setStep('form');
          }}
          onContinue={continueFromScan}
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
    return (
      <Screen header={<NavBar title={title} />}>
        {productQ.isError || offline ? (
          <EmptyState
            variant={offline ? 'offline' : 'default'}
            icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
            title={offline ? 'Hors ligne' : status === 404 ? 'Produit introuvable' : 'Chargement impossible'}
            text={
              offline
                ? 'La fiche s’affichera dès le retour du réseau : modifier un produit demande une connexion.'
                : status === 404
                  ? 'Ce produit n’existe plus : il a peut-être été supprimé depuis un autre appareil.'
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

  const footer = (
    <StickyActionBar
      summary={
        sum.count === 0 ? (
          'Aucun service tarifé'
        ) : sum.margin === null ? (
          `${plural(sum.count, 'service')} · prix à compléter`
        ) : (
          <Text style={[styles.summary, { color: zoneColor }]} numberOfLines={1} testID="sticky-summary">
            {plural(sum.count, 'service')} · marge{' '}
            <AnimatedNumber
              value={sum.margin}
              from={null}
              instant={live}
              format={(n) => formatPercent(n)}
              style={[styles.summary, { color: zoneColor }]}
            />
          </Text>
        )
      }
      summaryZone={zone}
      summaryRight={sum.coeff ? `Coeff ${formatCoeff(sum.coeff)}` : undefined}
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

  return (
    <>
      <Screen
        header={
          <NavBar
            title={title}
            trailing={!editing && draftSaved ? <Badge variant="neutral" icon="checkmark-circle" label="Brouillon" size="sm" /> : undefined}
          />
        }
        stickyFooter={footer}
        scrollRef={scrollRef}
        testID="product-form"
      >
        <FadeIn index={0} onLayout={(e) => (sectionY.current.identity = e.nativeEvent.layout.y)}>
          <FormSection title="Produit" first>
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
                  onSelect={(categoryId) => patch({ categoryId })}
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
        </FadeIn>

        <FadeIn index={1} onLayout={(e) => (sectionY.current.purchase = e.nativeEvent.layout.y + 28)}>
          <FormSection title="Contenant & achat">
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
            />
          </FormSection>
        </FadeIn>

        <FadeIn index={2} onLayout={(e) => (sectionY.current.pricing = e.nativeEvent.layout.y + 28)}>
          <FormSection title="Services & prix" meta={meta}>
            <PricingSection
              values={values}
              setValues={setValues}
              servingTypes={servingTypes}
              loading={servingTypesQ.isLoading}
              derived={d}
              thresholds={thresholds}
              error={errors.services}
              onLiveChange={setLive}
            />
          </FormSection>
        </FadeIn>

        {editing ? (
          <FadeIn index={3}>
            <View style={styles.dangerZone}>
              <Button
                title="Supprimer ce produit"
                variant="destructive"
                icon="trash-outline"
                onPress={remove}
                loading={deleting}
                disabled={saveState !== 'idle'}
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
  emptyState: { marginTop: 40 },
});
