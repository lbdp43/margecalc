/**
 * Product actions shared by « Mes produits » and the product detail:
 * duplicate (client-side copy with its services and photo) and delete
 * (destructive dialog → DELETE → caches → toast).
 *
 * Every failure shows the backend's French `error` as is; offline is refused
 * up front with a clear sentence (no silent queue, no fake id — RC6).
 */
import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { CreateProductInput, ProductWithMargin } from '@margebar/shared';
import { dialog, toast, sortedServings } from '../../../components/ui';
import { haptics } from '../../../theme/haptics';
import * as productService from '../../../services/product.service';
import { isOnline } from '../../../services/offline';
import { plural } from '../../../utils/format';

export const OFFLINE_MESSAGE = 'Pas de connexion : réessayez une fois connecté.';
const OFFLINE_DUPLICATE = 'Pas de connexion : la copie n’a pas été créée. Réessayez une fois connecté.';
const OFFLINE_DELETE = 'Pas de connexion : le produit n’a pas été supprimé. Réessayez une fois connecté.';

/** True when the device can reach the API (NetInfo + the browser's own flag). */
export function canReachNetwork(): boolean {
  if (!isOnline()) return false;
  if (Platform.OS === 'web' && (globalThis as any).navigator?.onLine === false) return false;
  return true;
}

/** The backend's readable French message, else a calm fallback. */
export function apiErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  if (data && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  if (err?.code === 'ECONNABORTED') return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
  if (err && !err.response && (err.message === 'Network Error' || err.isAxiosError)) {
    return 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.';
  }
  return fallback;
}

/** HTTP status of an axios error (undefined for network failures). */
export function apiStatus(err: any): number | undefined {
  return err?.response?.status;
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

  const duplicate = useCallback<ProductActionsApi['duplicate']>(
    async (product, opts) => {
      if (busy.current.has(`dup-${product.id}`)) return null;
      if (!canReachNetwork()) {
        toast.error(OFFLINE_DUPLICATE);
        return null;
      }
      busy.current.add(`dup-${product.id}`);
      try {
        // The detail carries the full photo and the services.
        const full = await productService.getProduct(product.id);
        const list = queryClient.getQueryData<ProductWithMargin[]>(['products']) ?? [];
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
        // Show it at once (recent first), then reconcile with the server.
        queryClient.setQueryData<ProductWithMargin[]>(['products'], (old) => (old ? [created, ...old.filter((p) => p.id !== created.id)] : old));
        queryClient.invalidateQueries({ queryKey: ['products'] });
        haptics.success();
        toast.success(`${name} créé`, opts?.onOpen ? { action: { label: 'Voir', onPress: () => opts.onOpen?.(created.id) } } : undefined);
        return created;
      } catch (err) {
        toast.error(apiErrorMessage(err, 'La copie n’a pas pu être créée. Réessayez.'));
        return null;
      } finally {
        busy.current.delete(`dup-${product.id}`);
      }
    },
    [queryClient],
  );

  const remove = useCallback<ProductActionsApi['remove']>(
    async (product, opts) => {
      if (busy.current.has(`del-${product.id}`)) return false;
      const n = product.servings?.length ?? 0;
      const ok = await dialog.confirm({
        title: 'Supprimer ce produit ?',
        message:
          n > 0
            ? `${product.name} et ${n > 1 ? `ses ${plural(n, 'service')}` : 'son service'} seront supprimés. Cette action est définitive.`
            : `${product.name} sera supprimé. Cette action est définitive.`,
        confirmLabel: 'Supprimer',
        destructive: true,
      });
      if (!ok) return false;
      opts?.onConfirmed?.();
      if (!canReachNetwork()) {
        toast.error(OFFLINE_DELETE);
        return false;
      }
      busy.current.add(`del-${product.id}`);
      try {
        await productService.deleteProduct(product.id);
      } catch (err) {
        // Already gone (deleted elsewhere): treat as done.
        if (apiStatus(err) !== 404) {
          toast.error(apiErrorMessage(err, 'Le produit n’a pas pu être supprimé. Réessayez.'));
          busy.current.delete(`del-${product.id}`);
          return false;
        }
      }
      opts?.beforeCacheUpdate?.();
      queryClient.removeQueries({ queryKey: ['product', product.id] });
      queryClient.removeQueries({ queryKey: ['productServings', product.id] });
      queryClient.removeQueries({ queryKey: ['priceHistory', product.id] });
      queryClient.setQueryData<ProductWithMargin[]>(['products'], (old) => (old ? old.filter((p) => p.id !== product.id) : old));
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(`${product.name} supprimé`);
      busy.current.delete(`del-${product.id}`);
      return true;
    },
    [queryClient],
  );

  return { duplicate, remove };
}
