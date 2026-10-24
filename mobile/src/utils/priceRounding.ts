/**
 * « Arrondi des prix » (Réglages › Objectifs de marge): the step every
 * suggested price is rounded UP to, so a suggestion never drops below the
 * objective. 0,05 € · 0,10 € (default) · 0,50 €.
 *
 *   const step = usePriceRounding();          // 0.1
 *   await savePriceRounding(0.5);              // store/systemParams.store: device + account copy
 *
 * Stored on the device under `margebar_price_rounding`, and per account
 * exactly like the margin objectives (store/systemParams.store binds it to
 * the signed-in account: its own copy under `margebar_price_rounding:<userId>`,
 * put back at each sign-in, the default for the next account). Screens save
 * through `savePriceRounding` from that store. A load started before a newer
 * write never overwrites that write (see `writeSeq`).
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PriceRounding = 0.05 | 0.1 | 0.5;

export const PRICE_ROUNDINGS: readonly PriceRounding[] = [0.05, 0.1, 0.5];
export const DEFAULT_PRICE_ROUNDING: PriceRounding = 0.1;
export const PRICE_ROUNDING_KEY = 'margebar_price_rounding';

let current: PriceRounding = DEFAULT_PRICE_ROUNDING;
let loaded = false;
/** Bumped by every write: a slower storage read started earlier is discarded. */
let writeSeq = 0;
const listeners = new Set<(r: PriceRounding) => void>();

function emit() {
  listeners.forEach((l) => l(current));
}

/** A stored value back to one of the three steps (anything else: the default). */
export function sanitizePriceRounding(raw: unknown): PriceRounding {
  const n = typeof raw === 'string' ? Number(raw) : (raw as number);
  const hit = PRICE_ROUNDINGS.find((r) => Math.abs(r - n) < 1e-9);
  return hit ?? DEFAULT_PRICE_ROUNDING;
}

/** Parses a stored copy; null when absent or unreadable. */
export function parsePriceRounding(raw: string | null): PriceRounding | null {
  if (!raw) return null;
  const n = Number(raw);
  return PRICE_ROUNDINGS.find((r) => Math.abs(r - n) < 1e-9) ?? null;
}

export async function loadPriceRounding(): Promise<PriceRounding> {
  const seq = writeSeq;
  try {
    const raw = await AsyncStorage.getItem(PRICE_ROUNDING_KEY);
    if (raw && seq === writeSeq) current = sanitizePriceRounding(raw);
  } catch {
    // keep the default
  }
  loaded = true;
  emit();
  return current;
}

/** Device copy only: screens call `savePriceRounding` (store/systemParams.store). */
export async function setPriceRounding(next: PriceRounding): Promise<void> {
  writeSeq++;
  current = sanitizePriceRounding(next);
  loaded = true;
  emit();
  try {
    await AsyncStorage.setItem(PRICE_ROUNDING_KEY, String(current));
  } catch {
    // ignore
  }
}

export async function clearPriceRounding(): Promise<void> {
  await setPriceRounding(DEFAULT_PRICE_ROUNDING);
  try {
    await AsyncStorage.removeItem(PRICE_ROUNDING_KEY);
  } catch {
    // ignore
  }
}

export function getPriceRounding(): PriceRounding {
  return current;
}

export function usePriceRounding(): PriceRounding {
  const [value, setValue] = useState<PriceRounding>(current);
  useEffect(() => {
    listeners.add(setValue);
    if (!loaded) loadPriceRounding();
    else setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
