/**
 * « Sous l’objectif » (Produits › UnderTarget, /produits/sous-objectif; lot 2
 * n° 7, mockup 2): every service of every product under the user's objective,
 * one row each, with the suggested price (rounded up), the new margin and the
 * gain per dose. « Appliquer » per row, « Tout appliquer » in the sticky bar.
 *
 *   NavBar « Sous l’objectif » · « Objectif 65 % »
 *   [Tous 4] [< 50 % 1] [50–65 % 3]
 *   rows (model.ts / TargetRowCard.tsx), worst margin first
 *   ● 3 prix · marge moy. 68,4 → 72,1 %           [✓✓ Tout appliquer]
 *
 * - Every write is ONE POST /api/products/prices/batch (200 products at a
 *   time), then an undo toast (« 3 prix mis à jour · Annuler ⑥ »). « Annuler »
 *   posts the batch's `previous` back (exact restore). An applied row stays in
 *   place with its own « Annuler » (review pattern adapted from Kokonut UI
 *   « AI Diff Review », MIT, kokonutui.com): a product changed twice here is
 *   restored service by service, so a later change is never lost.
 * - Writes run one after another, and a product with a write running has its
 *   rows inactive (« Tout appliquer » waits too): never the same product in
 *   two batches.
 * - A product changed ELSEWHERE since (a newer `updatedAt` in the caches:
 *   purchase price sheet, form, invoice) loses its « Annuler » here: its rows
 *   go back to the live list. Only the latest change of a product can be
 *   undone (productActions `showPriceUndo` closes the older windows).
 * - Guard: a suggested price more than +30 % above the current one (« +108 % :
 *   vérifiez d’abord l’achat ») is left out of « Tout appliquer »; it can be
 *   applied alone, or at the « seuil » price.
 * - Params (routes.ts `openUnderTarget`): `productIds` restricts the screen
 *   (invoice results; in memory only), `zone` opens on a chip, `from`.
 * - The floating tab bar hides here (TAB_BAR_HIDDEN_ROUTES): the sticky bar is
 *   the only bottom bar; toasts sit 12 px above it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import type { BatchPriceSnapshot, BatchPriceUpdate, ProductWithMargin } from '@margebar/shared';
import {
  Badge,
  ChipRow,
  EmptyState,
  FadeIn,
  Icon,
  NavBar,
  PressableScale,
  Screen,
  ScreenList,
  SkeletonList,
  StickyActionBar,
  toast,
  useDelayedLoading,
} from '../../../components/ui';
import type { UndoHandle } from '../../../components/ui';
import { marginColors, palette, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatEuro, formatNumber, formatPercent, NBSP, plural } from '../../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../../utils/marginThresholds';
import { usePriceRounding } from '../../../utils/priceRounding';
import { marginAt } from '../../../utils/pricing';
import { goToProduct, goToProductList, openProductForm, ROUTES, UnderTargetParams } from '../../../navigation/routes';
import { useOfflineQuery } from '../../../hooks/useOfflineQuery';
import { isOnline } from '../../../services/offline';
import * as productService from '../../../services/product.service';
import { changedSince, changedSinceMessage, loadErrorMessage, showPriceUndo, undoOfflineMessage, writeErrorMessage } from '../list/productActions';
import { averageAfter, TargetRow, underTargetRows, updatesFor } from './model';
import { AppliedState, TargetRowCard } from './TargetRowCard';

type Props = NativeStackScreenProps<any, 'UnderTarget'>;
type ZoneKey = 'all' | 'red' | 'orange';

interface Applied extends AppliedState {
  /** The row as it was before (kept on screen, same place). */
  row: TargetRow;
  batch: number;
}

const OFFLINE = 'Pas de connexion : aucun prix n’a été modifié. Réessayez une fois connecté.';
const Separator = () => <View style={{ height: 10 }} />;
const lowerFirst = (m: string) => (m ? m.charAt(0).toLowerCase() + m.slice(1) : m);
const unique = <T,>(list: T[]) => Array.from(new Set(list));
const m2 = (n: number) => Math.round(n * 100) / 100;

