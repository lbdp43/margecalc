import { create } from 'zustand';
import { User } from '@margebar/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (token, user) => {
    AsyncStorage.setItem(TOKEN_KEY, token);
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    // Clear all offline cache and pending ops to prevent data leak
    clearAllOfflineData();
    set({ token: null, user: null, isAuthenticated: false });
  },

  loadStoredAuth: async () => {
    try {
      const [token, userJson] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
      if (token[1] && userJson[1]) {
        set({
          token: token[1],
          user: JSON.parse(userJson[1]),
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
