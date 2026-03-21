export interface User {
  id: string;
  email: string;
  businessName: string | null;
  isAutoEntrepreneur: boolean;
  defaultTvaRate: number;
  defaultContainerVolumeCl: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthPayload {
  userId: string;
  email: string;
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
