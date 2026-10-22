/**
 * Data hooks + mutations of the Réglages screen. Query keys are shared with
 * the product form and the product list (['categories'], ['servingTypes'],
 * ['containers']) so a change made here shows up everywhere.
 */
import { useQuery, useQueryClient, QueryClient } from '@tanstack/react-query';
import { Category, CustomContainer, ServingType, User } from '@margebar/shared';
import { useOfflineQuery } from '../../../hooks/useOfflineQuery';
import { api } from '../../../services/api';
import * as servingService from '../../../services/serving.service';
import * as containerService from '../../../services/container.service';
import * as categoryService from '../../../services/category.service';
import * as ticketService from '../../../services/ticket.service';
import { useAuthStore } from '../../../store/auth.store';

export const SETTINGS_KEYS = {
  servingTypes: ['servingTypes'] as const,
  containers: ['containers'] as const,
  categories: ['categories'] as const,
  unread: ['tickets', 'unread'] as const,
  mine: ['tickets', 'mine'] as const,
  me: ['me'] as const,
};

const bySortOrder = <T extends { sortOrder: number; volumeCl?: number }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || (a.volumeCl ?? 0) - (b.volumeCl ?? 0);

export function useServingTypes() {
  return useOfflineQuery<ServingType[]>([...SETTINGS_KEYS.servingTypes], async () =>
    (await servingService.getServingTypes()).slice().sort(bySortOrder),
  );
}

export function useContainers() {
  return useOfflineQuery<CustomContainer[]>([...SETTINGS_KEYS.containers], async () =>
    (await containerService.getContainers()).slice().sort(bySortOrder),
  );
}

export function useCategories() {
  return useOfflineQuery<Category[]>([...SETTINGS_KEYS.categories], categoryService.getCategories);
}

export function useUnreadReplies() {
  const authed = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: [...SETTINGS_KEYS.unread],
    queryFn: ticketService.getUnreadCount,
    enabled: authed,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useMyTickets(enabled: boolean) {
  return useQuery({
    queryKey: [...SETTINGS_KEYS.mine],
    queryFn: ticketService.getMyTickets,
    enabled,
    staleTime: 0,
    retry: 1,
  });
}

/** Re-reads the profile (another device may have changed it). */
export function useMe() {
  const authed = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: [...SETTINGS_KEYS.me],
    queryFn: async () => {
      const res = await api.get<User>('/users/me');
      const { token, user } = useAuthStore.getState();
      const keys: (keyof User)[] = ['businessName', 'isAutoEntrepreneur', 'defaultTvaRate', 'defaultContainerVolumeCl', 'role', 'email'];
      if (token && user && keys.some((k) => res.data[k] !== undefined && res.data[k] !== user[k])) {
        useAuthStore.getState().setAuth(token, { ...user, ...res.data });
      }
      return res.data;
    },
    enabled: authed,
    staleTime: 60_000,
    retry: 1,
  });
}

/** PATCH /users/me and keep the auth store in sync. */
export async function updateMe(data: Partial<Pick<User, 'businessName' | 'isAutoEntrepreneur' | 'defaultTvaRate' | 'defaultContainerVolumeCl'>>): Promise<User> {
  const res = await api.patch<User>('/users/me', data);
  const { token, user } = useAuthStore.getState();
  if (token) useAuthStore.getState().setAuth(token, { ...(user as User), ...res.data });
  return res.data;
}

/** After a serving type change: products are re-synced on the server. */
export function invalidateProducts(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['product'] });
  qc.invalidateQueries({ queryKey: ['productServings'] });
}

export function useSettingsQueryClient() {
  return useQueryClient();
}
