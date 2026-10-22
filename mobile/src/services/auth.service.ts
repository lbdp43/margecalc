import { api } from './api';
import { AuthResponse, LoginRequest, RegisterRequest } from '@margebar/shared';
import { useAuthStore } from '../store/auth.store';

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/login', data);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>('/auth/register', data);
  return res.data;
}

/**
 * Explains a forced sign-out. `api.ts` already refreshes the session on a 401
 * and signs out when that fails; this interceptor runs after it (registered
 * later) and only records WHY, so the landing can tell the user: a suspended
 * account (« Compte suspendu… », code 'banned'), a deleted one, or a session
 * that could not be renewed. Requests sent without a token are ignored.
 */
let lastNoticeAt = 0;
api.interceptors.response.use(undefined, (error) => {
  try {
    const res = error?.response;
    const config = error?.config;
    const url: string = config?.url ?? '';
    const sentToken = !!(config?.headers?.Authorization || config?.headers?.authorization);
    const store = useAuthStore.getState();
    if (res?.status === 401 && sentToken && !url.includes('/auth/') && !store.isAuthenticated && Date.now() - lastNoticeAt > 4000) {
      lastNoticeAt = Date.now();
      const code = res.data?.code;
      const message = typeof res.data?.error === 'string' && res.data.error.trim() ? res.data.error : '';
      if (code === 'banned') {
        store.setNotice({ kind: 'banned', title: 'Compte suspendu', message: message || 'Ce compte a été suspendu. Contactez La Brasserie des Plantes.' });
      } else if (code === 'account_missing') {
        store.setNotice({ kind: 'account_missing', title: 'Compte introuvable', message: message || 'Ce compte n’existe plus.' });
      } else {
        store.setNotice({ kind: 'expired', title: 'Session expirée', message: 'Reconnectez-vous pour retrouver vos produits et vos marges.' });
      }
    }
  } catch {
    // never let the explanation get in the way of the original error
  }
  return Promise.reject(error);
});
