/**
 * Product actions shared by « Mes produits » and the product detail:
 * duplicate (client-side copy with its services and photo) and delete
 * (destructive dialog → DELETE → caches → toast).
 *
 * Write failures go through the form group's `describeSaveError` (the
 * backend's French `error` as is, then offline / timeout / status sentences),
 * so a save and a delete read the same everywhere. Offline is refused up front
 * with a clear sentence (no silent queue, no fake id — RC6).
 */
import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CreateProductInput, ProductWithMargin } from '@margebar/shared';
import { dialog, toast, sortedServings } from '../../../components/ui';
import { haptics } from '../../../theme/haptics';
import * as productService from '../../../services/product.service';
import { clearCache, isOnline, isNetworkError, isTimeoutError } from '../../../services/offline';
import { plural } from '../../../utils/format';
import { describeSaveError } from '../form/errors';

const OFFLINE_DUPLICATE = 'Pas de connexion : la copie n’a pas été créée. Réessayez une fois connecté.';
const OFFLINE_DELETE = 'Pas de connexion : le produit n’a pas été supprimé. Réessayez une fois connecté.';

/** HTTP status of an axios error (undefined for network failures). */
export function apiStatus(err: any): number | undefined {
  return err?.response?.status;
}

/**
 * A failed write (save, delete) as one readable sentence, from the same helper
 * the product form uses. Offline keeps its « Pas de connexion : … » lead-in,
 * since a toast has no separate title.
 */
export function writeErrorMessage(err: any, action: 'save' | 'delete' = 'save'): string {
  const info = describeSaveError(err, action);
  if (!info.offline) return info.message;
  return `Pas de connexion : ${info.message.charAt(0).toLowerCase()}${info.message.slice(1)}`;
}

/** Why a list or a detail could not be loaded: the backend's sentence, else a calm one. */
export function loadErrorMessage(err: any): string {
  const said = err?.response?.data?.error;
  if (typeof said === 'string' && said.trim()) return said.trim();
  if (isTimeoutError(err)) return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
  if (!err?.response && isNetworkError(err)) return 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.';
  return 'Le serveur ne répond pas. Réessayez dans un instant.';
}

/**
 * Show a result toast at once: a toast still waiting (hidden behind a sheet or
 * a dialog, or a 5 s action toast) is dropped instead of queueing in front.
 */
export function freshToast(kind: 'success' | 'error' | 'info', message: string, opts?: Parameters<typeof toast.success>[1]) {
  toast.clear();
  toast[kind](message, opts);
}

const COPY_RE = /\s*\(copie(?:\s+\d+)?\)\s*$/i;
const NAME_MAX = 200;

