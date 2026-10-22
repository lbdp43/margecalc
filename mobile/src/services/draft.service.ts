import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Local, per-device memory of the product form:
 *
 * 1. Pricing preferences per product — the Prix / Marge / Coeff mode chosen for
 *    each service and the « prix hors droits » entry. The API stores prices only,
 *    so this is what lets « Modifier le produit » reopen exactly as it was saved.
 * 2. The new-product draft — the form is saved as you type, so an interruption
 *    (a customer, a call, a reload) never loses the work. Keyed by user.
 *
 * Every call swallows storage errors: losing a preference must never block a save.
 */

export type PriceMode = 'price' | 'margin' | 'coeff';

export interface ProductFormPrefs {
  /** Mode per service id (servingTypeId, or '__dose' for a free dose). */
  modes: Record<string, PriceMode>;
  /** Set when the purchase price was typed without duties. */
  horsDroits?: { fiscalSlug: string; priceHorsDroits: number } | null;
  savedAt: number;
}

const PREFS_KEY = 'margebar_product_form_prefs';
const MAX_PREFS = 400;

async function readPrefsMap(): Promise<Record<string, ProductFormPrefs>> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function getFormPrefs(productId: string): Promise<ProductFormPrefs | null> {
  const map = await readPrefsMap();
  return map[productId] ?? null;
}

export async function saveFormPrefs(productId: string, prefs: Omit<ProductFormPrefs, 'savedAt'>): Promise<void> {
  try {
    const map = await readPrefsMap();
    map[productId] = { ...prefs, savedAt: Date.now() };
    const entries = Object.entries(map).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_PREFS);
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage full or unavailable: preferences are a nicety */
  }
}

export async function deleteFormPrefs(productId: string): Promise<void> {
  try {
    const map = await readPrefsMap();
    if (!(productId in map)) return;
    delete map[productId];
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

// ─── New-product draft ──────────────────────────────────────────────────────

export interface ProductDraft<T = unknown> {
  /** Name shown in « Reprendre le brouillon » (may be empty). */
  name: string;
  form: T;
  savedAt: number;
}

const DRAFT_PREFIX = 'margebar_product_draft_';
/** Drafts older than this are ignored (a week). */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const draftKey = (userId: string | null | undefined) => `${DRAFT_PREFIX}${userId || 'anon'}`;

export async function getProductDraft<T = unknown>(userId: string | null | undefined): Promise<ProductDraft<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as ProductDraft<T>;
    if (!draft || typeof draft !== 'object' || !draft.form) return null;
    if (Date.now() - (draft.savedAt || 0) > DRAFT_MAX_AGE_MS) {
      await AsyncStorage.removeItem(draftKey(userId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/** Returns true when the draft was written. */
export async function saveProductDraft<T>(userId: string | null | undefined, name: string, form: T): Promise<boolean> {
  try {
    await AsyncStorage.setItem(draftKey(userId), JSON.stringify({ name, form, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export async function clearProductDraft(userId: string | null | undefined): Promise<void> {
  try {
    await AsyncStorage.removeItem(draftKey(userId));
  } catch {
    /* ignore */
  }
}
