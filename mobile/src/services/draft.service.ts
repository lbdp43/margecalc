import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFTS_KEY = 'margebar_scan_drafts';

export interface ScanDraft {
  id: string;
  name: string;
  categoryId?: string;
  containerVolumeCl?: number | null;
  estimatedPriceHT?: number | null;
  savedAt: number;
}

export async function getDrafts(): Promise<ScanDraft[]> {
  const raw = await AsyncStorage.getItem(DRAFTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveDraft(draft: Omit<ScanDraft, 'id' | 'savedAt'>): Promise<void> {
  const drafts = await getDrafts();
  drafts.unshift({
    ...draft,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    savedAt: Date.now(),
  });
  // Keep max 50 drafts
  await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 50)));
}

export async function deleteDraft(id: string): Promise<void> {
  const drafts = await getDrafts();
  await AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.filter((d) => d.id !== id)));
}
