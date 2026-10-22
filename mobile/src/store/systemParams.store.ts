import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_MARGIN_THRESHOLDS, SystemParam } from '@margebar/shared';
import { api } from '../services/api';
import { useAuthStore } from './auth.store';
import {
  MARGIN_THRESHOLDS_KEY,
  MarginThresholds,
  getMarginThresholds,
  setMarginThresholds,
} from '../utils/marginThresholds';

const CACHE_KEY = 'margebar_system_params';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface CachedData {
  params: SystemParam[];
  fetchedAt: number;
}

interface SystemParamsState {
  params: SystemParam[];
  isLoading: boolean;
  lastFetched: number | null;
  loadParams: (force?: boolean) => Promise<void>;
  getParam: (key: string) => string | null;
  getParamNum: (key: string) => number;
  updateParam: (key: string, value: string) => Promise<void>;
  /** Admin: saves several params; returns the keys that failed with their error. */
  updateParams: (values: Record<string, string>) => Promise<{ key: string; error: unknown }[]>;
}

export const useSystemParamsStore = create<SystemParamsState>((set, get) => ({
  params: [],
  isLoading: false,
  lastFetched: null,

  loadParams: async (force = false) => {
    // Try cache first (skip if forced)
    if (!force) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const data: CachedData = JSON.parse(cached);
          set({ params: data.params, lastFetched: data.fetchedAt });
          // If cache is still fresh, don't refetch
          if (Date.now() - data.fetchedAt < CACHE_TTL) {
            return;
          }
        }
      } catch {
        // ignore cache read errors
      }
    }

    // Fetch from API
    set({ isLoading: true });
    try {
      const res = await api.get('/system-params');
      const params: SystemParam[] = res.data;
      const now = Date.now();
      set({ params, isLoading: false, lastFetched: now });
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ params, fetchedAt: now }));
    } catch (err) {
      console.warn('[SystemParams] Failed to fetch:', err);
      set({ isLoading: false });
    }
  },

  getParam: (key: string) => {
    const param = get().params.find((p) => p.key === key);
    return param?.value ?? null;
  },

  getParamNum: (key: string) => {
    const val = get().getParam(key);
    if (val === null) return 0;
    return parseFloat(val) || 0;
  },

  updateParam: async (key: string, value: string) => {
    const res = await api.put(`/system-params/${key}`, { value });
    const updated: SystemParam = res.data;
    set((state) => ({
      params: state.params.map((p) => (p.key === key ? updated : p)),
    }));
    // Update cache
    const state = get();
    try {
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ params: state.params, fetchedAt: Date.now() }),
      );
    } catch {
      // ignore cache write errors
    }
  },

  updateParams: async (values: Record<string, string>) => {
    const failed: { key: string; error: unknown }[] = [];
    for (const [key, value] of Object.entries(values)) {
      try {
        await get().updateParam(key, value);
      } catch (error) {
        failed.push({ key, error });
      }
    }
    return failed;
  },
}));

// ─── Margin objectives, kept per account on this device ────────────────────
//
// Réglages → « Objectifs de marge » lives on the device (AsyncStorage
// `margebar_margin_thresholds`, read by utils/marginThresholds), but it
// belongs to the account that set it:
//   - each account keeps its own copy under `margebar_margin_thresholds:<userId>`;
//   - on every sign-out (Réglages, or forced by the API on a 401) that copy is
//     brought up to date, then the device falls back to the defaults, so the
//     next account starts from 65 % / 50 %;
//   - on every sign-in (login, register, or the stored session at launch) the
//     account's copy is put back before anything is coloured.
// `margebar_margin_thresholds_owner` names the account the device copy belongs
// to, so a copy left by someone else is never handed to the next account.
// This module is loaded at launch (RootNavigator imports it), so the binding
// below sees every change of account.

const THRESHOLDS_OWNER_KEY = 'margebar_margin_thresholds_owner';

/** AsyncStorage key of one account's margin objectives on this device. */
export const accountThresholdsKey = (userId: string) => `${MARGIN_THRESHOLDS_KEY}:${userId}`;

function parseThresholds(raw: string | null): MarginThresholds | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw);
    const good = Number(t?.good);
    const medium = Number(t?.medium);
    return isFinite(good) && isFinite(medium) && good > 0 && medium > 0 ? { good, medium } : null;
  } catch {
    return null;
  }
}

const getItem = (key: string) => AsyncStorage.getItem(key).catch(() => null);
const setItem = (key: string, value: string) => AsyncStorage.setItem(key, value).catch(() => {});
const removeItem = (key: string) => AsyncStorage.removeItem(key).catch(() => {});

/** Account whose objectives are the live ones on the device (null when signed out). */
let boundUserId: string | null = null;

async function restoreAccountThresholds(userId: string) {
  const [owner, device, saved] = await Promise.all([
    getItem(THRESHOLDS_OWNER_KEY),
    getItem(MARGIN_THRESHOLDS_KEY),
    getItem(accountThresholdsKey(userId)),
  ]);
  const deviceValue = parseThresholds(device);
  const savedValue = parseThresholds(saved);
  // The device copy is the freshest one when it is this account's. A copy
  // with no owner predates per-account storage: it is adopted only by an
  // account that has no copy of its own yet (the one that was signed in).
  const useDevice = !!deviceValue && (owner === userId || (!owner && !savedValue));
  const next = (useDevice ? deviceValue : savedValue) ?? { ...DEFAULT_MARGIN_THRESHOLDS };
  boundUserId = userId;
  await setMarginThresholds(next);
  await Promise.all([
    setItem(THRESHOLDS_OWNER_KEY, userId),
    setItem(accountThresholdsKey(userId), JSON.stringify(getMarginThresholds())),
  ]);
}

async function releaseAccountThresholds(userId: string) {
  // Keep this account's objectives for its next sign-in…
  if (boundUserId === userId) {
    await setItem(accountThresholdsKey(userId), JSON.stringify(getMarginThresholds()));
  }
  boundUserId = null;
  // …and give whoever signs in next on this device the defaults.
  await setMarginThresholds({ ...DEFAULT_MARGIN_THRESHOLDS });
  await Promise.all([removeItem(MARGIN_THRESHOLDS_KEY), removeItem(THRESHOLDS_OWNER_KEY)]);
}

/**
 * Saves the margin objectives (Réglages) on the device and in the signed-in
 * account's own copy. Use it instead of `setMarginThresholds` from screens.
 */
export async function saveMarginObjectives(next: MarginThresholds): Promise<void> {
  await setMarginThresholds(next);
  const userId = boundUserId ?? useAuthStore.getState().user?.id ?? null;
  if (userId) await setItem(accountThresholdsKey(userId), JSON.stringify(getMarginThresholds()));
}

// Account changes are handled one at a time, in order (a sign-out then a
// sign-in in quick succession must not interleave their storage writes).
let thresholdsQueue: Promise<void> = Promise.resolve();
let seenUserId: string | null | undefined;

function onAccountChange(userId: string | null) {
  if (userId === seenUserId) return;
  const previous = seenUserId;
  seenUserId = userId;
  if (previous) thresholdsQueue = thresholdsQueue.then(() => releaseAccountThresholds(previous)).catch(() => {});
  if (userId) thresholdsQueue = thresholdsQueue.then(() => restoreAccountThresholds(userId)).catch(() => {});
}

useAuthStore.subscribe((state) => onAccountChange(state.user?.id ?? null));
onAccountChange(useAuthStore.getState().user?.id ?? null);
