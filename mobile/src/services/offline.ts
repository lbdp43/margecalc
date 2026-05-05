import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const CACHE_PREFIX = 'margebar_cache_';
const PENDING_OPS_KEY = 'margebar_pending_ops';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Network state ---

let _isOnline = true;
let _listeners: Array<(online: boolean) => void> = [];
let _unsubNetInfo: (() => void) | null = null;

export function isOnline(): boolean {
  return _isOnline;
}

export function onConnectivityChange(cb: (online: boolean) => void) {
  _listeners.push(cb);
  return () => {
    _listeners = _listeners.filter((l) => l !== cb);
  };
}

export function initOfflineMode() {
  // Prevent double init
  if (_unsubNetInfo) return;
  _unsubNetInfo = NetInfo.addEventListener((state) => {
    const wasOffline = !_isOnline;
    _isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    _listeners.forEach((cb) => cb(_isOnline));

    if (wasOffline && _isOnline) {
      syncPendingOperations();
    }
  });
}

export function cleanupOfflineMode() {
  if (_unsubNetInfo) {
    _unsubNetInfo();
    _unsubNetInfo = null;
  }
  _listeners = [];
}

// --- Cache layer with TTL ---

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    // Invalidate stale cache
    if (Date.now() - timestamp > CACHE_MAX_AGE_MS) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const payload = JSON.stringify({ data, timestamp: Date.now() });
    // Guard against storing excessively large items (>2MB)
    if (payload.length > 2 * 1024 * 1024) return;
    await AsyncStorage.setItem(CACHE_PREFIX + key, payload);
  } catch {
    // Silent fail on cache write — storage may be full
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // Silent fail
  }
}

/**
 * Clear all offline cache and pending ops — call on logout.
 */
export async function clearAllOfflineData(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
    await AsyncStorage.removeItem(PENDING_OPS_KEY);
  } catch {
    // Silent fail
  }
}

// --- Pending operations queue ---

interface PendingOperation {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: any;
  createdAt: number;
  retries: number;
}

async function getPendingOps(): Promise<PendingOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_OPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function savePendingOps(ops: PendingOperation[]): Promise<void> {
  await AsyncStorage.setItem(PENDING_OPS_KEY, JSON.stringify(ops));
}

const MAX_PENDING_OPS = 100;

export async function queueOperation(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: any,
): Promise<void> {
  const ops = await getPendingOps();
  // Prevent unbounded queue growth
  if (ops.length >= MAX_PENDING_OPS) {
    throw new Error('Trop d\'opérations en attente. Reconnectez-vous pour synchroniser.');
  }

  // Deduplicate: remove prior op on same URL+method (last-write-wins)
  const filtered = ops.filter((o) => !(o.url === url && o.method === method));

  filtered.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    method,
    url,
    body,
    createdAt: Date.now(),
    retries: 0,
  });
  await savePendingOps(filtered);
}

const MAX_RETRIES = 5;

export async function syncPendingOperations(): Promise<{ synced: number; failed: number }> {
  const ops = await getPendingOps();
  if (ops.length === 0) return { synced: 0, failed: 0 };

  const { api } = require('./api');
  let synced = 0;
  let failed = 0;
  const remaining: PendingOperation[] = [];

  for (const op of ops) {
    try {
      switch (op.method) {
        case 'POST':
          await api.post(op.url, op.body);
          break;
        case 'PUT':
          await api.put(op.url, op.body);
          break;
        case 'DELETE':
          await api.delete(op.url);
          break;
      }
      synced++;
    } catch (err: any) {
      const status = err?.response?.status;
      // Don't retry client errors (400, 401, 403, 404, 422) — they won't resolve
      if (status && status >= 400 && status < 500) {
        failed++;
        // Drop the op — it's permanently failed
        continue;
      }
      // Server errors or network — retry with limit
      op.retries++;
      if (op.retries < MAX_RETRIES) {
        remaining.push(op);
      }
      failed++;
    }
  }

  await savePendingOps(remaining);
  return { synced, failed };
}

export async function getPendingCount(): Promise<number> {
  const ops = await getPendingOps();
  return ops.length;
}
