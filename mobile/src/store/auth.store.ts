import { create } from 'zustand';
import { Platform } from 'react-native';
import { User } from '@margebar/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { clearAllOfflineData } from '../services/offline';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
  loadStoredAuth: () => Promise<void>;
}

const TOKEN_KEY = 'margebar_token';
const REFRESH_TOKEN_KEY = 'margebar_refresh_token';
const USER_KEY = 'margebar_user';

// SecureStore is not available on web
const isSecureStoreAvailable = Platform.OS !== 'web';

async function saveToken(token: string): Promise<void> {
  if (isSecureStoreAvailable) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  }
}

async function getToken(): Promise<string | null> {
  if (isSecureStoreAvailable) {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }
  return AsyncStorage.getItem(TOKEN_KEY);
}

async function deleteToken(): Promise<void> {
  if (isSecureStoreAvailable) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (token, user, refreshToken) => {
    const writes: Promise<void>[] = [
      saveToken(token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    ];
    if (refreshToken) {
      writes.push(AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken));
    }
    Promise.all(writes).catch((err) => {
      console.warn('Failed to persist auth:', err);
    });
    set((prev) => ({
      token,
      user,
      isAuthenticated: true,
      refreshToken: refreshToken ?? prev.refreshToken,
    }));
  },

  logout: async () => {
    set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
    await Promise.all([
      deleteToken(),
      AsyncStorage.removeItem(USER_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      clearAllOfflineData(),
    ]);
  },

  loadStoredAuth: async () => {
    try {
      const [token, userJson, refreshToken] = await Promise.all([
        getToken(),
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(REFRESH_TOKEN_KEY),
      ]);
      if (token && userJson) {
        set({
          token,
          refreshToken,
          user: JSON.parse(userJson),
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
