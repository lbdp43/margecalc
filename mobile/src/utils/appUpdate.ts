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
 * - A new worker that stays « waiting » is asked to take over (SKIP_WAITING)
 *   until it has (see nudgeWaitingWorker).
 * - `applyUpdate()`: a new worker still installing or waiting takes over
 *   first (SKIP_WAITING), then the page reloads; a sessionStorage flag makes
 *   the new page say « Application mise à jour » (or, when the reload landed
 *   on the same build, rest 30 minutes and say it did not work:
 *   consumeJustUpdated).
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
      if (registration?.waiting) nudgeWaitingWorker();
      else registration?.update?.()?.catch?.(() => undefined);
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

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A new worker calls skipWaiting() while it installs, but Chromium can drop
 * that activation when this page sends a request to the old worker at that
 * very moment: the new worker then stays « waiting », and a later reload of
 * this tab can hang while the browser swaps workers mid-navigation. So the page
 * asks a waiting worker to take over (SKIP_WAITING, idempotent) until it has.
 */
let nudging = false;
async function nudgeWaitingWorker(tries = 8): Promise<void> {
  if (nudging) return;
  nudging = true;
  try {
    for (let i = 0; i < tries; i++) {
      const waiting = registration?.waiting;
      if (!waiting) return;
      try {
        waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        return;
      }
      await wait(1500);
    }
  } finally {
    nudging = false;
  }
}

/** Resolves once no new worker is installing or waiting and the active one is ready (or after `ms`). */
async function settleWorkers(reg: any, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!reg.installing && !reg.waiting && (!reg.active || reg.active.state === 'activated')) return;
    try {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      // ignore
    }
    await wait(300);
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
        if (reg.waiting) nudgeWaitingWorker();
        reg.addEventListener?.('updatefound', () => {
          const worker = reg.installing;
          checkForUpdate(true);
          worker?.addEventListener?.('statechange', () => {
            // No request here when it is 'installed': the old worker is being swapped out (see above).
            if (worker.state === 'installed') nudgeWaitingWorker();
            else if (worker.state === 'activated') checkForUpdate(true);
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
    // A new worker still installing or waiting takes over first: the reload is
    // then served by it (and never swaps workers mid-navigation).
    const sw = win.navigator?.serviceWorker;
    const reg = registration ?? (await sw?.getRegistration?.());
    if (reg && sw?.controller) await settleWorkers(reg, 5000);
  } catch {
    // reload anyway: navigations are network first
  }
  win.location.reload();
}

export type UpdateOutcome = 'updated' | 'failed';

/**
 * Once, on the first start after « Mettre à jour »:
 * - 'updated': the page now runs another build;
 * - 'failed': it reloaded onto the very build it left, although a different
 *   one was announced (a proxy / CDN still served the old index.html mid-deploy,
 *   or the navigation fell back to the cached shell). The prompt then rests
 *   (snoozeUpdate, SNOOZE_MS) and says so instead of asking again at once;
 * - null: no update was just applied.
 */
export function consumeJustUpdated(): UpdateOutcome | null {
  if (!UPDATES_ENABLED) return null;
  try {
    const raw = win.sessionStorage?.getItem(UPDATED_FLAG);
    if (!raw) return null;
    win.sessionStorage.removeItem(UPDATED_FLAG);
    const flag = JSON.parse(raw);
    if (Date.now() - Number(flag?.at ?? 0) > 2 * 60 * 1000) return null;
    const now = currentBuildId();
    if (!now) return null;
    const from = typeof flag?.from === 'string' ? flag.from : null;
    const to = typeof flag?.to === 'string' ? flag.to : null;
    if (to && now !== to && now === from) return 'failed';
    return now !== from ? 'updated' : null;
  } catch {
    return null;
  }
}
