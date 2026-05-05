import axios from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/auth.store';

const API_BASE_URL = Platform.OS === 'web'
  ? '/api'
  : 'https://margecalc-production.up.railway.app/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let _refreshing: Promise<boolean> | null = null;
let _loggingOut = false;

async function tryRefresh(): Promise<boolean> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return false;
  try {
    const res = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 },
    );
    const { token, refreshToken: newRefresh, user } = res.data;
    useAuthStore.getState().setAuth(token, user, newRefresh);
    return true;
  } catch {
    return false;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retried &&
      !_loggingOut &&
      !original.url?.includes('/auth/')
    ) {
      original._retried = true;
      if (!_refreshing) _refreshing = tryRefresh().finally(() => { _refreshing = null; });
      const ok = await _refreshing;
      if (ok) {
        original.headers.Authorization = `Bearer ${useAuthStore.getState().token}`;
        return api(original);
      }
    }

    if (error.response?.status === 401 && !_loggingOut) {
      _loggingOut = true;
      try {
        await useAuthStore.getState().logout();
      } finally {
        _loggingOut = false;
      }
    }
    return Promise.reject(error);
  },
);
