import { create } from 'zustand';
import { Platform } from 'react-native';
import { User } from '@margebar/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { clearAllOfflineData } from '../services/offline';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  loadStoredAuth: () => Promise<void>;
}

const TOKEN_KEY = 'margebar_token';
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
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (token, user) => {
    Promise.all([
      saveToken(token),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]).catch((err) => {
      console.warn('Failed to persist auth:', err);
    });
    set({ token, user, isAuthenticated: true });
  },

  logout: async () => {
    set({ token: null, user: null, isAuthenticated: false });
    await Promise.all([
      deleteToken(),
      AsyncStorage.removeItem(USER_KEY),
      clearAllOfflineData(),
    ]);
  },

  loadStoredAuth: async () => {
    try {
      const [token, userJson] = await Promise.all([
        getToken(),
        AsyncStorage.getItem(USER_KEY),
      ]);
      if (token && userJson) {
        set({
          token,
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
