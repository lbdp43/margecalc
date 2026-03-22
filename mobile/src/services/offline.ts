import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const CACHE_PREFIX = 'margebar_cache_';
const PENDING_OPS_KEY = 'margebar_pending_ops';

// --- Network state ---

let _isOnline = true;
let _listeners: Array<(online: boolean) => void> = [];

export function isOnline(): boolean {
  return _isOnline;
}

export function onConnectivityChange(cb: (online: boolean) => void) {
  _listeners.push(cb);
  return () => {
    _listeners = _listeners.filter((l) => l !== cb);
  };
}

// Initialize connectivity monitoring
export function initOfflineMode() {
  NetInfo.addEventListener((state) => {
    const wasOffline = !_isOnline;
    _isOnline = !!(state.isConnected && state.isInternetReachable !== false);
    _listeners.forEach((cb) => cb(_isOnline));

    // Auto-sync when coming back online
    if (wasOffline && _isOnline) {
      syncPendingOperations();
    }
  });
}

// --- Cache layer ---

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    return data as T;
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, timestamp: Date.now() }),
    );
  } catch {
    // Silent fail on cache write
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // Silent fail
  }
}

// --- Pending operations queue (for offline writes) ---

interface PendingOperation {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  body?: any;
  createdAt: number;
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

export async function queueOperation(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: any,
): Promise<void> {
  const ops = await getPendingOps();
  ops.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    method,
    url,
    body,
    createdAt: Date.now(),
  });
  await savePendingOps(ops);
}

export async function syncPendingOperations(): Promise<{ synced: number; failed: number }> {
  const ops = await getPendingOps();
  if (ops.length === 0) return { synced: 0, failed: 0 };

  // Dynamic import to avoid circular dependency
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
    } catch {
      failed++;
      remaining.push(op);
    }
  }

  await savePendingOps(remaining);
  return { synced, failed };
}

export async function getPendingCount(): Promise<number> {
  const ops = await getPendingOps();
  return ops.length;
}
