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

interface RatesState {
  rates: Rate[];
  isLoading: boolean;
  loadRates: (force?: boolean) => Promise<void>;
  getRate: (slug: string) => Rate | undefined;
  updateRate: (slug: string, data: { acciseRate?: number; cotisationRate?: number }) => Promise<void>;
  resetDefaults: () => Promise<void>;
}

export const useRatesStore = create<RatesState>((set, get) => ({
  rates: DEFAULT_RATES, // start with hardcoded fallback
  isLoading: false,

  loadRates: async (force = false) => {
    if (!force) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const data: CachedData = JSON.parse(cached);
          set({ rates: data.rates });
          if (Date.now() - data.fetchedAt < CACHE_TTL) return;
        }
      } catch { /* ignore */ }
    }

    set({ isLoading: true });
    try {
      const res = await api.get('/rates');
      const rates: Rate[] = res.data;
      if (rates.length > 0) {
        set({ rates, isLoading: false });
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ rates, fetchedAt: Date.now() }));
      } else {
        set({ isLoading: false });
      }
    } catch {
      // API failed — keep fallback rates
      set({ isLoading: false });
    }
  },

  getRate: (slug: string) => {
    return get().rates.find((r) => r.slug === slug);
  },

  updateRate: async (slug: string, data: { acciseRate?: number; cotisationRate?: number }) => {
    const res = await api.put(`/rates/${slug}`, data);
    const updated: Rate = res.data;
    set((state) => ({
      rates: state.rates.map((r) => (r.slug === slug ? updated : r)),
    }));
    const state = get();
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ rates: state.rates, fetchedAt: Date.now() }));
  },

  resetDefaults: async () => {
    const res = await api.put('/rates/reset/defaults');
    const rates: Rate[] = res.data;
    set({ rates });
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ rates, fetchedAt: Date.now() }));
  },
}));
