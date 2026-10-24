/**
 * Offline cache of the product detail WITHOUT its full photo.
 *
 * `useOfflineQuery` persists whatever its query returns, and the detail
 * (GET /api/products/:id) carries `imageUrl`, a data URI of up to 300 000
 * characters. One copy per opened product filled the web origin's ~5 M
 * localStorage quota after about 20 photos, after which every AsyncStorage
 * write failed silently (the list cache, the sort, the auth tokens).
 *
 * This query keeps the full product in memory (the screen shows the photo) but
 * persists only the fields and the small thumbnail. `pruneDetailCaches()` slims
 * or drops the copies an earlier version left behind.
 */
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryKey, useQuery, UseQueryOptions } from '@tanstack/react-query';
import type { ProductWithMargin } from '@margebar/shared';
import { getCached, isOnline, onConnectivityChange, setCache } from '../../../services/offline';

/** Same prefix and lifetime as services/offline (cache entries are `{ data, timestamp }`). */
const CACHE_PREFIX = 'margebar_cache_';
const DETAIL_PREFIX = `${CACHE_PREFIX}["product",`;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** A stripped detail is a few thousand characters; anything far bigger still holds a photo. */
const BLOATED = 60_000;

/** What is kept offline: everything but the full photo. */
export function persistableProduct(p: ProductWithMargin): ProductWithMargin {
  if (!p || typeof p !== 'object') return p;
  const { imageUrl, ...rest } = p as ProductWithMargin & { imageUrl?: string | null };
  return { ...rest, hasImage: !!(imageUrl || p.thumbnailUrl || p.hasImage) } as ProductWithMargin;
}

function defaultRetry(failureCount: number, error: any): boolean {
  const status = error?.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

/**
 * `useOfflineQuery` with a persist transform: same online gating, retry policy
 * and cached fallback, but `persist(data)` is what reaches storage.
 */
export function useLeanOfflineQuery<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  persist: (data: T) => unknown,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  const cacheKey = JSON.stringify(queryKey);
  const [online, setOnline] = useState(isOnline());
  const [cachedData, setCachedData] = useState<T | undefined>(undefined);
  const mounted = useRef(true);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => onConnectivityChange((state) => mounted.current && setOnline(state)), []);
  useEffect(() => {
    let cancelled = false;
    setCachedData(undefined);
    getCached<T>(cacheKey).then((d) => {
      if (d && !cancelled && mounted.current) setCachedData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const query = useQuery<T>({
    queryKey,
    queryFn: async () => {
      const data = await queryFn();
      setCache(cacheKey, persistRef.current(data)).catch(() => {});
      return data;
    },
    retry: online ? defaultRetry : false,
    ...options,
    enabled: online && options?.enabled !== false,
  });

  return {
    ...query,
    data: (query.data ?? cachedData) as T,
    isOffline: !online,
    isCachedData: !query.data && !!cachedData,
  };
}

let pruned = false;

/**
 * Once per app run: slim the persisted product details that still hold a full
 * photo, and drop the expired ones (a deleted product's copy is never read
 * again, so it would never expire on its own).
 */
export async function pruneDetailCaches(): Promise<void> {
  if (pruned) return;
  pruned = true;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(DETAIL_PREFIX));
    if (!keys.length) return;
    const entries = await AsyncStorage.multiGet(keys);
    const drop: string[] = [];
    const slim: [string, string][] = [];
    for (const [key, raw] of entries) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { data?: ProductWithMargin; timestamp?: number };
        if (!parsed?.timestamp || Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) drop.push(key);
        else if (raw.length > BLOATED && parsed.data) slim.push([key, JSON.stringify({ data: persistableProduct(parsed.data), timestamp: parsed.timestamp })]);
      } catch {
        drop.push(key);
      }
    }
    if (drop.length) await AsyncStorage.multiRemove(drop);
    if (slim.length) await AsyncStorage.multiSet(slim);
  } catch {
    // Storage unavailable (private window): nothing to prune.
  }
}
