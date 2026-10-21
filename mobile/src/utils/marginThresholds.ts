/**
 * The user's margin thresholds (Réglages → « Seuils de marge »).
 * Stored in AsyncStorage under `margebar_margin_thresholds` (same key the
 * Settings screen already writes). Badge, ResultTile, Legend rows… read them
 * through `useMarginThresholds()` and `getMarginZone()`.
 *
 *   const t = useMarginThresholds();          // { good: 65, medium: 50 }
 *   const zone = getMarginZone(69, t);         // 'green'
 *   await setMarginThresholds({ good: 70, medium: 55 }); // persists + notifies
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_MARGIN_THRESHOLDS, getMarginColor } from '@margebar/shared';

export interface MarginThresholds {
  good: number;
  medium: number;
}

export const MARGIN_THRESHOLDS_KEY = 'margebar_margin_thresholds';

let current: MarginThresholds = { ...DEFAULT_MARGIN_THRESHOLDS };
let loaded = false;
const listeners = new Set<(t: MarginThresholds) => void>();

function emit() {
  listeners.forEach((l) => l(current));
}

function sanitize(raw: any): MarginThresholds {
  const good = Number(raw?.good);
  const medium = Number(raw?.medium);
  return {
    good: isFinite(good) && good > 0 ? good : DEFAULT_MARGIN_THRESHOLDS.good,
    medium: isFinite(medium) && medium > 0 ? medium : DEFAULT_MARGIN_THRESHOLDS.medium,
  };
}

export async function loadMarginThresholds(): Promise<MarginThresholds> {
  try {
    const raw = await AsyncStorage.getItem(MARGIN_THRESHOLDS_KEY);
    if (raw) current = sanitize(JSON.parse(raw));
  } catch {
    // keep defaults
  }
  loaded = true;
  emit();
  return current;
}

export async function setMarginThresholds(next: MarginThresholds): Promise<void> {
  current = sanitize(next);
  emit();
  try {
    await AsyncStorage.setItem(MARGIN_THRESHOLDS_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function getMarginThresholds(): MarginThresholds {
  return current;
}

export function useMarginThresholds(): MarginThresholds {
  const [value, setValue] = useState<MarginThresholds>(current);
  useEffect(() => {
    listeners.add(setValue);
    if (!loaded) loadMarginThresholds();
    else setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

export type MarginZone = 'green' | 'orange' | 'red';

export function getMarginZone(marginPercent: number, thresholds: MarginThresholds = current): MarginZone {
  return getMarginColor(marginPercent, thresholds as any);
}
