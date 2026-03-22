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
    AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(user)],
    ]).catch(() => {});
    set({ token, user, isAuthenticated: true });
  },

  logout: async () => {
    set({ token: null, user: null, isAuthenticated: false });
    // Clear auth + all offline data to prevent data leak to next user
    await Promise.all([
      AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]),
      clearAllOfflineData(),
    ]);
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
