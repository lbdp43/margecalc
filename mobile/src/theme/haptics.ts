/**
 * Haptics wrapper. ALWAYS use this instead of `expo-haptics`:
 * - web: expo-haptics rejects with ERR_UNAVAILABLE, so it is never called;
 *   `navigator.vibrate` is used when available (Android Chrome), guarded.
 * - native: every call is fire-and-forget with `.catch(() => {})`.
 *
 *   import { haptics } from '../theme/haptics';
 *   haptics.select();      // chip / segment / tab change, slider detent
 *   haptics.tap();         // Scanner press, stepper step
 *   haptics.success();     // after a successful save
 *   haptics.warning();     // validation error, destructive confirm
 */
import { Platform } from 'react-native';

type HapticsModule = typeof import('expo-haptics');
let mod: HapticsModule | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('expo-haptics') as HapticsModule;
  } catch {
    mod = null;
  }
}

let enabled = true;
let lastVibrate = 0;

function vibrate(pattern: number | number[]) {
  if (Platform.OS !== 'web' || !enabled) return;
  try {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.vibrate !== 'function') return;
    // Chrome blocks vibrate() before the first user gesture and logs an
    // intervention; throttle so auto-repeat steppers do not buzz endlessly.
    const now = Date.now();
    if (now - lastVibrate < 35) return;
    lastVibrate = now;
    const ua: any = (nav as any).userActivation;
    if (ua && ua.hasBeenActive === false) return;
    nav.vibrate(pattern);
  } catch {
    // ignore
  }
}

export function tap(): void {
  if (!enabled) return;
  if (mod) {
    mod.impactAsync(mod.ImpactFeedbackStyle.Light).catch(() => {});
    return;
  }
  vibrate(8);
}

export function select(): void {
  if (!enabled) return;
  if (mod) {
    mod.selectionAsync().catch(() => {});
    return;
  }
  vibrate(4);
}

export function success(): void {
  if (!enabled) return;
  if (mod) {
    mod.notificationAsync(mod.NotificationFeedbackType.Success).catch(() => {});
    return;
  }
  vibrate([10, 40, 14]);
}

export function warning(): void {
  if (!enabled) return;
  if (mod) {
    mod.notificationAsync(mod.NotificationFeedbackType.Warning).catch(() => {});
    return;
  }
  vibrate([16, 60, 16]);
}

/** Globally enable/disable haptics (e.g. a Réglages toggle later). */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export const haptics = { tap, select, success, warning, setEnabled: setHapticsEnabled };
export type HapticKind = 'tap' | 'select' | 'success' | 'warning';
export function fire(kind?: HapticKind | false | null): void {
  if (!kind) return;
  haptics[kind]();
}
export default haptics;
