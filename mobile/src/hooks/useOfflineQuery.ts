import { useQuery, UseQueryOptions, QueryKey } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getCached, setCache, isOnline, onConnectivityChange } from '../services/offline';

/** Retry network hiccups and 5xx twice; never retry a 4xx (it will not change). */
function defaultRetry(failureCount: number, error: any): boolean {
  const status = error?.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

/**
 * A wrapper around useQuery that caches results for offline use.
 * When offline, returns cached data. When online, fetches fresh data and updates cache.
 *
 * For data that must never be stale (a product being edited, its services),
 * pass `{ staleTime: 0, refetchOnMount: 'always' }` and wait for
 * `isFetchedAfterMount` before trusting `data` (RC3).
 */
export function useOfflineQuery<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  // Stable cache key using JSON serialization to avoid collisions
  const cacheKey = JSON.stringify(queryKey);
  const [online, setOnline] = useState(isOnline());
  const [cachedData, setCachedData] = useState<T | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Monitor connectivity
  useEffect(() => {
    return onConnectivityChange((state) => {
      if (mountedRef.current) setOnline(state);
    });
  }, []);

  // Load from cache on mount — only used while the query has no data yet
  useEffect(() => {
    let cancelled = false;
    setCachedData(undefined);
    getCached<T>(cacheKey).then((data) => {
      if (data && !cancelled && mountedRef.current) {
        setCachedData(data);
      }
    });
    return () => { cancelled = true; };
  }, [cacheKey]);

  const query = useQuery<T>({
    queryKey,
    queryFn: async () => {
      const data = await queryFn();
      // Update cache on successful fetch (never blocks the result)
      setCache(cacheKey, data).catch(() => {});
      return data;
    },
    retry: online ? defaultRetry : false,
    ...options,
    enabled: online && (options?.enabled !== false),
  });

  // Prefer fresh query data over cached data (avoids race condition)
  const data = query.data ?? cachedData ?? (options as any)?.initialData;

  return {
    ...query,
    data: data as T,
    isOffline: !online,
    isCachedData: !query.data && !!cachedData,
  };
}
