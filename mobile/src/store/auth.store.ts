import { create } from 'zustand';
import { Platform } from 'react-native';
import { User } from '@margebar/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { clearAllOfflineData } from '../services/offline';

/**
 * Why the app signed the user out on its own (shown once on the landing):
 * a suspended or deleted account, or a session that could not be renewed.
 */
export interface AuthNotice {
  /** Unique per forced sign-out, so the explanation is shown exactly once. */
  id: number;
  kind: 'banned' | 'account_missing' | 'expired';
  title: string;
  message: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Forced sign-out reason, consumed once by the landing (`consumeNotice`). */
  notice: AuthNotice | null;
  /**
   * Address typed on Connexion / Inscription, carried in memory when the user
   * switches between the two screens (never in the URL: it is personal data
   * and would stay in the browser history of a shared bar device).
   */
  draftEmail: string;
  setAuth: (token: string, user: User, refreshToken?: string) => void;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  setNotice: (notice: Omit<AuthNotice, 'id'> | null) => void;
  /** Returns the pending notice and clears it in the same step (idempotent under re-renders). */
  consumeNotice: () => AuthNotice | null;
  setDraftEmail: (email: string) => void;
}

let noticeSeq = 0;

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

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  notice: null,
  draftEmail: '',

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
      notice: null,
      draftEmail: '',
    }));
  },

  /**
   * Signs out locally. The React Query cache is NOT reachable from here:
   * the landing clears it when it mounts, and Connexion / Inscription clear
   * it again right before `setAuth`, so the next account never sees the
   * previous account's products (see screens/auth).
   */
  logout: async () => {
    set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
    // Each removal on its own: one failing store must not keep the others.
    await Promise.allSettled([
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

  setNotice: (notice) => set({ notice: notice ? { ...notice, id: ++noticeSeq } : null }),

  consumeNotice: () => {
    const notice = get().notice;
    if (notice) set({ notice: null });
    return notice;
  },

  setDraftEmail: (email) => set({ draftEmail: email }),
}));
