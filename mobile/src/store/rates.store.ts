import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Rate, DEFAULT_RATES } from '@margebar/shared';
import { api } from '../services/api';

const CACHE_KEY = 'margebar_rates';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface CachedData {
  rates: Rate[];
  fetchedAt: number;
}

export interface RateChange {
  slug: string;
  acciseRate?: number;
  cotisationRate?: number;
}

interface RatesState {
  rates: Rate[];
  isLoading: boolean;
  /** When the rates were last fetched from the API (ms), null = never (fallback rates). */
  lastFetched: number | null;
  /** Cached or fresh rates; never throws (keeps the fallback offline). */
  loadRates: (force?: boolean) => Promise<void>;
  /** Fetches the official barème now. Throws when the API cannot be reached. */
  refresh: () => Promise<Rate[]>;
  getRate: (slug: string) => Rate | undefined;
  /** Admin: updates one rate (throws the API error). */
  updateRate: (slug: string, data: { acciseRate?: number; cotisationRate?: number }) => Promise<void>;
  /** Admin: updates several rates; returns the slugs that failed with their error. */
  saveRates: (changes: RateChange[]) => Promise<{ slug: string; error: unknown }[]>;
  /** Admin: restores the official 2026 values (throws the API error). */
  resetDefaults: () => Promise<void>;
}

async function persist(rates: Rate[], fetchedAt: number) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ rates, fetchedAt }));
  } catch {
    /* ignore */
  }
}

export const useRatesStore = create<RatesState>((set, get) => ({
  rates: DEFAULT_RATES, // start with hardcoded fallback
  isLoading: false,
  lastFetched: null,

  loadRates: async (force = false) => {
    if (!force) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const data: CachedData = JSON.parse(cached);
          if (Array.isArray(data.rates) && data.rates.length) set({ rates: data.rates, lastFetched: data.fetchedAt });
          if (Date.now() - data.fetchedAt < CACHE_TTL) return;
        }
      } catch { /* ignore */ }
    }
    try {
      await get().refresh();
    } catch {
      // API failed — keep cached / fallback rates
    }
  },

  refresh: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<Rate[]>('/rates');
      const rates = res.data;
      const now = Date.now();
      if (Array.isArray(rates) && rates.length > 0) {
        set({ rates, isLoading: false, lastFetched: now });
        await persist(rates, now);
        return rates;
      }
      set({ isLoading: false });
      return get().rates;
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  getRate: (slug: string) => {
    return get().rates.find((r) => r.slug === slug);
  },

  updateRate: async (slug: string, data: { acciseRate?: number; cotisationRate?: number }) => {
    const res = await api.put<Rate>(`/rates/${slug}`, data);
    const updated = res.data;
    set((state) => ({
      rates: state.rates.map((r) => (r.slug === slug ? updated : r)),
    }));
    await persist(get().rates, Date.now());
  },

  saveRates: async (changes: RateChange[]) => {
    const failed: { slug: string; error: unknown }[] = [];
    for (const { slug, ...data } of changes) {
      try {
        await get().updateRate(slug, data);
      } catch (error) {
        failed.push({ slug, error });
      }
    }
    return failed;
  },

  resetDefaults: async () => {
    const res = await api.put<Rate[]>('/rates/reset/defaults');
    const rates = (res.data ?? []).map((r: any) => ({
      ...r,
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date(r.updatedAt).toISOString(),
    })) as Rate[];
    const now = Date.now();
    if (rates.length) set({ rates, lastFetched: now });
    await persist(get().rates, now);
  },
}));
