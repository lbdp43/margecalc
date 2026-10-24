/**
 * « Scanner une facture » (root stack, no tab bar). Admins reach it from the
 * Scanner menu (`openInvoiceScan`).
 *
 *   capture ──pick──▶ scanning (resize ~2 000 px → upload → free OCR)
 *      ▲                 │ ok                        │ 422 / 429 / offline / timeout
 *      │                 ▼                           ▼
 *      └──── review (edit, tick, add, link) ──Importer──▶ results ── « Corriger » ─▶ review
 *                                                      ├─ « Ajuster » ─▶ Sous l’objectif (these products)
 *                                                      └─ « Mes produits » ─▶ ProductList
 *
 * Lot 2: as soon as the lines are read, POST /api/products/import/preview
 * says what each one would do (exact name, a label remembered for this
 * supplier, a look-alike to confirm, or a new product); it runs again
 * (debounced) when a line is edited. A look-alike is never linked silently:
 * the line sends `productId` once the user taps « Lier » (the backend then
 * remembers it for the supplier) or `createNew` for « Créer un nouveau »,
 * and « Importer » asks about the look-alikes left undecided.
 *
 * Every number goes through utils/format.ts. The selling price is never sent
 * as 0: left empty, the backend derives it (×4) and the screen shows it as
 * « calculé ×4 » beforehand. A line that matches a product already tracked
 * only updates its purchase price: the review says so before the import.
 *
 * Leaving is guarded while there is something to lose:
 *  - review with lines: NavBar / Android / browser back ask first; a browser
 *    back that is cancelled puts this screen's history entry back, and a
 *    reload or tab close gets the browser's own « leave the page? » prompt;
 *  - import in flight: leaving is blocked (the request would still create
 *    the products), with a short « Import en cours » toast.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Category, ProductWithMargin } from '@margebar/shared';
import { SwapFade, dialog, toast } from '../../components/ui';
import { haptics } from '../../theme/haptics';
import { NBSP, plural } from '../../utils/format';
import { goToProduct, goToProductList, openProductForm, openUnderTarget } from '../../navigation/routes';
import { useAuthStore } from '../../store/auth.store';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as categoryService from '../../services/category.service';
import * as productService from '../../services/product.service';
import { getScanQuota, type ScanQuota } from '../../services/scan.service';
import { OfflineError, isOnline } from '../../services/offline';
import {
  describeImportError,
  describeInvoiceScanError,
  importInvoiceLines,
  isCancelled,
  previewInvoiceLines,
  scanInvoice,
  type InvoiceScanErrorInfo,
} from '../../services/invoice.service';
import { CaptureStep } from '../invoice/CaptureStep';
import { ScanningStep, type ScanPhase } from '../invoice/ScanningStep';
import { ErrorStep } from '../invoice/ErrorStep';
import { ReviewStep } from '../invoice/ReviewStep';
import { LineEditSheet, SupplierSheet } from '../invoice/LineEditSheet';
import { ProductPickerSheet, type PickedProduct } from '../invoice/ProductPickerSheet';
import type { MatchStatus } from '../invoice/ReviewStep';
import { ResultsStep, type ImportSummary } from '../invoice/ResultsStep';
import {
  PhotoError,
  pickInvoiceImage,
  prepareInvoicePhoto,
  recoverPendingInvoiceImage,
  type PickSource,
  type PickedImage,
  type PreparedInvoicePhoto,
} from '../invoice/photo';
import {
  containerDiffers,
  containerOf,
  emptyLine,
  errorField,
  formatInvoiceDate,
  AUTO_LINK,
  hasErrors,
  indexProducts,
  linesFromScan,
  pairResults,
  previewKeyOf,
  previewLine,
  priceDecimals,
  resolveTarget,
  toImportLine,
  validateLine,
  type InvoiceLine,
  type LinePreview,
  type LineTarget,
  type PricingContext,
  type StoredPreviewLine,
} from '../invoice/model';
import { formatEuro, formatVolumeCl } from '../../utils/format';

type Props = NativeStackScreenProps<any, 'InvoiceScan'>;
type Step = 'capture' | 'scanning' | 'error' | 'review' | 'results';

const MIN_BUSY_MS = 400;
/** A line edit asks the preview again after this pause (the first preview of a read runs at once). */
const PREVIEW_DEBOUNCE_MS = 350;

interface PreviewState {
  /**
   * The preview of each TICKED line, by line id (a failed run keeps the last answer). Only the ticked lines
   * are sent: the preview reads them in order (« same product as line N », the purchase price before), so an
   * unticked line must not take part; it simply has no preview.
   */
  byId: Map<string, StoredPreviewLine>;
  /** The matching fields each line had when the preview answered (`lineKeyOf`). */
  lineKeys: Map<string, string>;
  /** The ids of the lines it answered for (the ticked ones then), and what each one's match depended on. */
  sent: Set<string>;
  matchKeys: Map<string, string>;
  /** `previewKeyOf` of the lines it answered for; null before the first answer. */
  key: string | null;
}
const NO_PREVIEW: PreviewState = { byId: new Map(), lineKeys: new Map(), sent: new Set(), matchKeys: new Map(), key: null };

/** What a line's own match depends on (name, category, container, prices, supplier). */
const lineKeyOf = (l: InvoiceLine, supplier: string) =>
  JSON.stringify([supplier.trim(), l.name.trim(), l.categoryId ?? l.categorySlug, l.containerVolumeCl, l.purchasePriceHT, l.sellingPriceTTC]);
