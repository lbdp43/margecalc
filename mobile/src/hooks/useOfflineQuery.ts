import { useQuery, UseQueryOptions, QueryKey } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getCached, setCache, isOnline, onConnectivityChange } from '../services/offline';

/**
 * A wrapper around useQuery that caches results for offline use.
 * When offline, returns cached data. When online, fetches fresh data and updates cache.
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

  // Load from cache on mount — only use if query hasn't returned data yet
  useEffect(() => {
    let cancelled = false;
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
      // Update cache on successful fetch
      await setCache(cacheKey, data);
      return data;
    },
    ...options,
    enabled: online && (options?.enabled !== false),
    retry: online ? 2 : 0,
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
