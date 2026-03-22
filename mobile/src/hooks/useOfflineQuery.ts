import { useQuery, UseQueryOptions, QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
  const cacheKey = Array.isArray(queryKey) ? queryKey.join('_') : String(queryKey);
  const [online, setOnline] = useState(isOnline());
  const [cachedData, setCachedData] = useState<T | undefined>(undefined);

  // Monitor connectivity
  useEffect(() => {
    return onConnectivityChange(setOnline);
  }, []);

  // Load from cache on mount
  useEffect(() => {
    getCached<T>(cacheKey).then((data) => {
      if (data) setCachedData(data);
    });
  }, [cacheKey]);

  const query = useQuery<T>({
    queryKey,
    queryFn: async () => {
      const data = await queryFn();
      // Update cache on successful fetch
      await setCache(cacheKey, data);
      setCachedData(data);
      return data;
    },
    ...options,
    enabled: online && (options?.enabled !== false),
    retry: online ? 2 : 0,
  });

  // When offline and no fresh data, use cached data
  const data = query.data ?? cachedData ?? (options as any)?.initialData;

  return {
    ...query,
    data: data as T,
    isOffline: !online,
    isCachedData: !query.data && !!cachedData,
  };
}