export function UnderTargetScreen({ route, navigation: nav }: Props) {
  const navigation = nav as any;
  const params = (route.params ?? {}) as UnderTargetParams;
  const queryClient = useQueryClient();
  const t = useMarginThresholds();
  const rounding = usePriceRounding();
  const { width } = useWindowDimensions();
  const narrow = width < 375;

  const { data, isLoading, isFetching, error, refetch, isOffline } = useOfflineQuery<ProductWithMargin[]>(productService.productKeys.list, () =>
    productService.getProducts(),
  );
  const hasData = data !== undefined;
  const products = useMemo(() => data ?? [], [data]);

  // ── params: the invoice's products (in memory), a zone chip (applied once) ──
  const [onlyIds, setOnlyIds] = useState<Set<string> | null>(() => (params.productIds?.length ? new Set(params.productIds) : null));
  // Opened again while in the stack (another invoice, or the dashboard without a restriction).
  const firstIds = useRef(true);
  useEffect(() => {
    if (firstIds.current) {
      firstIds.current = false;
      return;
    }
    setOnlyIds(params.productIds?.length ? new Set(params.productIds) : null);
  }, [params.productIds]);
  const [zone, setZone] = useState<ZoneKey>(params.zone === 'bad' ? 'red' : params.zone === 'medium' ? 'orange' : 'all');
  useEffect(() => {
    if (!params.zone) return;
    setZone(params.zone === 'bad' ? 'red' : 'orange');
    navigation.setParams({ zone: undefined });
  }, [params.zone, navigation]);

  // ── what was applied here (rows stay in place, with their own « Annuler ») ──
  const [applied, setApplied] = useState<Record<string, Applied>>({});
  const appliedRef = useRef(applied);
  /** Writes read and update `appliedRef` synchronously (they run one after another). */
  const commitApplied = useCallback((next: Record<string, Applied>) => {
    appliedRef.current = next;
    setApplied(next);
  }, []);
  /** Products with a write running or queued: all their rows are inactive meanwhile. */
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  /** Each product as it was before its first change on this screen: the exact undo. */
  const baselines = useRef(new Map<string, BatchPriceSnapshot>());
  /**
   * Each changed product's `updatedAt` right after this screen's last write.
   * A newer copy in the caches means it changed elsewhere since (purchase
   * price sheet, form, invoice): its rows go back to the live list and their
   * « Annuler » is gone, so a later change is never undone from here.
   */
  const stamps = useRef(new Map<string, string>());
  const batchSeq = useRef(0);
  const toasts = useRef(new Map<number, { keys: string[]; handle: UndoHandle }>());
  /**
   * Writes run one after another (a row, « Tout appliquer », an « Annuler »):
   * each one builds its services from the products the previous one wrote,
   * and responses can never land out of order.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(fn, fn);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const live = useMemo(() => underTargetRows(products, t, rounding, onlyIds), [products, t, rounding, onlyIds]);
  /**
   * « Appliquer » never moves the list (polish n° 3). Each row keeps the place
   * it had when it first showed (its margin then): no re-sort while the screen
   * is open, applied rows stay where they were. And a row on screen never
   * leaves for a single render: the list cache and this screen's state land in
   * separate renders (the query notifies in its own task), so the applied row
   * used to drop out for one render and come back as a NEW cell, the browser
   * clamping the scroll to the top meanwhile. So `appliedRef` (updated with
   * every write, before the cache) is what is read here, and a row whose
   * product this render's list copy does not hold at its latest write yet
   * stays as it was.
   */
  const rank = useRef(new Map<string, number>());
  const lastShown = useRef(new Map<string, TargetRow>());
  /** Each product's `updatedAt` right after this screen's latest write of it (apply or « Annuler »). */
  const lastWrite = useRef(new Map<string, string>());
  // Read during render on purpose (see above); `applied` re-renders when it changes.
  const appliedNow = appliedRef.current;
  const rows = useMemo(() => {
    const current = appliedRef.current;
    const byKey = new Map<string, TargetRow>();
    for (const r of live) if (!current[r.key]) byKey.set(r.key, r);
    // Applied rows keep their « before » figures (and their place), next to the live ones.
    for (const a of Object.values(current)) byKey.set(a.row.key, a.row);
    for (const [key, r] of lastShown.current) {
      if (byKey.has(key)) continue;
      const wrote = lastWrite.current.get(r.productId);
      const listed = products.find((p) => p.id === r.productId);
      if (wrote && listed && Date.parse(listed.updatedAt) < Date.parse(wrote)) byKey.set(key, r);
    }
    const out = Array.from(byKey.values());
    for (const r of out) if (!rank.current.has(r.key)) rank.current.set(r.key, r.margin);
    const at = (r: TargetRow) => rank.current.get(r.key) ?? r.margin;
    out.sort((a, b) => at(a) - at(b) || a.productName.localeCompare(b.productName, 'fr') || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    lastShown.current = new Map(out.map((r) => [r.key, r]));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, applied, products]);
  const counts = useMemo(() => ({ all: rows.length, red: rows.filter((r) => r.zone === 'red').length, orange: rows.filter((r) => r.zone === 'orange').length }), [rows]);
  // A chip that lost its last row falls back to « Tous ».
  useEffect(() => {
    if (zone !== 'all' && hasData && counts[zone] === 0 && counts.all > 0) setZone('all');
  }, [zone, counts, hasData]);
  const visible = useMemo(() => (zone === 'all' ? rows : rows.filter((r) => r.zone === zone)), [rows, zone]);
  const pending = visible.filter((r) => !appliedNow[r.key]);
  /** What « Tout appliquer » covers (the bar's summary)… */
  const bulkAll = pending.filter((r) => !r.guard);
  /** …and what it sends: never a row whose product already has a write running. */
  const bulk = bulkAll.filter((r) => !busy.has(r.productId));
  const guarded = pending.filter((r) => !!r.guard);

  const latestProducts = () => queryClient.getQueryData<ProductWithMargin[]>(productService.productKeys.list) ?? products;
  const markBusy = (ids: string[], on: boolean) =>
    setBusy((old) => {
      const next = new Set(old);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  /** A batch toast whose rows are all back (or gone) has nothing left to undo. */
  const closeEmptyToasts = useCallback((current: Record<string, Applied>) => {
    for (const [id, entry] of toasts.current) {
      if (entry.keys.every((k) => !current[k])) {
        toasts.current.delete(id);
        entry.handle.commit();
      }
    }
  }, []);

  /** Products changed elsewhere since this screen wrote them: their rows go back to the live list. */
  const forget = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const gone = new Set(ids);
      ids.forEach((id) => {
        stamps.current.delete(id);
        baselines.current.delete(id);
      });
      const next = { ...appliedRef.current };
      let changed = false;
      for (const [k, a] of Object.entries(next)) {
        if (!gone.has(a.row.productId)) continue;
        delete next[k];
        changed = true;
      }
      if (changed) commitApplied(next);
      closeEmptyToasts(next);
    },
    [commitApplied, closeEmptyToasts],
  );
  // Every new copy of the list (a sheet, the form, an invoice, a refetch): drop what changed since.
  useEffect(() => {
    if (!data || !stamps.current.size) return;
    forget(Array.from(stamps.current.keys()).filter((id) => changedSince(queryClient, id, stamps.current.get(id))));
  }, [data, queryClient, forget]);

  // ── undo: back to the price each row had (exact when the whole product goes back) ──
  const revertRef = useRef<(keys: string[]) => Promise<void>>(async () => {});
  const revert = useCallback(
    (keys: string[]): Promise<void> => {
      const ids = unique(keys.map((k) => appliedRef.current[k]?.row.productId).filter((id): id is string => !!id));
      if (!ids.length) return Promise.resolve();
      markBusy(ids, true);
      return serial(async () => {
        try {
          const current = appliedRef.current;
          const back = keys.map((k) => current[k]).filter(Boolean) as Applied[];
          if (!back.length) return;
          const byProduct = new Map<string, Applied[]>();
          back.forEach((a) => byProduct.set(a.row.productId, [...(byProduct.get(a.row.productId) ?? []), a]));
          // Changed elsewhere since: left as it is now (never its old purchase price back).
          const stale = Array.from(byProduct.keys()).filter((id) => changedSince(queryClient, id, stamps.current.get(id)));
          const staleNames = stale.map((id) => byProduct.get(id)?.[0]?.row.productName ?? 'Ce produit');
          if (stale.length) forget(stale);
          const fresh = Array.from(byProduct).filter(([id]) => !stale.includes(id));
          if (!fresh.length) {
            haptics.warning();
            toast.info(changedSinceMessage(staleNames));
            return;
          }
          const freshCount = fresh.reduce((n, [, list]) => n + list.length, 0);
          if (!isOnline()) {
            haptics.warning();
            toast.error(undoOfflineMessage(freshCount > 1), { action: { label: 'Réessayer', onPress: () => void revertRef.current(keys) } });
            return;
          }
          const updates: BatchPriceUpdate[] = [];
          const exact = new Set<string>();
          for (const [productId, list] of fresh) {
            const stillApplied = Object.values(current).filter((a) => a.row.productId === productId);
            const base = baselines.current.get(productId);
            if (base && stillApplied.every((a) => keys.includes(a.row.key))) {
              updates.push(...productService.undoOf([base]));
              exact.add(productId);
            } else {
              // Only these services' selling prices, the others as they are now.
              updates.push(...updatesFor(new Map(list.map((a) => [a.row.key, { row: a.row, price: a.row.price }])), latestProducts()));
            }
          }
          const restored = await productService.batchUpdatePricesChunked(updates);
          const written = new Set(restored.products.map((p) => p.id));
          for (const p of restored.products) lastWrite.current.set(p.id, p.updatedAt);
          for (const p of restored.products) {
            if (exact.has(p.id)) {
              baselines.current.delete(p.id);
              stamps.current.delete(p.id);
            } else stamps.current.set(p.id, p.updatedAt);
          }
          productService.applyBatchProducts(queryClient, restored.products);
          const next = { ...appliedRef.current };
          keys.forEach((k) => {
            if (next[k] && written.has(next[k].row.productId)) delete next[k];
          });
          commitApplied(next);
          closeEmptyToasts(next);
          if (restored.error) {
            haptics.warning();
            toast.error(`Annulation incomplète : ${lowerFirst(writeErrorMessage(restored.error, 'save'))}`, {
              action: { label: 'Réessayer', onPress: () => void revertRef.current(keys) },
            });
            return;
          }
          haptics.select();
          const done = freshCount > 1 ? 'Anciens prix rétablis' : 'Ancien prix rétabli';
          toast.info(stale.length ? `${done}, sauf ${stale.length > 1 ? `${stale.length} produits modifiés depuis` : `${staleNames[0]} (modifié depuis)`}` : done);
        } catch (err) {
          haptics.warning();
          const message = isOnline() && !!(err as any)?.response ? `Annulation impossible : ${lowerFirst(writeErrorMessage(err, 'save'))}` : undoOfflineMessage(keys.length > 1);
          toast.error(message, { action: { label: 'Réessayer', onPress: () => void revertRef.current(keys) } });
        } finally {
          markBusy(ids, false);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, serial, forget, commitApplied, closeEmptyToasts],
  );
  revertRef.current = revert;

  // ── apply: one batch (200 products at a time), then the undo toast ──
  const apply = useCallback(
    (entries: { row: TargetRow; price: number }[]): Promise<void> => {
      if (!entries.length) return Promise.resolve();
      if (!isOnline()) {
        haptics.warning();
        toast.error(OFFLINE);
        return Promise.resolve();
      }
      const ids = unique(entries.map((e) => e.row.productId));
      markBusy(ids, true);
      return serial(async () => {
        try {
          // A row applied meanwhile (queued twice) is not sent again.
          const todo = entries.filter((e) => !appliedRef.current[e.row.key]);
          if (!todo.length) return;
          const updates = updatesFor(new Map(todo.map((e) => [e.row.key, e])), latestProducts());
          const result = await productService.batchUpdatePricesChunked(updates);
          const written = new Set(result.products.map((p) => p.id));
          for (const prev of result.previous) if (!baselines.current.has(prev.productId)) baselines.current.set(prev.productId, prev);
          for (const p of result.products) {
            stamps.current.set(p.id, p.updatedAt);
            lastWrite.current.set(p.id, p.updatedAt);
          }
          const done = todo.filter((e) => written.has(e.row.productId));
          const batch = ++batchSeq.current;
          const next = { ...appliedRef.current };
          for (const e of done) next[e.row.key] = { row: e.row, price: e.price, margin: m2(marginAt(e.row.cost, e.row.tva, e.price)), batch };
          // Applied first, then the caches: the row is never without one of them.
          commitApplied(next);
          productService.applyBatchProducts(queryClient, result.products);
          if (result.error) {
            // Some batches went through: their rows keep their own « Annuler ».
            haptics.warning();
            toast.error(`${plural(done.length, 'prix appliqué', 'prix appliqués')}, les autres n’ont pas été modifiés : ${lowerFirst(writeErrorMessage(result.error, 'save'))}`);
            return;
          }
          haptics.success();
          const keys = done.map((e) => e.row.key);
          const one = done[0];
          const message = done.length > 1 ? plural(done.length, 'prix mis à jour', 'prix mis à jour') : `Nouveau prix : ${one.row.productName}, ${formatEuro(one.price)}`;
          // Older undo windows of these products close: only the latest change can be undone.
          const handle = showPriceUndo(Array.from(written), message, () => void revertRef.current(keys));
          toasts.current.set(batch, { keys, handle });
        } catch (err) {
          haptics.warning();
          toast.error(writeErrorMessage(err, 'save'));
        } finally {
          markBusy(ids, false);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, serial, commitApplied],
  );

  const onApplyRow = useCallback((row: TargetRow, price: number) => void apply([{ row, price }]), [apply]);
  const onUndoRow = useCallback((row: TargetRow) => void revert([row.key]), [revert]);
  const onOpen = useCallback((productId: string) => goToProduct(navigation, productId), [navigation]);
  const applyAll = useCallback(async () => {
    if (bulkBusy || busy.size || !bulk.length) return;
    setBulkBusy(true);
    try {
      await apply(bulk.map((row) => ({ row, price: row.suggested })));
    } finally {
      setBulkBusy(false);
    }
  }, [apply, bulk, bulkBusy, busy]);
  const done = useCallback(() => {
    if (navigation.canGoBack?.()) navigation.goBack();
    else goToProductList(navigation);
  }, [navigation]);
  // « Retour » closes the screen (a root-stack screen: the tabs underneath are
  // exactly as the user left them). With nothing underneath (deep link), go to
  // where it was opened from.
  const onBack = useCallback(() => {
    if (navigation.canGoBack?.()) navigation.goBack();
    else if (params.from === 'dashboard') navigation.navigate(ROUTES.tabs, { screen: ROUTES.dashboardTab, params: { screen: ROUTES.dashboardMain } });
    else goToProductList(navigation);
  }, [navigation, params.from]);

  // ── summary: « 3 prix · marge moy. 68,4 → 72,1 % » ──
  const summary = useMemo(() => {
    const prices = new Map(bulkAll.map((r) => [r.key, { row: r, price: r.suggested }]));
    return averageAfter(products, prices);
  }, [products, bulkAll]);
  const appliedVisible = visible.filter((r) => !!appliedNow[r.key]).length;

  const objectiveText = formatPercent(t.good, Number.isInteger(t.good) ? 0 : 1);
  const header = <NavBar title="Sous l’objectif" onBack={onBack} trailing={<Badge variant="neutral" icon="flag-outline" label={`Objectif ${objectiveText}`} />} />;

  // ── states ──
  const showSkeleton = useDelayedLoading(!hasData && (isLoading || isFetching));
  const offlineEmpty = useDelayedLoading(!hasData && !!isOffline, 400);
  const loadError = !hasData && !!error && !isFetching;

  let empty: React.ReactElement | null = null;
  if (showSkeleton) empty = <SkeletonList count={4} />;
  else if (!hasData && offlineEmpty) empty = <EmptyState variant="offline" text="Les prix à corriger s’afficheront dès le retour du réseau." />;
  else if (loadError)
    empty = (
      <EmptyState
        icon="alert-circle-outline"
        title="Impossible d’afficher vos produits"
        text={loadErrorMessage(error)}
        primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => refetch() }}
      />
    );
  else if (hasData && products.length === 0)
    empty = (
      <EmptyState
        icon="cube-outline"
        title="Aucun produit pour l’instant"
        text={`Ajoutez vos produits : ceux sous ${objectiveText} de marge s’afficheront ici, avec le prix conseillé.`}
        primary={{ label: 'Ajouter un produit', icon: 'add', onPress: () => openProductForm(navigation) }}
      />
    );
  else if (hasData && rows.length === 0)
    empty = onlyIds ? (
      <EmptyState
        icon="checkmark-circle-outline"
        title={onlyIds.size > 1 ? 'Ces produits atteignent l’objectif' : 'Ce produit atteint l’objectif'}
        text={onlyIds.size > 1 ? `Aucun de ces ${plural(onlyIds.size, 'produit')} n’est sous ${objectiveText} de marge.` : `Il n’est pas sous ${objectiveText} de marge.`}
        primary={{ label: 'Voir tous les produits sous l’objectif', onPress: () => setOnlyIds(null) }}
      />
    ) : (
      <EmptyState
        icon="checkmark-circle-outline"
        title="Tout est à l’objectif"
        text={`Chaque service atteint ${objectiveText} de marge. Rien à corriger pour l’instant.`}
        primary={{ label: 'Voir mes produits', icon: 'grid-outline', onPress: done }}
      />
    );

  const listHeader =
    hasData && rows.length ? (
      <View style={styles.headerBox}>
        {onlyIds ? (
          <View style={styles.scope}>
            <Icon name="receipt-outline" size={18} color={palette.text2} />
            <Text style={styles.scopeText}>{onlyIds.size > 1 ? `Limité aux ${plural(onlyIds.size, 'produit')} de la facture` : 'Limité au produit de la facture'}</Text>
            <PressableScale onPress={() => setOnlyIds(null)} scaleTo="chip" accessibilityRole="button" accessibilityLabel="Voir tous les produits sous l’objectif" style={styles.scopeAction}>
              <Text style={styles.scopeActionText}>Tout voir</Text>
            </PressableScale>
          </View>
        ) : null}
        <ChipRow
          items={[
            { key: 'all', label: 'Tous', count: counts.all },
            {
              key: 'red',
              label: `<${NBSP}${formatPercent(t.medium, 0)}`,
              dot: marginColors.red.solid,
              count: counts.red,
              accessibilityLabel: `Sous ${formatNumber(t.medium, 0)} pour cent, ${counts.red}`,
            },
            {
              key: 'orange',
              label: `${formatNumber(t.medium, 0)}–${formatPercent(t.good, 0)}`,
              dot: marginColors.orange.solid,
              count: counts.orange,
              accessibilityLabel: `Entre ${formatNumber(t.medium, 0)} et ${formatNumber(t.good, 0)} pour cent, ${counts.orange}`,
            },
          ].filter((c) => c.key === 'all' || c.count > 0)}
          selectedKey={zone}
          onSelect={(k) => setZone(k as ZoneKey)}
          // Phones up to 390 px: the three chips (two with a dot) fit without scrolling.
          compact={width < 400}
          accessibilityLabel="Zones de marge"
        />
      </View>
    ) : null;

  const renderItem = useCallback(
    ({ item, index }: { item: TargetRow; index: number }) => (
      <FadeIn index={index}>
        <TargetRowCard
          row={item}
          thresholds={t}
          applied={appliedRef.current[item.key] ?? null}
          busy={busy.has(item.productId)}
          disabled={bulkBusy}
          narrow={narrow}
          onApply={onApplyRow}
          onUndo={onUndoRow}
          onOpen={onOpen}
        />
      </FadeIn>
    ),
    [t, applied, busy, bulkBusy, narrow, onApplyRow, onUndoRow, onOpen],
  );

  const showBar = hasData && rows.length > 0;
  const afterZone = summary.after !== null ? getMarginZone(summary.after, t) : 'green';
  // Bar states: prices to apply · all applied (« Terminé ») · only strong rises left (no button).
  let barSummary: React.ReactNode = null;
  let barZone: ReturnType<typeof getMarginZone> | undefined;
  if (bulkAll.length && summary.before !== null && summary.after !== null) {
    barSummary = `${plural(bulkAll.length, 'prix', 'prix')} · marge moy. ${formatNumber(summary.before, 1)} → ${formatPercent(summary.after)}`;
    barZone = afterZone;
  } else if (appliedVisible) {
    barSummary = `${plural(appliedVisible, 'prix appliqué', 'prix appliqués')}${summary.before !== null ? ` · marge moy. ${formatPercent(summary.before)}` : ''}`;
    barZone = summary.before !== null ? getMarginZone(summary.before, t) : undefined;
  } else if (guarded.length) {
    barSummary = `${plural(guarded.length, 'forte hausse', 'fortes hausses')} à vérifier`;
  }
  const guardNote = !guarded.length
    ? null
    : bulkAll.length
      ? guarded.length > 1
        ? `Sauf ${guarded.length} fortes hausses, à appliquer une par une`
        : `Sauf ${guarded[0].productName} (forte hausse, à part)`
      : guarded.length > 1
        ? `Restent ${guarded.length} fortes hausses, à appliquer une par une`
        : `Reste ${guarded[0].productName} : forte hausse, à appliquer seule`;
  const footer = showBar ? (
    <StickyActionBar
      summary={barSummary}
      summaryZone={barZone}
      primary={
        bulkAll.length
          ? {
              title: 'Tout appliquer',
              icon: 'checkmark-done',
              onPress: applyAll,
              loading: bulkBusy,
              // A row's own request first (it would be sent twice).
              disabled: !bulkBusy && (busy.size > 0 || !bulk.length),
              testID: 'ut-apply-all',
              accessibilityLabel: `Tout appliquer : ${plural(bulkAll.length, 'prix', 'prix')}`,
            }
          : appliedVisible
            ? { title: 'Terminé', icon: 'checkmark-circle', onPress: done, testID: 'ut-done' }
            : undefined
      }
    >
      {guardNote ? (
        <Text style={styles.barNote} testID="ut-guard-note">
          {bulkAll.length || appliedVisible
            ? guardNote
            : guarded.length > 1
              ? 'Vérifiez le prix d’achat, puis appliquez ces hausses une par une.'
              : `Vérifiez le prix d’achat, puis appliquez-la seule${guarded[0]?.guard?.threshold != null ? ' (ou visez le seuil)' : ''}.`}
        </Text>
      ) : null}
    </StickyActionBar>
  ) : undefined;

  return (
    <Screen scroll={false} header={header} stickyFooter={footer} testID="under-target">
      <ScreenList
        data={hasData ? visible : []}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        extraData={[applied, busy, bulkBusy]}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty ? <View style={styles.empty}>{empty}</View> : null}
        initialNumToRender={12}
        testID="under-target-list"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBox: { paddingTop: 12, paddingBottom: 14, gap: 12 },
  scope: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scopeText: { ...type.footnote, color: palette.text2, flex: 1 },
  scopeAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  scopeActionText: { ...type.footnoteStrong, color: palette.em700 },
  barNote: { ...type.footnote, color: palette.text2 },
  empty: { paddingTop: 24 },
});