/** « Hendrick’s Gin (copie) », then « (copie 2) »… never longer than the API limit. */
export function copyName(name: string, existing: ReadonlyArray<string>): string {
  const base = name.replace(COPY_RE, '').trim() || name.trim();
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  for (let i = 1; i < 100; i++) {
    const suffix = i === 1 ? ' (copie)' : ` (copie ${i})`;
    const candidate = `${base.slice(0, NAME_MAX - suffix.length).trim()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, NAME_MAX - 8).trim()} (copie)`;
}

type ProductLike = Pick<ProductWithMargin, 'id' | 'name'> & Partial<Pick<ProductWithMargin, 'servings'>>;

export interface ProductActionsApi {
  /** Copy the product and its services. Resolves with the new product, or null on failure. */
  duplicate: (product: ProductLike, opts?: { onOpen?: (id: string) => void }) => Promise<ProductWithMargin | null>;
  /** Ask, then delete. Resolves true when the product was deleted. */
  remove: (product: ProductLike, opts?: { onConfirmed?: () => void; beforeCacheUpdate?: () => void }) => Promise<boolean>;
}

export function useProductActions(): ProductActionsApi {
  const queryClient = useQueryClient();
  const busy = useRef<Set<string>>(new Set());

  /** False only when the list is loaded and no longer has this product (deleted since). */
  const stillListed = useCallback(
    (id: string) => {
      const list = queryClient.getQueryData<ProductWithMargin[]>(productService.productKeys.list);
      return !list || list.some((p) => p.id === id);
    },
    [queryClient],
  );

  const duplicate = useCallback<ProductActionsApi['duplicate']>(
    async (product, opts) => {
      const key = `dup-${product.id}`;
      if (busy.current.has(key)) return null;
      if (!isOnline()) {
        freshToast('error', OFFLINE_DUPLICATE);
        return null;
      }
      busy.current.add(key);
      try {
        // The detail carries the full photo and the services.
        const full = await productService.getProduct(product.id);
        const list = queryClient.getQueryData<ProductWithMargin[]>(productService.productKeys.list) ?? [];
        const name = copyName(full.name, list.map((p) => p.name));
        const servings = sortedServings(full).map((s) => ({ servingTypeId: s.servingTypeId, sellingPriceTTC: s.sellingPriceTTC }));
        const body: CreateProductInput = {
          name,
          categoryId: full.categoryId,
          purchasePriceHT: full.purchasePriceHT,
          containerVolumeCl: full.containerVolumeCl,
          doseVolumeCl: full.doseVolumeCl,
          marginMode: full.marginMode,
          sellingPriceTTC: full.sellingPriceTTC ?? undefined,
          targetMarginPercent: full.targetMarginPercent ?? undefined,
          coefficient: full.coefficient ?? undefined,
          tvaRate: full.tvaRate,
          alcoholDegree: full.alcoholDegree ?? 0,
          supplier: full.supplier ?? null,
          imageUrl: full.imageUrl ?? null,
          thumbnailUrl: full.thumbnailUrl ?? null,
          ...(servings.length ? { servings } : {}),
        };
        const created = await productService.createProduct(body);
        // Show it at once (the list keeps its sort), then reconcile with the server.
        // The list never carries the full photo (GET /api/products has no imageUrl).
        const listed = { ...created, imageUrl: undefined, hasImage: !!(created.imageUrl || created.thumbnailUrl) } as ProductWithMargin;
        queryClient.setQueryData<ProductWithMargin[]>(productService.productKeys.list, (old) =>
          old ? [listed, ...old.filter((p) => p.id !== created.id)] : old,
        );
        queryClient.invalidateQueries({ queryKey: productService.productKeys.list });
        haptics.success();
        const onOpen = opts?.onOpen;
        freshToast(
          'success',
          `${name} créé`,
          onOpen
            ? {
                action: {
                  label: 'Voir',
                  onPress: () => {
                    // Deleted in the meantime (here or on another device): never open a 404.
                    if (stillListed(created.id)) onOpen(created.id);
                    else toast.info(`${name} a été supprimé`);
                  },
                },
              }
            : undefined,
        );
        return created;
      } catch (err) {
        freshToast('error', writeErrorMessage(err, 'save'));
        return null;
      } finally {
        busy.current.delete(key);
      }
    },
    [queryClient, stillListed],
  );

  const remove = useCallback<ProductActionsApi['remove']>(
    async (product, opts) => {
      const key = `del-${product.id}`;
      // A second tap while the dialog is open (or the request runs) does nothing.
      if (busy.current.has(key)) return false;
      busy.current.add(key);
      try {
        // A toast waiting behind the sheet (« … créé · Voir ») must not come back after the dialog.
        toast.clear();
        const n = product.servings?.length ?? 0;
        haptics.warning();
        // Not dismissible from the scrim: the second tap of a quick double tap on
        // « Supprimer » lands there and would close the dialog at once.
        const answer = await dialog.show<boolean>({
          title: 'Supprimer ce produit ?',
          message:
            n > 0
              ? `${product.name} et ${n > 1 ? `ses ${plural(n, 'service')}` : 'son service'} seront supprimés. Cette action est définitive.`
              : `${product.name} sera supprimé. Cette action est définitive.`,
          icon: 'trash-outline',
          tone: 'bad',
          dismissible: false,
          actions: [
            { label: 'Supprimer', value: true, style: 'destructive' },
            { label: 'Annuler', value: false, style: 'cancel' },
          ],
        });
        if (answer !== true) return false;
        opts?.onConfirmed?.();
        if (!isOnline()) {
          freshToast('error', OFFLINE_DELETE);
          return false;
        }
        try {
          await productService.deleteProduct(product.id);
        } catch (err) {
          // Already gone (deleted elsewhere): treat as done.
          if (apiStatus(err) !== 404) {
            freshToast('error', writeErrorMessage(err, 'delete'));
            return false;
          }
        }
        opts?.beforeCacheUpdate?.();
        queryClient.setQueryData<ProductWithMargin[]>(productService.productKeys.list, (old) =>
          old ? old.filter((p) => p.id !== product.id) : old,
        );
        // Memory and offline caches (detail, services), then the list refetch.
        productService.forgetProduct(queryClient, product.id);
        clearCache(JSON.stringify(productService.productKeys.priceHistory(product.id))).catch(() => {});
        freshToast('success', `${product.name} supprimé`);
        return true;
      } finally {
        busy.current.delete(key);
      }
    },
    [queryClient],
  );

  return { duplicate, remove };
}
