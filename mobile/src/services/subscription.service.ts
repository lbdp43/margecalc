import { api } from './api';

export interface SubscriptionStatus {
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  subscriptionEndDate: string | null;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const res = await api.get<SubscriptionStatus>('/subscription/status');
  return res.data;
}

export async function createCheckoutSession(plan: 'monthly' | 'yearly'): Promise<{ url: string }> {
  const res = await api.post<{ url: string }>('/subscription/checkout', { plan });
  return res.data;
}

export async function createPortalSession(): Promise<{ url: string }> {
  const res = await api.post<{ url: string }>('/subscription/portal');
  return res.data;
}
