export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  businessName: string | null;
  isAutoEntrepreneur: boolean;
  defaultTvaRate: number;
  defaultContainerVolumeCl: number;
  subscriptionStatus: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  subscriptionPlan: string | null;
  subscriptionEndDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface SystemParam {
  id: string;
  key: string;
  value: string;
  label: string;
  unit: string | null;
  description: string | null;
  updatedAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  businessName?: string;
  isAutoEntrepreneur?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}
