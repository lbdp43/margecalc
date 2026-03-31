import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SystemParam } from '@margebar/shared';
import { api } from '../services/api';

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
  loadParams: () => Promise<void>;
  getParam: (key: string) => string | null;
  getParamNum: (key: string) => number;
  updateParam: (key: string, value: string) => Promise<void>;
}

export const useSystemParamsStore = create<SystemParamsState>((set, get) => ({
  params: [],
  isLoading: false,
  lastFetched: null,

  loadParams: async () => {
    // Try cache first
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

    // Fetch from API
    set({ isLoading: true });
    try {
      const res = await api.get('/system-params');
      const params: SystemParam[] = res.data;
      const now = Date.now();
      set({ params, isLoading: false, lastFetched: now });
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ params, fetchedAt: now }));
    } catch {
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
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ params: state.params, fetchedAt: Date.now() }),
    );
  },
}));