/** What the lines AFTER this one may depend on: a product it creates, under this name and size (not its prices). */
const matchKeyOf = (l: InvoiceLine, supplier: string) => JSON.stringify([supplier.trim(), l.name.trim(), l.categoryId ?? l.categorySlug, l.containerVolumeCl]);

const quoteFr = (s: string) => `«${NBSP}${s}${NBSP}»`;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const isWeb = Platform.OS === 'web';
const web = globalThis as any;

/** Everything an import can change: list, detail, services (margins), price history, admin list. */
function invalidateProducts(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['product'] });
  qc.invalidateQueries({ queryKey: ['productServings'] });
  qc.invalidateQueries({ queryKey: ['priceHistory'] });
  qc.invalidateQueries({ queryKey: ['admin', 'products'] });
}

const nextFrame = (cb: () => void) => {
  const raf = web.requestAnimationFrame as ((f: () => void) => void) | undefined;
  if (raf) raf(() => setTimeout(cb, 0));
  else setTimeout(cb, 16);
};

export function InvoiceScanScreen({ navigation }: Props) {
  // Route helpers take a loose navigation type (they work from any navigator).
  const nav = navigation as any;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const ctx: PricingContext = useMemo(
    () => ({
      tvaRate: user?.isAutoEntrepreneur ? 0 : typeof user?.defaultTvaRate === 'number' ? user.defaultTvaRate : 0.2,
      defaultContainerCl: user?.defaultContainerVolumeCl && user.defaultContainerVolumeCl > 0 ? user.defaultContainerVolumeCl : 70,
    }),
    [user?.isAutoEntrepreneur, user?.defaultTvaRate, user?.defaultContainerVolumeCl],
  );

  const categoriesQ = useOfflineQuery<Category[]>(['categories'], categoryService.getCategories);
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  // The user's products: the links of the review, and the exact-name fallback without the preview.
  const productsQ = useOfflineQuery<ProductWithMargin[]>(['products'], () => productService.getProducts(), { refetchOnMount: 'always' });
  const catalog = useMemo(() => indexProducts(productsQ.data), [productsQ.data]);
  const quotaQ = useQuery<ScanQuota>({ queryKey: ['scanQuota'], queryFn: getScanQuota, staleTime: 60_000, retry: 0 });

  const [step, setStep] = useState<Step>('capture');
  const [phase, setPhase] = useState<ScanPhase>('preparing');
  const [upload, setUpload] = useState(0);
  const [photo, setPhoto] = useState<PreparedInvoicePhoto | null>(null);
  const [scanError, setScanError] = useState<InvoiceScanErrorInfo | null>(null);
  const [picking, setPicking] = useState(false);

  const [supplier, setSupplier] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [correcting, setCorrecting] = useState(false);

  const [editing, setEditing] = useState<{ id: string; isNew: boolean; showErrors: boolean; draft?: InvoiceLine } | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  /** Line whose « Lier à un produit » sheet is open. */
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewState>(NO_PREVIEW);
  const previewRef = useRef<PreviewState>(NO_PREVIEW);
  const [matchStatus, setMatchStatus] = useState<MatchStatus>('idle');
  const previewRun = useRef(0);
  const previewInflight = useRef<{ key: string; promise: Promise<PreviewState | null> } | null>(null);

  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  /** A question of « Importer » is open (look-alikes, sizes): a back press is refused, the dialog is the answer. */
  const askingRef = useRef(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const lastPickRef = useRef(0);
  useEffect(
    () => () => {
      mounted.current = false;
      abortRef.current?.abort();
    },
    [],
  );

  const dateLabel = formatInvoiceDate(invoiceDate);

  // ─── Name matching (POST /api/products/import/preview) ──────────────────

  const resetPreview = useCallback(() => {
    previewRun.current++;
    previewInflight.current = null;
    previewRef.current = NO_PREVIEW;
    setPreview(NO_PREVIEW);
    setMatchStatus('idle');
  }, []);

  /** Asks the server what /import would do with the ticked lines. Resolves null when it failed or was superseded. */
  const runPreview = useCallback(
    (ls: InvoiceLine[], sup: string): Promise<PreviewState | null> => {
      const key = previewKeyOf(ls, sup);
      if (previewInflight.current?.key === key) return previewInflight.current.promise;
      const run = ++previewRun.current;
      if (!ls.length) return Promise.resolve(null);
      const sent = ls.filter((l) => l.selected);
      if (!sent.length) {
        // Nothing ticked: nothing to match (ticking a line asks again).
        const none: PreviewState = { byId: new Map(), lineKeys: new Map(), sent: new Set(), matchKeys: new Map(), key };
        previewRef.current = none;
        setPreview(none);
        setMatchStatus('ok');
        return Promise.resolve(none);
      }
      setMatchStatus('loading');
      const promise = (async () => {
        try {
          const res = await previewInvoiceLines({ supplier: sup.trim() || null, lines: sent.map((l) => toImportLine(l, categories, sup, null)) });
          if (run !== previewRun.current || !mounted.current) return null;
          const byId = new Map<string, StoredPreviewLine>();
          const lineKeys = new Map<string, string>();
          const matchKeys = new Map(sent.map((l) => [l.id, matchKeyOf(l, sup)] as const));
          for (const pl of res.lines) {
            const l = sent[pl.index];
            if (!l) continue;
            // « Same product as line N »: N is an index in what was sent; keep the line's id and its index on screen.
            const m = pl.match;
            const src = m && typeof m.sameAsLine === 'number' ? sent[m.sameAsLine] : undefined;
            const stored: StoredPreviewLine =
              m && typeof m.sameAsLine === 'number'
                ? { ...pl, match: { ...m, sameAsLine: src ? ls.indexOf(src) : -1 }, sameAsId: src?.id ?? '' }
                : pl;
            byId.set(l.id, stored);
            lineKeys.set(l.id, lineKeyOf(l, sup));
          }
          const next: PreviewState = { byId, lineKeys, sent: new Set(sent.map((l) => l.id)), matchKeys, key };
          previewRef.current = next;
          setPreview(next);
          setMatchStatus('ok');
          return next;
        } catch {
          if (run !== previewRun.current || !mounted.current) return null;
          // The last answer stays (a line edited since then falls back to its exact name).
          setMatchStatus('error');
          return null;
        } finally {
          if (previewInflight.current?.key === key) previewInflight.current = null;
        }
      })();
      previewInflight.current = { key, promise };
      return promise;
    },
    [categories],
  );
  const runPreviewRef = useRef(runPreview);
  runPreviewRef.current = runPreview;

  const linesRef = useRef(lines);
  linesRef.current = lines;
  const supplierRef = useRef(supplier);
  supplierRef.current = supplier;
  const previewKey = useMemo(() => previewKeyOf(lines, supplier), [lines, supplier]);

  // A line edited, added or removed, or another supplier: ask again (debounced).
  useEffect(() => {
    if (step !== 'review' || !linesRef.current.length) return;
    if (previewKey === previewRef.current.key || previewInflight.current?.key === previewKey) return;
    const t = setTimeout(() => runPreviewRef.current(linesRef.current, supplierRef.current), previewRef.current.key === null ? 0 : PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [previewKey, step]);

  /**
   * A line's preview, only while its matching fields are the ones the preview
   * answered for: a line edited since then reads its exact name (fallback)
   * until the next answer, never another name's match.
   */
  const previewOf = useCallback((l: InvoiceLine, state: PreviewState) => {
    if (!l.selected) return null;
    const pl = state.byId.get(l.id);
    if (!pl || state.lineKeys.get(l.id) !== lineKeyOf(l, supplierRef.current)) return null;
    return pl;
  }, []);

  const targets = useMemo(() => {
    const m = new Map<string, LineTarget>();
    for (const l of lines) m.set(l.id, resolveTarget(l, previewOf(l, preview), catalog, ctx, lines));
    return m;
    // `supplier`: previewOf reads it (a new supplier invalidates the alias matches).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, preview, catalog, ctx, previewOf, supplier]);

  /**
   * The matching is on its way for these lines (first read, or a line edited / ticked since): a ticked line
   * without its own answer yet shows « Recherche dans vos produits… », never a guess that flips a moment later.
   * So does a line AFTER one ticked, unticked, renamed or resized: the preview reads the lines in order (it may
   * now be « the same product as line N », or no longer).
   */
  const matchingAhead = matchStatus === 'loading' || (matchStatus !== 'error' && previewKey !== preview.key);
  const linePreviews = useMemo(() => {
    const m = new Map<string, LinePreview>();
    let upstream = false;
    for (const l of lines) {
      const t = targets.get(l.id)!;
      const pending = matchingAhead && l.selected && l.link.kind === 'auto' && (upstream || !previewOf(l, preview));
      m.set(l.id, pending ? { ...previewLine(l, ctx, t), pending: true } : previewLine(l, ctx, t));
      if (l.selected !== preview.sent.has(l.id) || (l.selected && preview.matchKeys.get(l.id) !== matchKeyOf(l, supplier))) upstream = true;
    }
    return m;
  }, [lines, ctx, targets, matchingAhead, preview, previewOf, supplier]);

  const previewErrors = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lines) {
      const e = preview.byId.get(l.id)?.error;
      if (e) m.set(l.id, e);
    }
    return m;
  }, [lines, preview]);

  const setLink = useCallback((id: string, link: InvoiceLine['link']) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, link, importError: l.importError && errorField(l.importError.message) === null ? null : l.importError } : l)),
    );
  }, []);

  /** « Lier »: confirm the look-alike product (sent as productId, remembered for the supplier). */
  const onLink = useCallback(
    (id: string) => {
      const t = targets.get(id);
      if (!t || t.kind !== 'decide') return;
      haptics.select();
      setLink(id, { kind: 'product', productId: t.productId, name: t.name, containerVolumeCl: t.containerVolumeCl, via: 'suggestion' });
    },
    [targets, setLink],
  );

  /** « Créer un nouveau »: refuse the look-alike (sent as createNew). */
  const onCreateNew = useCallback(
    (id: string) => {
      haptics.select();
      setLink(id, { kind: 'create' });
    },
    [setLink],
  );

  const onChoose = useCallback((id: string) => setPickerFor(id), []);

  const pickerLine = pickerFor ? (lines.find((l) => l.id === pickerFor) ?? null) : null;
  const onPickProduct = useCallback(
    (p: PickedProduct, via: 'suggestion' | 'picked') => {
      const id = pickerFor;
      setPickerFor(null);
      if (!id) return;
      const t = targets.get(id);
      // Picking the product the matching found anyway: follow it (exact / alias need no flag).
      if (t && t.kind === 'update' && !t.explicit && t.productId === p.productId) {
        setLink(id, { kind: 'auto' });
        return;
      }
      setLink(id, {
        kind: 'product',
        productId: p.productId,
        name: p.name,
        containerVolumeCl: p.containerVolumeCl,
        via: t?.kind === 'decide' && t.productId === p.productId ? 'suggestion' : via,
      });
    },
    [pickerFor, targets, setLink],
  );
  const onPickCreate = useCallback(() => {
    const id = pickerFor;
    setPickerFor(null);
    if (!id) return;
    const t = targets.get(id);
    // Already a creation without any match: nothing to force.
    setLink(id, t && t.kind === 'create' && !t.forced && !t.suggestions.length ? { kind: 'auto' } : { kind: 'create' });
  }, [pickerFor, targets, setLink]);

  // ─── Scan ───────────────────────────────────────────────────────────────

  const runScan = useCallback(
    async (prepared: PreparedInvoicePhoto) => {
      const run = ++runRef.current;
      const ctrl = new AbortController();
      abortRef.current?.abort();
      abortRef.current = ctrl;
      setScanError(null);
      setStep('scanning');
      setPhase('sending');
      setUpload(0);
      // Some platforms never report upload progress: move on to « Lecture » anyway.
      const fallback = setTimeout(() => {
        if (mounted.current && run === runRef.current) setPhase((p) => (p === 'sending' ? 'reading' : p));
      }, 900);
      try {
        const result = await scanInvoice(prepared.ocrBase64, {
          signal: ctrl.signal,
          onUploadProgress: (r) => {
            if (!mounted.current || run !== runRef.current) return;
            setUpload(r);
            if (r >= 1) setPhase((p) => (p === 'sending' ? 'reading' : p));
          },
        });
        if (!mounted.current || run !== runRef.current) return;
        queryClient.invalidateQueries({ queryKey: ['scanQuota'] });
        if (!result.products.length) {
          haptics.warning();
          setScanError({
            kind: 'unreadable',
            title: 'Aucun produit reconnu',
            message: 'La lecture n’a trouvé aucune ligne produit sur cette facture.',
            resend: false,
            canRetry: true,
            fromServer: false,
          });
          setStep('error');
          return;
        }
        const read = linesFromScan(result.products, categories);
        setSupplier(result.supplier.trim());
        setInvoiceDate(result.invoiceDate);
        setLines(read);
        setCorrecting(false);
        // Match the names while the « Lu » tick shows: the review opens with the answer.
        resetPreview();
        runPreviewRef.current(read, result.supplier.trim());
        setPhase('done');
        haptics.success();
        await wait(520);
        if (!mounted.current || run !== runRef.current) return;
        setStep('review');
      } catch (err: any) {
        if (!mounted.current || run !== runRef.current) return;
        if (isCancelled(err)) {
          setStep('capture');
          return;
        }
        haptics.warning();
        setScanError(describeInvoiceScanError(err));
        setStep('error');
        if (err?.response?.status === 429) queryClient.invalidateQueries({ queryKey: ['scanQuota'] });
      } finally {
        clearTimeout(fallback);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, queryClient],
  );

  const startFromImage = useCallback(
    async (picked: PickedImage) => {
      const token = ++runRef.current;
      setStep('scanning');
      setPhase('preparing');
      setUpload(0);
      setPhoto(null);
      setScanError(null);
      try {
        const prepared = await prepareInvoicePhoto(picked);
        // « Annuler » (or leaving) while the photo was being prepared.
        if (!mounted.current || token !== runRef.current) return;
        setPhoto(prepared);
        await runScan(prepared);
      } catch (err: any) {
        if (!mounted.current || token !== runRef.current) return;
        haptics.warning();
        setScanError({
          kind: 'unreadable',
          title: 'Image illisible',
          message: err instanceof PhotoError ? err.message : 'Impossible de lire cette image. Choisissez une photo JPEG ou PNG de la facture.',
          resend: false,
          canRetry: true,
          fromServer: false,
        });
        setStep('error');
      }
    },
    [runScan],
  );

  const onPick = useCallback(
    async (source: PickSource) => {
      if (picking) return;
      if (isWeb) {
        // A double click would open two file choosers (a cancelled one never resolves on web).
        const now = Date.now();
        if (now - lastPickRef.current < 1000) return;
        lastPickRef.current = now;
      }
      // Web: a cancelled file chooser never resolves, so only native tracks « busy ».
      const track = !isWeb;
      if (track) setPicking(true);
      let picked: PickedImage | null = null;
      try {
        picked = await pickInvoiceImage(source);
      } catch (err: any) {
        if (err instanceof PhotoError) {
          await dialog.alert({ title: 'Accès refusé', message: err.message, tone: 'warn', icon: 'camera-outline' });
        } else {
          toast.error('Impossible d’ouvrir les photos. Réessayez.');
        }
      } finally {
        if (track && mounted.current) setPicking(false);
      }
      if (picked && mounted.current) startFromImage(picked);
    },
    [picking, startFromImage],
  );

  // Android: the camera may have killed the activity — recover the photo.
  useEffect(() => {
    recoverPendingInvoiceImage().then((img) => {
      if (img && mounted.current) startFromImage(img);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelScan = useCallback(() => {
    runRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    setStep('capture');
  }, []);

  const retry = useCallback(() => {
    if (scanError?.resend && photo) runScan(photo);
    else {
      setPhoto(null);
      setScanError(null);
      setStep('capture');
    }
  }, [scanError, photo, runScan]);

  const manual = useCallback(() => openProductForm(nav, { start: 'form' }), [nav]);

  // ─── Review ─────────────────────────────────────────────────────────────

  const onToggle = useCallback((id: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l)));
  }, []);

  const onToggleAll = useCallback(() => {
    setLines((prev) => {
      const all = prev.every((l) => l.selected);
      return prev.map((l) => ({ ...l, selected: !all }));
    });
  }, []);

  const onEdit = useCallback((id: string) => setEditing({ id, isNew: false, showErrors: false }), []);

  const onAddLine = useCallback(() => {
    const draft = emptyLine(lines.length ? Math.max(...lines.map((l) => l.position)) + 1 : 0, categories);
    setEditing({ id: draft.id, isNew: true, showErrors: false, draft });
  }, [lines, categories]);

  const editingLine = editing ? (editing.draft ?? lines.find((l) => l.id === editing.id) ?? null) : null;

  /**
   * The line editor's preview: the line's own match while its name and
   * container are unchanged, else the exact-name fallback until the preview
   * answers again (a link the user chose is kept either way).
   */
  const resolveForEdit = useCallback(
    (l: InvoiceLine): LinePreview => {
      const orig = lines.find((x) => x.id === l.id);
      const same = !!orig && orig.name.trim() === l.name.trim() && orig.containerVolumeCl === l.containerVolumeCl;
      // A link the user chose goes with the name and size it was chosen for (see submitLine).
      const edited = !same && l.link.kind !== 'auto' ? { ...l, link: AUTO_LINK } : l;
      const list = orig ? lines.map((x) => (x.id === l.id ? edited : x)) : [...lines, edited];
      return previewLine(edited, ctx, resolveTarget(edited, same ? previewOf(edited, preview) : null, catalog, ctx, list));
    },
    [lines, preview, catalog, ctx, previewOf],
  );

  const submitLine = useCallback((line: InvoiceLine) => {
    setLines((prev) => {
      const orig = prev.find((l) => l.id === line.id);
      if (!orig) return [...prev, line];
      // Renamed or resized (a misread line corrected): the product linked by hand was chosen for the old label,
      // so the matching asks again (never « Jack Daniel’s » silently updating « Jameson »).
      const relabelled = orig.name.trim() !== line.name.trim() || orig.containerVolumeCl !== line.containerVolumeCl;
      const next = relabelled && line.link.kind !== 'auto' ? { ...line, link: AUTO_LINK } : line;
      return prev.map((l) => (l.id === line.id ? next : l));
    });
    setTimeout(() => setEditing(null), 0);
  }, []);

  // Read by the (long-lived) back guard: always the current values.
  const correctingRef = useRef(correcting);
  correctingRef.current = correcting;
  const lineCountRef = useRef(lines.length);
  lineCountRef.current = lines.length;

  const confirmDiscard = useCallback(() => {
    const fixing = correctingRef.current;
    const several = lineCountRef.current > 1;
    return dialog.confirm({
      title: fixing ? 'Abandonner ces corrections ?' : 'Abandonner cette facture ?',
      message: fixing
        ? `${several ? 'Ces lignes ne seront pas importées' : 'Cette ligne ne sera pas importée'}. Les produits déjà importés sont conservés.`
        : 'Les lignes détectées et vos corrections ne seront pas importées.',
      confirmLabel: 'Abandonner',
      cancelLabel: fixing ? 'Continuer la correction' : 'Continuer la vérification',
      destructive: true,
    });
  }, []);

  const resetAll = useCallback(() => {
    runRef.current++;
    abortRef.current?.abort();
    setLines([]);
    setSupplier('');
    setInvoiceDate(null);
    setPhoto(null);
    setScanError(null);
    setSummary(null);
    setCorrecting(false);
    setPickerFor(null);
    resetPreview();
    setStep('capture');
  }, [resetPreview]);

  const rescan = useCallback(async () => {
    if (lines.length > 0 && !(await confirmDiscard())) return;
    resetAll();
  }, [lines.length, confirmDiscard, resetAll]);

  // ─── Leaving (NavBar, Android back, browser back, reload) ──────────────

  const guardRef = useRef(false);
  guardRef.current = step === 'review' && lines.length > 0;
  const guardActive = (step === 'review' && lines.length > 0) || importing;
  /** Set once the user chose to leave: the guard lets the removal through. */
  const leavingRef = useRef(false);
  const confirmingRef = useRef(false);
  /** A browser back popped our history entry while the dialog decides. */
  const restoredRef = useRef(false);
  /** Web: this screen's history entry, to put back after a cancelled browser back. */
  const ownEntryRef = useRef<{ state: unknown; path: string } | null>(null);

  useEffect(() => {
    if (!isWeb || !guardActive) return;
    const loc = web.location;
    const hist = web.history;
    if (loc && hist) ownEntryRef.current = { state: hist.state, path: `${loc.pathname}${loc.search}` };
    // Reload / tab close: the browser's own « leave this page? » prompt.
    const onBeforeUnload = (ev: any) => {
      ev.preventDefault();
      ev.returnValue = '';
      return '';
    };
    web.addEventListener?.('beforeunload', onBeforeUnload);
    return () => web.removeEventListener?.('beforeunload', onBeforeUnload);
  }, [guardActive]);

  /** After a browser back was refused: push our entry back, so the URL matches the screen. */
  const restoreEntry = useCallback((): boolean => {
    if (!isWeb) return false;
    const own = ownEntryRef.current;
    const loc = web.location;
    const hist = web.history;
    if (!own || !loc || !hist) return false;
    if (`${loc.pathname}${loc.search}` === own.path) return false;
    hist.pushState(own.state, '', own.path);
    return true;
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (leavingRef.current) return;
      if (askingRef.current) {
        // « Importer » asks a question: it is the thing to answer (Annuler goes back to the lines).
        e.preventDefault();
        restoreEntry();
        return;
      }
      if (importingRef.current) {
        // The request would still create the products: stay until it answers.
        e.preventDefault();
        restoreEntry();
        toast.info('Import en cours : encore un instant.');
        return;
      }
      if (!guardRef.current) return;
      e.preventDefault();
      if (restoreEntry()) restoredRef.current = true;
      if (confirmingRef.current) return; // a second back while the dialog is open
      confirmingRef.current = true;
      confirmDiscard().then((ok) => {
        confirmingRef.current = false;
        const replay = restoredRef.current;
        restoredRef.current = false;
        if (!ok || !mounted.current || importingRef.current) return;
        leavingRef.current = true;
        // A browser back: let the router replay it from the restored entry (keeps the history clean).
        if (replay) web.history.back();
        else navigation.dispatch(e.data.action);
        setTimeout(() => {
          if (mounted.current) leavingRef.current = false;
        }, 1500);
      });
    });
    return unsub;
  }, [navigation, confirmDiscard, restoreEntry]);

  /**
   * Leave this root-stack screen, THEN open a tab screen. On web this keeps
   * the dashboard's history entry: /facture is popped, /produits is pushed,
   * so browser back from the list returns to the Tableau de bord.
   */
  const leaveThen = useCallback(
    (go: () => void) => {
      leavingRef.current = true;
      if (!isWeb || !nav.canGoBack?.()) {
        go();
        return;
      }
      nav.goBack();
      nextFrame(go);
    },
    [nav],
  );

  // ─── Import ─────────────────────────────────────────────────────────────

  /**
   * Look-alike lines nobody decided on: one question for all of them (never
   * linked silently). Resolves the links to apply, or null to go back. The
   * message names at most one pair (each card already says « Ressemble à … »),
   * so the dialog fits a 360 × 640 phone whatever the number of lines.
   */
  const decideLookAlikes = useCallback(async (pending: { line: InvoiceLine; target: Extract<LineTarget, { kind: 'decide' }> }[]) => {
    if (!pending.length) return new Map<string, InvoiceLine['link']>();
    haptics.warning();
    const n = pending.length;
    const one = n === 1 ? pending[0] : null;
    const pair = (p: (typeof pending)[number]) => `${quoteFr(p.line.name.trim())} → ${quoteFr(p.target.name)}`;
    const choice = await dialog.show<'link' | 'create' | null>({
      title: one ? `Mettre à jour ${quoteFr(one.target.name)} ?` : `${n} lignes ressemblent à vos produits`,
      message: one
        ? `La ligne ${quoteFr(one.line.name.trim())} ressemble à ce produit. Mettre à jour son prix d’achat, ou créer un nouveau produit ?`
        : n === 2
          ? `${pair(pending[0])} ; ${pair(pending[1])}. Mettre à jour ces produits, ou en créer de nouveaux ?`
          : `${pair(pending[0])}, et ${plural(n - 1, 'autre ligne', 'autres lignes')}. Mettre à jour ces ${n} produits, ou en créer de nouveaux ?`,
      icon: 'git-compare-outline',
      tone: 'warn',
      actions: [
        { label: one ? 'Mettre à jour ce produit' : 'Tout mettre à jour', value: 'link', style: 'primary' },
        { label: one ? 'Créer un nouveau produit' : 'Tout créer', value: 'create', style: 'secondary' },
        { label: one ? 'Annuler' : 'Choisir ligne par ligne', value: null, style: 'cancel' },
      ],
    });
    if (!choice) return null;
    const links = new Map<string, InvoiceLine['link']>();
    for (const p of pending) {
      links.set(
        p.line.id,
        choice === 'link'
          ? { kind: 'product', productId: p.target.productId, name: p.target.name, containerVolumeCl: p.target.containerVolumeCl, via: 'suggestion' }
          : { kind: 'create' },
      );
    }
    return links;
  }, []);

  /**
   * Lines that update a product of another size (« Sirop … 70 cl » linked to a
   * 1 L product): its purchase price would become a 70 cl price. One question:
   * convert to the product's size (same price per litre), keep the invoice's
   * price, or go back. Resolves the purchase price to send by line id, or null.
   */
  const decideSizes = useCallback(
    async (items: { line: InvoiceLine; target: Extract<LineTarget, { kind: 'update' }> }[]) => {
      const out = new Map<string, number>();
      if (!items.length) return out;
      const conv = items.map(({ line, target }) => {
        const price = line.purchasePriceHT as number;
        const raw = (price * target.containerVolumeCl) / containerOf(line, ctx);
        return { line, target, price, converted: raw >= 1 ? Math.round(raw * 100) / 100 : Math.round(raw * 1000) / 1000 };
      });
      haptics.warning();
      const one = conv.length === 1 ? conv[0] : null;
      const sizeOf = (c: (typeof conv)[number]) => formatVolumeCl(c.target.containerVolumeCl);
      const choice = await dialog.show<'convert' | 'keep' | null>({
        title: one ? 'Contenance différente' : `${conv.length} contenances différentes`,
        message: one
          ? `La facture indique ${formatVolumeCl(containerOf(one.line, ctx))} à ${formatEuro(one.price, { decimals: priceDecimals(one.price) })} HT, mais ${quoteFr(one.target.name)} est suivi en ${sizeOf(one)}. Mettre son prix d’achat à ${formatEuro(one.converted, { decimals: priceDecimals(one.converted) })} (même prix au litre) ?`
          : `Ces lignes n’ont pas la contenance du produit qu’elles mettent à jour (${quoteFr(conv[0].target.name)} : ${sizeOf(conv[0])}, ${formatVolumeCl(containerOf(conv[0].line, ctx))} sur la facture). Convertir leurs prix d’achat à la contenance de chaque produit (même prix au litre) ?`,
        icon: 'resize-outline',
        tone: 'warn',
        actions: [
          {
            label: one ? `Convertir : ${formatEuro(one.converted, { decimals: priceDecimals(one.converted) })} pour ${sizeOf(one)}` : 'Convertir les prix',
            value: 'convert',
            style: 'primary',
          },
          { label: one ? `Garder ${formatEuro(one.price, { decimals: priceDecimals(one.price) })}` : 'Garder les prix de la facture', value: 'keep', style: 'secondary' },
          { label: 'Annuler', value: null, style: 'cancel' },
        ],
      });
      if (!choice) return null;
      for (const c of conv) out.set(c.line.id, choice === 'convert' ? c.converted : c.price);
      return out;
    },
    [ctx],
  );

  const doImport = useCallback(async () => {
    if (importingRef.current) return;
    const selectedNow = lines.filter((l) => l.selected);
    if (!selectedNow.length) {
      haptics.warning();
      return;
    }
    const invalid = selectedNow.find((l) => hasErrors(validateLine(l)));
    if (invalid) {
      haptics.warning();
      setEditing({ id: invalid.id, isNew: false, showErrors: true });
      return;
    }
    // Offline: say so at once, before any question (nothing would be imported anyway).
    if (!isOnline()) {
      haptics.warning();
      const info = describeImportError(new OfflineError());
      await dialog.alert({ title: info.title, message: info.message, tone: 'bad', icon: 'cloud-offline-outline' });
      return;
    }
    importingRef.current = true;
    setImporting(true);
    const started = Date.now();
    try {
      // The matching must answer for THESE lines (an edit or a tick may be waiting for its debounce).
      let state = previewRef.current;
      if (state.key !== previewKeyOf(lines, supplier)) state = (await runPreview(lines, supplier)) ?? previewRef.current;
      if (!mounted.current) return;
      const resolveIn = (list: InvoiceLine[]) => (l: InvoiceLine) => resolveTarget(l, previewOf(l, state), catalog, ctx, list);
      const pending = selectedNow
        .map((line) => ({ line, target: resolveIn(lines)(line) }))
        .filter((x): x is { line: InvoiceLine; target: Extract<LineTarget, { kind: 'decide' }> } => x.target.kind === 'decide');
      askingRef.current = true;
      const decided = await decideLookAlikes(pending);
      askingRef.current = false;
      if (!mounted.current) return;
      if (!decided) {
        importingRef.current = false;
        setImporting(false);
        return;
      }
      // The choices only stick once the server answered (an offline failure leaves the lines as they were).
      const decidedLines = decided.size ? lines.map((l) => (decided.has(l.id) ? { ...l, link: decided.get(l.id)! } : l)) : lines;
      const resolve = resolveIn(decidedLines);
      let sendLines = decidedLines.filter((l) => l.selected);
      const otherSize = sendLines
        .map((line) => ({ line, target: resolve(line) }))
        .filter(
          (x): x is { line: InvoiceLine; target: Extract<LineTarget, { kind: 'update' }> } =>
            x.target.kind === 'update' && !!x.line.purchasePriceHT && containerDiffers(x.line, x.target.containerVolumeCl, ctx),
        );
      askingRef.current = true;
      const prices = await decideSizes(otherSize);
      askingRef.current = false;
      if (!mounted.current) return;
      if (!prices) {
        importingRef.current = false;
        setImporting(false);
        return;
      }
      if (prices.size) sendLines = sendLines.map((l) => (prices.has(l.id) ? { ...l, purchasePriceHT: prices.get(l.id)! } : l));
      const sentTargets = sendLines.map(resolve);
      const sentPreviews = sendLines.map((l, i) => previewLine(l, ctx, sentTargets[i]));
      const res = await importInvoiceLines({
        supplier: supplier.trim() || null,
        lines: sendLines.map((l, i) => toImportLine(l, categories, supplier, sentTargets[i])),
      });
      if (decided.size && mounted.current) setLines((prev) => prev.map((l) => (decided.has(l.id) ? { ...l, link: decided.get(l.id)! } : l)));
      const okCount = res.createdCount + res.updatedCount;
      // App-wide caches first: the dashboard and the list must be right even if this screen is gone.
      if (okCount > 0) invalidateProducts(queryClient);
      const elapsed = Date.now() - started;
      if (elapsed < MIN_BUSY_MS) await wait(MIN_BUSY_MS - elapsed);
      if (!mounted.current) {
        // Only reachable if the screen was torn down anyway: still say what happened.
        if (okCount > 0) {
          const label = plural(okCount, 'produit importé', 'produits importés');
          if (res.failedCount > 0) toast.info(`${label} · ${res.failedCount} en échec`);
          else toast.success(label);
        }
        return;
      }

      const outcomes = pairResults(sendLines, res.results, ctx, sentPreviews);
      setSummary({
        outcomes,
        createdCount: res.createdCount,
        updatedCount: res.updatedCount,
        failedCount: res.failedCount,
        supplier: supplier.trim(),
        dateLabel,
      });
      // Imported lines leave the review list; failed ones stay, with their error.
      const failedById = new Map<string, string>();
      for (const o of outcomes) if (!o.result.ok) failedById.set(o.line.id, o.result.error);
      const importedIds = new Set(outcomes.filter((o) => o.result.ok).map((o) => o.line.id));
      setLines((prev) =>
        prev
          .filter((l) => !importedIds.has(l.id))
          .map((l) => {
            const msg = failedById.get(l.id);
            return msg ? { ...l, selected: true, importError: { message: msg, field: errorField(msg) } } : l;
          }),
      );
      setStep('results');
      // The results screen IS the feedback (no toast on top of it).
      if (okCount > 0) haptics.success();
      else haptics.warning();
    } catch (err: any) {
      askingRef.current = false;
      const info = describeImportError(err);
      if (!mounted.current) {
        toast.error(info.title);
        return;
      }
      haptics.warning();
      importingRef.current = false;
      setImporting(false);
      await dialog.alert({
        title: info.title,
        message: info.message,
        tone: 'bad',
        icon: info.offline ? 'cloud-offline-outline' : 'alert-circle-outline',
      });
    } finally {
      askingRef.current = false;
      importingRef.current = false;
      if (mounted.current) setImporting(false);
    }
  }, [lines, supplier, categories, queryClient, dateLabel, catalog, ctx, runPreview, previewOf, decideLookAlikes, decideSizes]);

  const fixFailed = useCallback(() => {
    setCorrecting(true);
    setLines((prev) => prev.filter((l) => !!l.importError));
    setStep('review');
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  let body: React.ReactNode;
  if (step === 'capture') {
    const q = quotaQ.data;
    body = <CaptureStep quota={q ? { limit: q.limit, remaining: q.remaining } : null} busy={picking} onPick={onPick} onManual={manual} />;
  } else if (step === 'scanning') {
    body = <ScanningStep phase={phase} previewUri={photo?.previewUri ?? null} upload={upload} onCancel={cancelScan} />;
  } else if (step === 'error' && scanError) {
    body = <ErrorStep error={scanError} previewUri={photo?.previewUri ?? null} onRetry={retry} onManual={manual} />;
  } else if (step === 'results' && summary) {
    body = (
      <ResultsStep
        summary={summary}
        catalog={catalog}
        onOpenProduct={(id) => leaveThen(() => goToProduct(nav, id))}
        onAdjust={(productIds) => leaveThen(() => openUnderTarget(nav, { productIds, from: 'invoice' }))}
        // Mes produits on this import's prices to review: « Prix à vérifier (facture) · 3 ✕ » (polish n° 2).
        onReview={(reviewIds) => leaveThen(() => goToProductList(nav, { review: true, reviewIds }))}
        onFix={fixFailed}
        onSeeProducts={() => leaveThen(() => goToProductList(nav))}
        onNewInvoice={resetAll}
      />
    );
  } else {
    body = (
      <ReviewStep
        lines={lines}
        supplier={supplier}
        dateLabel={dateLabel}
        previewUri={photo?.previewUri ?? null}
        categories={categories}
        ctx={ctx}
        previews={linePreviews}
        previewErrors={previewErrors}
        matchStatus={matchStatus}
        matchPending={preview.key === null}
        onRetryMatch={() => runPreview(lines, supplier)}
        importing={importing}
        correcting={correcting}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        onEdit={onEdit}
        onLink={onLink}
        onCreateNew={onCreateNew}
        onChoose={onChoose}
        onEditSupplier={() => setSupplierOpen(true)}
        onAddLine={onAddLine}
        onRescan={rescan}
        onImport={doImport}
      />
    );
  }

  return (
    <>
      {/* Each step fades in (160 ms, 6 px rise; instant under reduce motion) instead of a hard cut. */}
      <SwapFade value={step} style={styles.fill}>
        {body}
      </SwapFade>
      <LineEditSheet
        line={step === 'review' ? editingLine : null}
        isNew={editing?.isNew}
        showErrors={editing?.showErrors}
        categories={categories}
        ctx={ctx}
        resolve={resolveForEdit}
        onSubmit={submitLine}
        onClose={() => setEditing(null)}
      />
      <ProductPickerSheet
        line={step === 'review' ? pickerLine : null}
        target={pickerLine ? (targets.get(pickerLine.id) ?? null) : null}
        catalog={catalog}
        ctx={ctx}
        supplier={supplier}
        onPick={onPickProduct}
        onCreateNew={onPickCreate}
        onClose={() => setPickerFor(null)}
      />
      <SupplierSheet
        visible={step === 'review' && supplierOpen}
        supplier={supplier}
        dateLabel={dateLabel}
        onSubmit={(s) => {
          setSupplier(s);
          setSupplierOpen(false);
        }}
        onClose={() => setSupplierOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
