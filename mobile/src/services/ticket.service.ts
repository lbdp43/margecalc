import { api } from './api';

export type TicketType = 'bug' | 'suggestion' | 'question';
export type TicketStatus = 'open' | 'resolved';

export interface CreateTicketPayload {
  type: TicketType;
  message: string;
  screenName?: string | null;
  screenshotBase64?: string | null;
}

export interface Ticket {
  id: string;
  type: TicketType;
  message: string;
  screenName: string | null;
  screenshotBase64: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    businessName: string | null;
  };
}

export async function createTicket(payload: CreateTicketPayload): Promise<{ id: string }> {
  const res = await api.post<{ id: string }>('/tickets', payload, {
    timeout: 60000,
  });
  return res.data;
}

export async function getTickets(): Promise<Ticket[]> {
  const res = await api.get<Ticket[]>('/tickets', { timeout: 30000 });
  return res.data;
}

export async function updateTicketStatus(id: string, status: TicketStatus): Promise<void> {
  await api.patch(`/tickets/${id}`, { status });
}

export async function deleteTicket(id: string): Promise<void> {
  await api.delete(`/tickets/${id}`);
}
