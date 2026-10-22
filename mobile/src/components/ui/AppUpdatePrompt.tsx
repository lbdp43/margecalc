/**
 * « Nouvelle version disponible » (web production builds only; renders nothing).
 * Mounted once in App.tsx, next to the toast and dialog hosts.
 *
 * When utils/appUpdate finds a newer build, a kit dialog asks:
 *   « Mettre à jour » → reload onto the new build, then « Application mise à jour »
 *                       (reloaded onto the same build: an error toast, and the
 *                       question rests 30 minutes instead of coming straight back)
 *   « Plus tard »     → asked again after 30 minutes (or at the next cold start)
 *
 * It never interrupts work: it waits while the focused route is a form
 * (ProductForm, InvoiceScan, Login, Register), while a BottomSheet, the Scanner
 * menu or another dialog is open, or while the tab is hidden, and it is never
 * shown twice at once.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ROUTES } from '../../navigation/routes';
import { useCurrentRouteStore } from '../../navigation/currentRoute';
import {
  UPDATES_ENABLED,
  applyUpdate,
  consumeJustUpdated,
  snoozeUpdate,
  startAppUpdates,
  useAppUpdateStore,
} from '../../utils/appUpdate';
import { useChromeStore } from './chrome';
import { dialog } from './Dialog';
import { toast } from './Toast';

/** Screens where a reload would lose what is being typed or scanned. */
const WORK_ROUTES = new Set<string>([ROUTES.productForm, ROUTES.invoiceScan, ROUTES.login, ROUTES.register]);
/** Beat before asking (a sheet or a screen transition settles first). */
const ASK_DELAY_MS = 700;
/** After leaving a form, its « … enregistré » toast is read first. */
const AFTER_WORK_DELAY_MS = 2500;

const isWorkRoute = (name: string | null) => !!name && WORK_ROUTES.has(name);
const doc: any = Platform.OS === 'web' ? (globalThis as any).document : undefined;
const pageHidden = () => doc?.visibilityState === 'hidden';

export function AppUpdatePrompt() {
  const available = useAppUpdateStore((s) => s.available);
  const snoozedUntil = useAppUpdateStore((s) => s.snoozedUntil);
  const overlays = useChromeStore((s) => s.sheetCount);
  const route = useCurrentRouteStore((s) => s.name);
  const [wake, setWake] = useState(0);
  const showing = useRef(false);
  const leftWorkAt = useRef(0);
  const prevRoute = useRef<string | null>(null);

  if (prevRoute.current !== route) {
    if (isWorkRoute(prevRoute.current) && !isWorkRoute(route)) leftWorkAt.current = Date.now();
    prevRoute.current = route;
  }

  // Start the service worker + checks; after « Mettre à jour », say it worked.
  useEffect(() => {
    if (!UPDATES_ENABLED) return undefined;
    startAppUpdates();
    const onVisible = () => {
      if (!pageHidden()) setWake((n) => n + 1);
    };
    doc?.addEventListener?.('visibilitychange', onVisible);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const outcome = consumeJustUpdated();
    if (outcome === 'updated') timer = setTimeout(() => toast.success('Application mise à jour'), 900);
    else if (outcome === 'failed') {
      // Reloaded onto the same build (stale page served mid-deploy): rest, and say so.
      snoozeUpdate();
      timer = setTimeout(() => toast.error('La mise à jour n’a pas pu se faire. Réessayez dans quelques minutes.'), 900);
    }
    return () => {
      doc?.removeEventListener?.('visibilitychange', onVisible);
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!UPDATES_ENABLED || !available || showing.current) return undefined;
    const snoozeLeft = snoozedUntil - Date.now();
    if (snoozeLeft > 0) {
      const t = setTimeout(() => setWake((n) => n + 1), snoozeLeft + 100);
      return () => clearTimeout(t);
    }
    // Queued: this effect runs again when the overlay closes or the route changes.
    if (overlays > 0 || isWorkRoute(route) || pageHidden()) return undefined;
    const delay = Math.max(ASK_DELAY_MS, leftWorkAt.current + AFTER_WORK_DELAY_MS - Date.now());
    const t = setTimeout(async () => {
      // Things may have changed during the beat.
      if (showing.current || pageHidden()) return;
      if (useChromeStore.getState().sheetCount > 0 || isWorkRoute(useCurrentRouteStore.getState().name)) return;
      if (useAppUpdateStore.getState().snoozedUntil > Date.now()) return;
      showing.current = true;
      const choice = await dialog.show<'update' | 'later'>({
        title: 'Nouvelle version disponible',
        message: 'Une mise à jour de MargeBar Pro est prête. Elle ne prend que quelques secondes.',
        icon: 'sparkles-outline',
        tone: 'brand',
        actions: [
          { label: 'Mettre à jour', value: 'update', style: 'primary' },
          { label: 'Plus tard', value: 'later', style: 'cancel' },
        ],
      });
      if (choice === 'update') {
        await applyUpdate(); // reloads the page
        return;
      }
      snoozeUpdate();
      showing.current = false;
    }, delay);
    return () => clearTimeout(t);
  }, [available, snoozedUntil, overlays, route, wake]);

  return null;
}
