import { api } from './api';

export interface ScanResult {
  name: string;
  category: string;
  containerVolumeCl: number | null;
  estimatedPriceHT: number | null;
  confidence: number;
}

export async function scanBottle(imageBase64: string): Promise<ScanResult> {
  const res = await api.post<ScanResult>('/scan/bottle', { imageBase64 }, {
    timeout: 90000,
  });
  return res.data;
}
