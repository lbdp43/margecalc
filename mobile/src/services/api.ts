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
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
