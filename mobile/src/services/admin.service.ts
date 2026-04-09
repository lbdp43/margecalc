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

export async function getAdminUsers(): Promise<AdminUsersResponse> {
  const res = await api.get<AdminUsersResponse>('/admin/users', { timeout: 30000 });
  return res.data;
}
