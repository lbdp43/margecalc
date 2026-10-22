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
 * « calculé ×4 » beforehand.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category } from '@margebar/shared';
import { dialog, toast } from '../../components/ui';
import { haptics } from '../../theme/haptics';
import { plural } from '../../utils/format';
import { goToProduct, goToProductList, openProductForm } from '../../navigation/routes';
import { useAuthStore } from '../../store/auth.store';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as categoryService from '../../services/category.service';
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
  formatInvoiceDate,
  hasErrors,
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
  const [dirty, setDirty] = useState(false);

  const [editing, setEditing] = useState<{ id: string; isNew: boolean; showErrors: boolean; draft?: InvoiceLine } | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);

  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const mounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
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
            message: 'La lecture n’a trouvé aucune ligne produit sur cette facture. Reprenez la photo à plat, en entier et bien éclairée.',
            resend: false,
            canRetry: true,
          });
          setStep('error');
          return;
        }
        setSupplier(result.supplier.trim());
        setInvoiceDate(result.invoiceDate);
        setLines(linesFromScan(result.products, categories));
        setCorrecting(false);
        setDirty(false);
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
      setStep('scanning');
      setPhase('preparing');
      setUpload(0);
      setPhoto(null);
      setScanError(null);
      try {
        const prepared = await prepareInvoicePhoto(picked);
        if (!mounted.current) return;
        setPhoto(prepared);
        await runScan(prepared);
      } catch (err: any) {
        if (!mounted.current) return;
        haptics.warning();
        setScanError({
          kind: 'unreadable',
          title: 'Image illisible',
          message: err instanceof PhotoError ? err.message : 'Impossible de lire cette image. Choisissez une photo JPEG ou PNG de la facture.',
          resend: false,
          canRetry: true,
        });
        setStep('error');
      }
    },
    [runScan],
  );

  const onPick = useCallback(
    async (source: PickSource) => {
      if (picking) return;
      // Web: a cancelled file chooser never resolves, so only native tracks « busy ».
      const track = Platform.OS !== 'web';
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

  const manual = useCallback(() => openProductForm(nav), [nav]);

  // ─── Review ─────────────────────────────────────────────────────────────

  const onToggle = useCallback((id: string) => {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, selected: !l.selected } : l)));
  }, []);

  const onToggleAll = useCallback(() => {
    setDirty(true);
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

  const submitLine = useCallback(
    (line: InvoiceLine) => {
      setDirty(true);
      setLines((prev) => (prev.some((l) => l.id === line.id) ? prev.map((l) => (l.id === line.id ? line : l)) : [...prev, line]));
      setTimeout(() => setEditing(null), 0);
      if (editing?.isNew) toast.success('Ligne ajoutée');
    },
    [editing],
  );

  const confirmDiscard = useCallback(
    async () =>
      dialog.confirm({
        title: 'Abandonner cette facture ?',
        message: 'Les lignes détectées et vos corrections ne seront pas importées.',
        confirmLabel: 'Abandonner',
        cancelLabel: 'Continuer la vérification',
        destructive: true,
      }),
    [],
  );

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
    setDirty(false);
    setStep('capture');
  }, []);

  const rescan = useCallback(async () => {
    if (dirty && !(await confirmDiscard())) return;
    resetAll();
  }, [dirty, confirmDiscard, resetAll]);

  // Leaving with lines not imported asks first (NavBar back, browser / Android back).
  const guardRef = useRef(false);
  guardRef.current = step === 'review' && lines.length > 0;
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!guardRef.current) return;
      e.preventDefault();
      confirmDiscard().then((ok) => {
        if (ok) {
          guardRef.current = false;
          navigation.dispatch(e.data.action);
        }
      });
    });
    return unsub;
  }, [navigation, confirmDiscard]);

  // ─── Import ─────────────────────────────────────────────────────────────

  const doImport = useCallback(async () => {
    if (importingRef.current) return;
    const selected = lines.filter((l) => l.selected);
    if (!selected.length) return;
    const invalid = selected.find((l) => hasErrors(validateLine(l)));
    if (invalid) {
      haptics.warning();
      setEditing({ id: invalid.id, isNew: false, showErrors: true });
      return;
    }
    importingRef.current = true;
    setImporting(true);
    const started = Date.now();
    try {
      const res = await importInvoiceLines({
        supplier: supplier.trim() || null,
        lines: selected.map((l) => toImportLine(l, categories, supplier)),
      });
      const elapsed = Date.now() - started;
      if (elapsed < MIN_BUSY_MS) await wait(MIN_BUSY_MS - elapsed);
      if (!mounted.current) return;

      const okCount = res.createdCount + res.updatedCount;
      if (okCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['product'] });
        queryClient.invalidateQueries({ queryKey: ['priceHistory'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      }
      const outcomes = pairResults(selected, res.results);
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
      guardRef.current = false;
      setDirty(false);
      setStep('results');

      if (okCount > 0) {
        haptics.success();
        const label = plural(okCount, 'produit importé', 'produits importés');
        if (res.failedCount > 0) toast.info(`${label} · ${res.failedCount} en échec`);
        else toast.success(label);
      } else {
        haptics.warning();
        toast.error(res.error ?? 'Aucun produit n’a pu être importé');
      }
    } catch (err: any) {
      if (!mounted.current) return;
      const info = describeImportError(err);
      haptics.warning();
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
  }, [lines, supplier, categories, queryClient, dateLabel]);

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
        onOpenProduct={(id) => goToProduct(nav, id)}
        onFix={fixFailed}
        onSeeProducts={() => goToProductList(nav)}
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
      {body}
      <LineEditSheet
        line={step === 'review' ? editingLine : null}
        isNew={editing?.isNew}
        showErrors={editing?.showErrors}
        categories={categories}
        ctx={ctx}
        onSubmit={submitLine}
        onClose={() => setEditing(null)}
      />
      <SupplierSheet
        visible={step === 'review' && supplierOpen}
        supplier={supplier}
        dateLabel={dateLabel}
        onSubmit={(s) => {
          setSupplier(s);
          setDirty(true);
          setSupplierOpen(false);
        }}
        onClose={() => setSupplierOpen(false)}
      />
    </>
  );
}
