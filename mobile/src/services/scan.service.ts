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

export interface InvoiceProduct {
  name: string;
  category: string;
  containerVolumeCl: number | null;
  purchasePriceHT: number | null;
  quantity: number;
  confidence: number;
}

export interface InvoiceScanResult {
  supplier: string;
  invoiceDate: string | null;
  products: InvoiceProduct[];
}

export async function scanInvoice(imageBase64: string): Promise<InvoiceScanResult> {
  const res = await api.post<InvoiceScanResult>('/scan/invoice', { imageBase64 }, {
    timeout: 150000,
  });
  return res.data;
}
