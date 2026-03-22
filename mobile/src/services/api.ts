import axios from 'axios';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/auth.store';

// On web, use relative path (same origin); on native, use full URL
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

let _loggingOut = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !_loggingOut) {
      _loggingOut = true;
      try {
        await useAuthStore.getState().logout();
      } finally {
        _loggingOut = false;
      }
    }
    return Promise.reject(error);
  }
);
