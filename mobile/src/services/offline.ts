import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';

const CACHE_PREFIX = 'margebar_cache_';
const PENDING_OPS_KEY = 'margebar_pending_ops';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Network state ---

let _isOnline = true;
let _listeners: Array<(online: boolean) => void> = [];
let _unsubNetInfo: (() => void) | null = null;

/** The browser's own flag (web only): always up to date, unlike the NetInfo event. */
function browserOffline(): boolean {
  if (Platform.OS !== 'web') return false;
  const nav = (globalThis as any).navigator;
  return !!nav && nav.onLine === false;
}

export function isOnline(): boolean {
  return _isOnline && !browserOffline();
}

/** Default message when a write is attempted without a connection. */
export const OFFLINE_MESSAGE = 'Pas de connexion : rien n’a été enregistré. Réessayez une fois connecté.';

/**
 * Thrown by writes that need the server (products, services) when the device is
 * offline. Writes are never queued silently: a queued product would get a fake id
 * and fail later (RC6), so the user gets an explicit, readable error instead.
 */
export class OfflineError extends Error {
  readonly code = 'offline';
  constructor(message: string = OFFLINE_MESSAGE) {
    super(message);
    this.name = 'OfflineError';
  }
}

/** Throws an OfflineError when there is no connection. */
export function assertOnline(message?: string): void {
  if (!isOnline()) throw new OfflineError(message);
}

/** True for « no connection » failures: OfflineError, or an HTTP call that got no response. */
export function isNetworkError(err: any): boolean {
  if (!err) return false;
  if (err instanceof OfflineError || err.code === 'offline') return true;
  if (err.isAxiosError && !err.response) return err.code !== 'ECONNABORTED' && err.code !== 'ETIMEDOUT';
  return err.message === 'Network Error' || err.code === 'ERR_NETWORK';
}

/** True when an HTTP call timed out (no answer in time). */
export function isTimeoutError(err: any): boolean {
  return !!err && !err.response && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(String(err.message ?? '')));
}

export function onConnectivityChange(cb: (online: boolean) => void) {
  _listeners.push(cb);
  return () => {
    _listeners = _listeners.filter((l) => l !== cb);
  };
}

function setOnline(next: boolean) {
  const wasOffline = !_isOnline;
  const changed = next !== _isOnline;
  _isOnline = next;
  if (changed) _listeners.forEach((cb) => cb(_isOnline));
  if (wasOffline && _isOnline) {
    syncPendingOperations().catch(() => {});
  }
}

let _unsubWeb: (() => void) | null = null;

export function initOfflineMode() {
  // Prevent double init
  if (_unsubNetInfo) return;
  _unsubNetInfo = NetInfo.addEventListener((state) => {
    // Web: trust the browser's connection flag. NetInfo's reachability probe
    // (a fetch to a Google URL) is unreliable from a PWA (blocked hosts,
    // captive networks) and could keep the app « offline » forever.
    setOnline(
      Platform.OS === 'web'
        ? state.isConnected !== false && !browserOffline()
        : !!(state.isConnected && state.isInternetReachable !== false),
    );
  });
  // Web: with `navigator.connection` NetInfo only listens to its `change`
  // event, which browsers do not fire for every online/offline switch.
  const w = (globalThis as any).window;
  if (Platform.OS === 'web' && w?.addEventListener) {
    const onChange = () => setOnline(!browserOffline());
    w.addEventListener('online', onChange);
    w.addEventListener('offline', onChange);
    _unsubWeb = () => {
      w.removeEventListener('online', onChange);
      w.removeEventListener('offline', onChange);
    };
  }
}

export function cleanupOfflineMode() {
  if (_unsubNetInfo) {
    _unsubNetInfo();
    _unsubNetInfo = null;
  }
  if (_unsubWeb) {
    _unsubWeb();
    _unsubWeb = null;
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

/**
 * The offline cache shares the origin's ~5 MB with things that must never fail
 * to save (the session, the product draft, the form preferences). So:
 * - full-size photos (`imageUrl`, up to 300 000 chars) are not cached — the
 *   160 px `thumbnailUrl` is, and the online fetch brings the photo back;
 * - all cache entries together stay under CACHE_BUDGET: the least recently
 *   written ones are evicted first.
 */
const CACHE_BUDGET = 1_500_000;
const CACHE_INDEX_KEY = `${CACHE_PREFIX}_index`;
const BIG_IMAGE = 40_000;

function slimItem(item: any): any {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  if (typeof item.imageUrl === 'string' && item.imageUrl.length > BIG_IMAGE) return { ...item, imageUrl: null };
  return item;
}
function slim<T>(data: T): T {
  return (Array.isArray(data) ? data.map(slimItem) : slimItem(data)) as T;
}

type CacheIndex = Record<string, { size: number; ts: number }>;
let indexChain: Promise<void> = Promise.resolve();

/** Index updates run one after another (two writes never lose each other's entry). */
function updateIndex(fn: (idx: CacheIndex) => Promise<void> | void): Promise<void> {
  indexChain = indexChain
    .then(async () => {
      let idx: CacheIndex = {};
      try {
        const raw = await AsyncStorage.getItem(CACHE_INDEX_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === 'object') idx = parsed;
      } catch {
        /* rebuilt from scratch */
      }
      await fn(idx);
      await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(idx));
    })
    .catch(() => {});
  return indexChain;
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const payload = JSON.stringify({ data: slim(data), timestamp: Date.now() });
    // A single entry above the whole budget is not worth caching.
    if (payload.length > CACHE_BUDGET) return;
    await AsyncStorage.setItem(CACHE_PREFIX + key, payload);
    await updateIndex(async (idx) => {
      idx[key] = { size: payload.length, ts: Date.now() };
      let total = Object.values(idx).reduce((a, e) => a + (e?.size ?? 0), 0);
      if (total <= CACHE_BUDGET) return;
      const victims = Object.entries(idx)
        .filter(([k]) => k !== key)
        .sort((a, b) => a[1].ts - b[1].ts);
      for (const [k, e] of victims) {
        if (total <= CACHE_BUDGET) break;
        await AsyncStorage.removeItem(CACHE_PREFIX + k).catch(() => {});
        total -= e?.size ?? 0;
        delete idx[k];
      }
    });
  } catch {
    // Silent fail on cache write — storage may be full
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
    await updateIndex((idx) => {
      delete idx[key];
    });
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
