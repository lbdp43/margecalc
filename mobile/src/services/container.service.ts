import { api } from './api';
import { CustomContainer } from '@margebar/shared';
import { assertOnline } from './offline';

/** The user's containers (bouteille 70 cl, fût 30 L…), editable in Réglages. */
export async function getContainers(): Promise<CustomContainer[]> {
  const res = await api.get<CustomContainer[]>('/containers');
  return res.data;
}

export async function createContainer(name: string, volumeCl: number): Promise<CustomContainer> {
  assertOnline();
  const res = await api.post<CustomContainer>('/containers', { name, volumeCl });
  return res.data;
}

export async function updateContainer(
  id: string,
  data: Partial<{ name: string; volumeCl: number; sortOrder: number }>,
): Promise<CustomContainer> {
  assertOnline();
  const res = await api.put<CustomContainer>(`/containers/${id}`, data);
  return res.data;
}

export async function deleteContainer(id: string): Promise<void> {
  assertOnline();
  await api.delete(`/containers/${id}`);
}
