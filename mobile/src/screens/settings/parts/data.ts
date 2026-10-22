/**
 * Data hooks + mutations of the Réglages screen. Query keys are shared with
 * the product form and the product list (['categories'], ['servingTypes'],
 * ['containers']) so a change made here shows up everywhere.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, QueryClient } from '@tanstack/react-query';
import { Category, CustomContainer, ProductWithMargin, ServingType, TVA_RATES, User } from '@margebar/shared';
import { useOfflineQuery } from '../../../hooks/useOfflineQuery';
import { api } from '../../../services/api';
import * as productService from '../../../services/product.service';
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
  qc.invalidateQueries({ queryKey: ['admin', 'products'] });
}

// ─── TVA of the existing catalogue (auto-entrepreneur switch) ──────────────
export interface TvaPlan {
  autoEntrepreneur: boolean;
  /** Products whose TVA changes, with their new rate and the one they had. */
  changes: { id: string; tvaRate: number; previous: number }[];
  total: number;
}

/** Each product's TVA before the auto-entrepreneur mode set it to 0 % (this device). */
const tvaMemoryKey = (userId: string) => `margebar_tva_before_ae:${userId}`;

async function readTvaMemory(userId: string): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(tvaMemoryKey(userId));
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/**
 * Which products change when the auto-entrepreneur mode changes:
 * - on: every product with a TVA becomes 0 % (its rate is remembered);
 * - off: the products at 0 % get back the rate they had, or the usual one
 *   (20 %, softs 10 %, the product form's defaults). Other rates are left alone.
 */
export async function planTvaChange(autoEntrepreneur: boolean, defaultRate: number, userId: string): Promise<TvaPlan> {
  const [products, memory] = await Promise.all([productService.getProducts(), readTvaMemory(userId)]);
  const changes: TvaPlan['changes'] = [];
  for (const p of products as ProductWithMargin[]) {
    const current = Number(p.tvaRate) || 0;
    if (autoEntrepreneur) {
      if (current > 0) changes.push({ id: p.id, tvaRate: 0, previous: current });
    } else if (current === 0) {
      const remembered = memory[p.id];
      const rate = typeof remembered === 'number' && remembered > 0 ? remembered : p.category?.slug === 'softs' ? TVA_RATES.RATE_10 : defaultRate;
      changes.push({ id: p.id, tvaRate: rate, previous: 0 });
    }
  }
  return { autoEntrepreneur, changes, total: products.length };
}

/** Applies the plan (4 requests at a time). Returns how many products changed or failed. */
export async function applyTvaChange(qc: QueryClient, plan: TvaPlan, userId: string): Promise<{ updated: number; failed: number; error?: unknown }> {
  let next = 0;
  let failed = 0;
  let error: unknown;
  const done: TvaPlan['changes'] = [];
  const worker = async () => {
    while (next < plan.changes.length) {
      const c = plan.changes[next++];
      try {
        await productService.updateProduct(c.id, { tvaRate: c.tvaRate });
        done.push(c);
      } catch (err) {
        failed++;
        error = error ?? err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, plan.changes.length) }, worker));
  const memory = await readTvaMemory(userId);
  for (const c of done) {
    if (plan.autoEntrepreneur) memory[c.id] = c.previous;
    else delete memory[c.id];
  }
  await AsyncStorage.setItem(tvaMemoryKey(userId), JSON.stringify(memory)).catch(() => {});
  invalidateProducts(qc);
  return { updated: done.length, failed, error };
}
