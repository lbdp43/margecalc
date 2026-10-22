/**
 * « Nouvelle version disponible » — web production builds only (never on
 * native, never in dev / Metro).
 *
 * - Registers the service worker (/sw.js, scope /) once the page has loaded.
 * - Reads the running build id from <meta name="margebar-build"> and compares
 *   it with /version.json (fetched with cache: 'no-store' and ?t=…): every
 *   5 minutes, when the tab becomes visible again, when the connection comes
 *   back, and when the service worker finds or installs a new version
 *   ('updatefound', 'controllerchange').
 * - A different id → `useAppUpdateStore().available`; the prompt
 *   (components/ui/AppUpdatePrompt) decides when to ask.
 * - `applyUpdate()`: a waiting worker is told to take over (SKIP_WAITING),
 *   then the page reloads; a sessionStorage flag makes the new page say
 *   « Application mise à jour ».
 * Both scripts/patch-html.js (build id, version.json, sw.js) and
 * backend/src/index.ts (no-cache headers) are part of this contract.
 */
import { Platform } from 'react-native';
import { create } from 'zustand';

const win: any = Platform.OS === 'web' ? (globalThis as any).window : undefined;
export const UPDATES_ENABLED = !!win && !__DEV__;

const CHECK_EVERY_MS = 5 * 60 * 1000;
/** « Plus tard »: asked again after this (or at the next cold start). */
const SNOOZE_MS = 30 * 60 * 1000;
/** Event-triggered checks closer than this are merged. */
const MIN_GAP_MS = 5 * 1000;
const UPDATED_FLAG = 'margebar_updated';

export interface RemoteVersion {
  buildId: string;
  version?: string;
  builtAt?: string;
}

interface AppUpdateState {
  /** A newer build is deployed (null: up to date, or unknown). */
  available: RemoteVersion | null;
  /** « Plus tard » until then (in memory: a cold start asks again). */
  snoozedUntil: number;
}

export const useAppUpdateStore = create<AppUpdateState>(() => ({ available: null, snoozedUntil: 0 }));

/** The build id this page runs (from index.html). */
export function currentBuildId(): string | null {
  try {
    return win?.document?.querySelector?.('meta[name="margebar-build"]')?.getAttribute('content') || null;
  } catch {
    return null;
  }
}

let started = false;
let lastCheck = 0;
let inflight: Promise<void> | null = null;
let registration: any = null;

/** Compares the deployed build with this one. Safe to call often (merged, never throws). */
export function checkForUpdate(force = false): Promise<void> {
  if (!UPDATES_ENABLED) return Promise.resolve();
  const current = currentBuildId();
  if (!current) return Promise.resolve();
  if (inflight) return inflight;
  if (!force && Date.now() - lastCheck < MIN_GAP_MS) return Promise.resolve();
  lastCheck = Date.now();
  inflight = (async () => {
    try {
      // Also look for a newer service worker: it precaches the new shell meanwhile.
      registration?.update?.()?.catch?.(() => undefined);
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const buildId = typeof data?.buildId === 'string' ? data.buildId : '';
      if (!buildId || buildId === current) return;
      if (useAppUpdateStore.getState().available?.buildId !== buildId) {
        useAppUpdateStore.setState({
          available: { buildId, version: typeof data.version === 'string' ? data.version : undefined, builtAt: data.builtAt },
        });
      }
    } catch {
      // offline, or not JSON (an older server without version.json): ask later
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function sameOriginHashed(url: string): boolean {
  try {
    const u = new URL(url, win.location.href);
    return u.origin === win.location.origin && (u.pathname.startsWith('/_expo/static/') || u.pathname.startsWith('/assets/'));
  } catch {
    return false;
  }
}

function registerServiceWorker() {
  const sw = win?.navigator?.serviceWorker;
  if (!sw?.register) return;
  let hadController = !!sw.controller;
  sw.addEventListener?.('controllerchange', () => {
    // The very first install only claims this page; a replaced worker is a new build.
    if (hadController) checkForUpdate(true);
    hadController = true;
  });
  const register = () => {
    sw.register('/sw.js', { scope: '/' })
      .then((reg: any) => {
        registration = reg;
        reg.addEventListener?.('updatefound', () => {
          const worker = reg.installing;
          checkForUpdate(true);
          worker?.addEventListener?.('statechange', () => {
            if (worker.state === 'installed' || worker.state === 'activated') checkForUpdate(true);
          });
        });
        // The bundle and fonts were loaded before the worker controlled the page:
        // hand them over so an offline start can boot.
        return sw.ready.then((ready: any) => {
          const entries: any[] = win.performance?.getEntriesByType?.('resource') ?? [];
          const urls = entries.map((e) => String(e.name)).filter(sameOriginHashed);
          ready?.active?.postMessage?.({ type: 'CACHE_URLS', urls });
        });
      })
      .catch(() => undefined);
  };
  if (win.document?.readyState === 'complete') register();
  else win.addEventListener('load', register, { once: true });
}

/** Starts the service worker and the checks (idempotent; no-op on native and in dev). */
export function startAppUpdates() {
  if (!UPDATES_ENABLED || started) return;
  started = true;
  registerServiceWorker();
  setInterval(() => checkForUpdate(), CHECK_EVERY_MS);
  win.document?.addEventListener?.('visibilitychange', () => {
    if (win.document.visibilityState === 'visible') checkForUpdate();
  });
  win.addEventListener?.('online', () => checkForUpdate(true));
  checkForUpdate(true);
}

/** « Plus tard ». */
export function snoozeUpdate() {
  useAppUpdateStore.setState({ snoozedUntil: Date.now() + SNOOZE_MS });
}

/** « Mettre à jour »: a waiting worker takes over, then the page reloads onto the new build. */
export async function applyUpdate(): Promise<void> {
  if (!win) return;
  try {
    win.sessionStorage?.setItem(
      UPDATED_FLAG,
      JSON.stringify({ from: currentBuildId(), to: useAppUpdateStore.getState().available?.buildId ?? null, at: Date.now() }),
    );
  } catch {
    // no toast after the reload, that is all
  }
  try {
    const sw = win.navigator?.serviceWorker;
    const reg = registration ?? (await sw?.getRegistration?.());
    const waiting = reg?.waiting;
    if (waiting && sw) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1500);
        sw.addEventListener('controllerchange', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
        waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    }
  } catch {
    // reload anyway: navigations are network first
  }
  win.location.reload();
}

/** True once, on the first start after « Mettre à jour » actually changed the build. */
export function consumeJustUpdated(): boolean {
  if (!UPDATES_ENABLED) return false;
  try {
    const raw = win.sessionStorage?.getItem(UPDATED_FLAG);
    if (!raw) return false;
    win.sessionStorage.removeItem(UPDATED_FLAG);
    const flag = JSON.parse(raw);
    if (Date.now() - Number(flag?.at ?? 0) > 2 * 60 * 1000) return false;
    const now = currentBuildId();
    return !!now && now !== flag?.from;
  } catch {
    return false;
  }
}
