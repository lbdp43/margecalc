import { api } from './api';

export interface AdminUser {
  id: string;
  email: string;
  businessName: string | null;
  role: 'user' | 'admin';
  subscriptionStatus: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  subscriptionPlan: string | null;
  subscriptionEndDate: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  bannedAt: string | null;
  loginsThisMonth: number;
  loginsTotal: number;
}

export interface AdminUsersStats {
  total: number;
  active: number;
  trialing: number;
  none: number;
  canceled: number;
  pastDue: number;
  admins: number;
}

export interface AdminRevenue {
  paidSubscribers: number;
  monthlyCount: number;
  yearlyCount: number;
  mrrTTC: number;
  mrrHT: number;
  arrTTC: number;
  arrHT: number;
  vatRate: number;
}

export interface AdminUsersResponse {
  stats: AdminUsersStats;
  revenue: AdminRevenue;
  users: AdminUser[];
}

export interface AdminProduct {
  id: string;
  name: string;
  category: string;
  user?: { id: string; email: string; businessName: string | null };
  purchasePriceHT: number;
  containerVolumeCl: number;
  tvaRate: number;
  alcoholDegree: number;
  supplier: string | null;
  marginPercent: number;
  sellingPriceTTC: number;
  coefficient: number;
  servings: Array<{ name: string; volumeCl: number; sellingPriceTTC: number }>;
  updatedAt: string;
}

export async function getAdminUsers(): Promise<AdminUsersResponse> {
  const res = await api.get<AdminUsersResponse>('/admin/users', { timeout: 30000 });
  return res.data;
}

export async function getAllProducts(): Promise<AdminProduct[]> {
  const res = await api.get<AdminProduct[]>('/admin/products', { timeout: 30000 });
  return res.data;
}

export async function getAdminUserProducts(userId: string): Promise<AdminProduct[]> {
  const res = await api.get<AdminProduct[]>(`/admin/users/${userId}/products`, { timeout: 30000 });
  return res.data;
}

export interface BanResponse {
  id: string;
  email: string;
  bannedAt: string | null;
}

export async function banUser(userId: string): Promise<BanResponse> {
  const res = await api.patch<BanResponse>(`/admin/users/${userId}/ban`);
  return res.data;
}

export async function unbanUser(userId: string): Promise<BanResponse> {
  const res = await api.patch<BanResponse>(`/admin/users/${userId}/unban`);
  return res.data;
}

export async function deleteUser(userId: string): Promise<void> {
  await api.delete(`/admin/users/${userId}`);
}

export interface LoginSeriesPoint {
  month: string; // YYYY-MM
  count: number;
}

export interface LoginSeriesResponse {
  from: string;
  to: string;
  total: number;
  series: LoginSeriesPoint[];
}

export async function getUserLogins(
  userId: string,
  from?: string,
  to?: string,
): Promise<LoginSeriesResponse> {
  const res = await api.get<LoginSeriesResponse>(`/admin/users/${userId}/logins`, {
    params: { from, to },
  });
  return res.data;
}
