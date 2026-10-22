/**
 * « Scanner une facture » (root stack, no tab bar). Admins reach it from the
 * Scanner menu (`openInvoiceScan`).
 *
 *   capture ──pick──▶ scanning (resize ~2 000 px → upload → free OCR)
 *      ▲                 │ ok                        │ 422 / 429 / offline / timeout
 *      │                 ▼                           ▼
 *      └──── review (edit, tick, add) ──Importer──▶ results ── « Corriger » ─▶ review
 *                                                      └─ « Voir mes produits » ─▶ ProductList
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
import { plural } from '../../utils/format';
import { goToProduct, goToProductList, openProductForm } from '../../navigation/routes';
import { useAuthStore } from '../../store/auth.store';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as categoryService from '../../services/category.service';
import * as productService from '../../services/product.service';
import { getScanQuota, type ScanQuota } from '../../services/scan.service';
import {
  describeImportError,
  describeInvoiceScanError,
  importInvoiceLines,
  isCancelled,
  scanInvoice,
  type InvoiceScanErrorInfo,
} from '../../services/invoice.service';
import { CaptureStep } from '../invoice/CaptureStep';
import { ScanningStep, type ScanPhase } from '../invoice/ScanningStep';
import { ErrorStep } from '../invoice/ErrorStep';
import { ReviewStep } from '../invoice/ReviewStep';
import { LineEditSheet, SupplierSheet } from '../invoice/LineEditSheet';
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
  emptyLine,
  errorField,
  findExisting,
  formatInvoiceDate,
  hasErrors,
  indexProducts,
  linesFromScan,
  pairResults,
  toImportLine,
  validateLine,
  type InvoiceLine,
  type PricingContext,
} from '../invoice/model';

type Props = NativeStackScreenProps<any, 'InvoiceScan'>;
type Step = 'capture' | 'scanning' | 'error' | 'review' | 'results';

const MIN_BUSY_MS = 400;
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
  // The user's products: a line with the same name + container updates one of them.
  const productsQ = useOfflineQuery<ProductWithMargin[]>(['products'], () => productService.getProducts(), { refetchOnMount: 'always' });
  const existing = useMemo(() => indexProducts(productsQ.data), [productsQ.data]);
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

  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
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
        setSupplier(result.supplier.trim());
        setInvoiceDate(result.invoiceDate);
        setLines(linesFromScan(result.products, categories));
        setCorrecting(false);
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

  const submitLine = useCallback((line: InvoiceLine) => {
    setLines((prev) => (prev.some((l) => l.id === line.id) ? prev.map((l) => (l.id === line.id ? line : l)) : [...prev, line]));
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
    setStep('capture');
  }, []);

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

  const doImport = useCallback(async () => {
    if (importingRef.current) return;
    const selected = lines.filter((l) => l.selected);
    if (!selected.length) {
      haptics.warning();
      return;
    }
    const invalid = selected.find((l) => hasErrors(validateLine(l)));
    if (invalid) {
      haptics.warning();
      setEditing({ id: invalid.id, isNew: false, showErrors: true });
      return;
    }
    importingRef.current = true;
    setImporting(true);
    const started = Date.now();
    const snapshot = existing;
    try {
      const res = await importInvoiceLines({
        supplier: supplier.trim() || null,
        lines: selected.map((l) => toImportLine(l, categories, supplier, findExisting(l, snapshot, ctx))),
      });
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

      const outcomes = pairResults(selected, res.results, ctx, snapshot);
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
      importingRef.current = false;
      if (mounted.current) setImporting(false);
    }
  }, [lines, supplier, categories, queryClient, dateLabel, existing, ctx]);

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
        onOpenProduct={(id) => leaveThen(() => goToProduct(nav, id))}
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
        existing={existing}
        importing={importing}
        correcting={correcting}
        onToggle={onToggle}
        onToggleAll={onToggleAll}
        onEdit={onEdit}
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
        existing={existing}
        onSubmit={submitLine}
        onClose={() => setEditing(null)}
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
