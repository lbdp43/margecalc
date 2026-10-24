/**
 * PWA installation (web only; inert on native).
 *
 * Imported once at the very top of App.tsx, so it listens from the first
 * moment. index.html also keeps a `beforeinstallprompt` that fires before the
 * bundle runs (window.__mbInstallPrompt, see scripts/patch-html.js).
 *
 * - Chrome / Edge / Samsung Internet (Android and desktop): the browser's
 *   `beforeinstallprompt` is kept (preventDefault) and replayed by
 *   `promptInstall()` → the native « Installer l’application » dialog.
 * - iPhone / iPad: Safari has no install event. Installing is Partager ›
 *   « Sur l’écran d’accueil »: `isIOS` is true and the UI explains it
 *   (InstallAppCard › « Comment faire ? »). Chrome, Firefox and Edge on iOS
 *   offer the same since iOS 16.4; in-app browsers (Instagram, Facebook,
 *   Gmail, Google app…) cannot add to the home screen: hidden.
 * - Anything else (Firefox desktop/Android, Safari macOS…): no supported
 *   prompt → nothing is shown.
 * - Running installed (display-mode standalone, navigator.standalone), or
 *   installed from this browser (`appinstalled`): `isInstalled`.
 *
 *   const pwa = usePwaInstall();
 *   pwa.shouldShowCard   // dashboard card: installable, not installed, not snoozed / dismissed, welcome sheet closed
 *   pwa.canInstall       // Réglages row: installable and not installed (even after « Ne plus afficher »)
 *   pwa.isDesktop        // a computer: « dans sa propre fenêtre », not « écran d’accueil »
 *   await pwa.promptInstall() // 'accepted' | 'dismissed' | 'unavailable'
 *   pwa.snooze(7); pwa.dismissForever();
 *
 * Persistence: localStorage `margebar_pwa_install` =
 *   { dismissedForever: boolean, snoozeUntil: number, installedAt?: number }.
 */
import { Platform } from 'react-native';
import { create } from 'zustand';
import { toast } from '../components/ui/Toast';
import { haptics } from '../theme/haptics';

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';
/** Which iOS browser shows the Partager instructions (null: not iOS, or not able to). */
export type IosBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<unknown> | void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

interface Persisted {
  dismissedForever: boolean;
  snoozeUntil: number;
  installedAt?: number;
}

export const PWA_INSTALL_KEY = 'margebar_pwa_install';
const WELCOME_SEEN_KEY = 'margebar_welcome_seen';
const DAY_MS = 24 * 60 * 60 * 1000;
/** After the native dialog was refused, the card waits this long (Réglages still offers it). */
const SNOOZE_AFTER_REFUSAL_DAYS = 7;

const win: any = Platform.OS === 'web' ? (globalThis as any).window : undefined;

// ─── Platform detection (pure, exported for tests) ─────────────────────────
export interface BrowserInfo {
  /** iPhone, iPad (incl. iPadOS's desktop user agent) or iPod. */
  iosDevice: 'iPhone' | 'iPad' | null;
  /** The Partager › « Sur l’écran d’accueil » path is available in this browser. */
  iosBrowser: IosBrowser;
}

const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|LinkedInApp|Twitter|Snapchat|Pinterest|MicroMessenger|WhatsApp|Line\/|TikTok|musical_ly|BytedanceWebview|GSA\/|GoogleApp|Gmail|DuckDuckGo|YaBrowser|OPiOS|OPT\//i;

export function detectBrowser(ua: string, maxTouchPoints = 0): BrowserInfo {
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const iPhone = !iPad && /iPhone|iPod/.test(ua);
  if (!iPad && !iPhone) return { iosDevice: null, iosBrowser: null };
  const iosDevice = iPad ? 'iPad' : 'iPhone';
  if (IN_APP.test(ua)) return { iosDevice, iosBrowser: null };
  // iOS version: « iPhone OS 17_4 » / « CPU OS 17_4 » (iPad); iPadOS's desktop UA has
  // none, but its Safari « Version/17.4 » follows the OS.
  const m = ua.match(/(?:iPhone|CPU) OS (\d+)[_.](\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/);
  const major = m ? parseInt(m[1], 10) : 0;
  const minor = m ? parseInt(m[2], 10) : 0;
  const atLeast164 = major > 16 || (major === 16 && minor >= 4);
  const third = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : null;
  if (third) return { iosDevice, iosBrowser: atLeast164 ? third : null };
  // Safari itself carries « Version/x Safari/y »; a bare WKWebView (in-app browser) does not.
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return { iosDevice, iosBrowser: 'safari' };
  return { iosDevice, iosBrowser: null };
}

/**
 * A computer (Chrome / Edge on Windows, macOS, Linux, ChromeOS): the app
 * installs into its own window, not onto a home screen. Phones and tablets
 * (Android, iPhone, iPad incl. iPadOS's desktop user agent with touch) are not.
 * A touchscreen laptop stays a computer: only the iPad's Macintosh UA counts
 * touch points.
 */
export function detectDesktop(ua: string, maxTouchPoints = 0): boolean {
  if (/Android|iPhone|iPad|iPod|Mobi|Tablet|Silk|Kindle/i.test(ua)) return false;
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return false;
  return true;
}

const INSTALLED_MODES = ['standalone', 'minimal-ui', 'window-controls-overlay'];

function runningStandalone(): boolean {
  if (!win) return false;
  try {
    if (win.navigator?.standalone === true) return true;
    if (typeof win.matchMedia === 'function') {
      return INSTALLED_MODES.some((mode) => win.matchMedia(`(display-mode: ${mode})`).matches);
    }
  } catch {
    // ignore
  }
  return false;
}

// ─── Persistence ───────────────────────────────────────────────────────────
function readPersisted(): Persisted {
  try {
    const raw = win?.localStorage?.getItem(PWA_INSTALL_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const installedAt = Number(p?.installedAt);
      return {
        dismissedForever: p?.dismissedForever === true,
        snoozeUntil: Number.isFinite(Number(p?.snoozeUntil)) ? Number(p.snoozeUntil) : 0,
        ...(Number.isFinite(installedAt) && installedAt > 0 ? { installedAt } : {}),
      };
    }
  } catch {
    // private mode, blocked storage, bad JSON: defaults
  }
  return { dismissedForever: false, snoozeUntil: 0 };
}

function writePersisted(patch: Partial<Persisted>) {
  const next: Persisted = { ...readPersisted(), ...patch };
  if (!next.installedAt) delete next.installedAt;
  try {
    win?.localStorage?.setItem(PWA_INSTALL_KEY, JSON.stringify(next));
  } catch {
    // ignore: the choice then lasts for this session only
  }
}

function welcomeSeen(): boolean {
  try {
    return !!win?.localStorage?.getItem(WELCOME_SEEN_KEY);
  } catch {
    return true;
  }
}

// ─── Store ─────────────────────────────────────────────────────────────────
export type WelcomeGate = 'pending' | 'open' | 'done';

interface PwaInstallState {
  /** A native prompt (beforeinstallprompt) is held. */
  canPromptNatively: boolean;
  iosDevice: 'iPhone' | 'iPad' | null;
  iosBrowser: IosBrowser;
  /** Running as the installed app (standalone window). */
  standalone: boolean;
  /** Installed from this browser (`appinstalled` or an accepted prompt), until the browser offers it again. */
  installedHere: boolean;
  dismissedForever: boolean;
  snoozeUntil: number;
  /** The first-run welcome sheet (RootNavigator): the card waits until it is closed. */
  welcome: WelcomeGate;
}

const userAgent = String(win?.navigator?.userAgent ?? '');
const touchPoints = Number(win?.navigator?.maxTouchPoints ?? 0);
const browser = win ? detectBrowser(userAgent, touchPoints) : { iosDevice: null, iosBrowser: null };
const desktop = !!win && detectDesktop(userAgent, touchPoints);
const initial = readPersisted();
let deferred: BeforeInstallPromptEvent | null = win?.__mbInstallPrompt ?? null;

export const usePwaInstallStore = create<PwaInstallState>(() => ({
  canPromptNatively: !!deferred,
  iosDevice: browser.iosDevice,
  iosBrowser: browser.iosBrowser,
  standalone: runningStandalone(),
  installedHere: !deferred && (!!initial.installedAt || !!win?.__mbAppInstalledAt),
  dismissedForever: initial.dismissedForever,
  snoozeUntil: initial.snoozeUntil,
  welcome: welcomeSeen() ? 'done' : 'pending',
}));

const set = usePwaInstallStore.setState;

let lastAnnounced = 0;
/** « MargeBar Pro est installée » once, whether the install came from our button or the browser's own UI. */
function announceInstalled() {
  if (Date.now() - lastAnnounced < 10_000) return;
  lastAnnounced = Date.now();
  haptics.success();
  toast.success('MargeBar Pro est installée');
}

function markInstalled() {
  deferred = null;
  if (win) win.__mbInstallPrompt = null;
  writePersisted({ installedAt: Date.now() });
  set({ canPromptNatively: false, installedHere: true });
}

if (win) {
  win.addEventListener?.('beforeinstallprompt', (event: BeforeInstallPromptEvent) => {
    try {
      event.preventDefault();
    } catch {
      // ignore
    }
    deferred = event;
    // The browser offers installation again: the app is not (or no longer) installed here.
    if (readPersisted().installedAt) writePersisted({ installedAt: undefined });
    set({ canPromptNatively: true, installedHere: false });
  });
  win.addEventListener?.('appinstalled', () => {
    markInstalled();
    announceInstalled();
  });
  try {
    const mq = win.matchMedia?.('(display-mode: standalone)');
    const onChange = () => set({ standalone: runningStandalone() });
    if (mq?.addEventListener) mq.addEventListener('change', onChange);
    else mq?.addListener?.(onChange);
  } catch {
    // ignore
  }
}

// ─── Actions ───────────────────────────────────────────────────────────────
/**
 * Shows the browser's install dialog. 'unavailable' when there is no held
 * prompt (iOS: show the Partager instructions instead).
 */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event || typeof event.prompt !== 'function') return 'unavailable';
  // A prompt event can be used once.
  deferred = null;
  if (win) win.__mbInstallPrompt = null;
  set({ canPromptNatively: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice?.outcome === 'accepted') {
      markInstalled();
      announceInstalled();
      return 'accepted';
    }
    snooze(SNOOZE_AFTER_REFUSAL_DAYS);
    return 'dismissed';
  } catch {
    return 'unavailable';
  }
}

/** « Plus tard »: the dashboard card comes back after `days` days. */
export function snooze(days = 7) {
  const snoozeUntil = Date.now() + days * DAY_MS;
  writePersisted({ snoozeUntil });
  set({ snoozeUntil });
}

/** « Ne plus afficher »: the card never comes back (Réglages › Application still offers it). */
export function dismissForever() {
  writePersisted({ dismissedForever: true });
  set({ dismissedForever: true });
}

/** RootNavigator: the welcome sheet state (the card waits for « done »). */
export function setWelcomeGate(welcome: WelcomeGate) {
  if (usePwaInstallStore.getState().welcome !== welcome) set({ welcome });
}

// ─── Hook ──────────────────────────────────────────────────────────────────
export interface PwaInstall {
  canPromptNatively: boolean;
  /** The iOS Partager › « Sur l’écran d’accueil » path (Safari, or Chrome/Firefox/Edge on iOS ≥ 16.4). */
  isIOS: boolean;
  iosDevice: 'iPhone' | 'iPad' | null;
  iosBrowser: IosBrowser;
  /** A computer: the app opens in its own window (copy), not from a home screen. */
  isDesktop: boolean;
  isInstalled: boolean;
  /** Installation is possible here and the app is not installed (Réglages row). */
  canInstall: boolean;
  /** The dashboard card: `canInstall`, not snoozed, not dismissed, welcome sheet closed. */
  shouldShowCard: boolean;
  promptInstall: () => Promise<InstallOutcome>;
  snooze: (days?: number) => void;
  dismissForever: () => void;
}

export function usePwaInstall(): PwaInstall {
  const s = usePwaInstallStore();
  const web = !!win;
  const isIOS = web && s.iosBrowser !== null;
  const isInstalled = web && (s.standalone || s.installedHere);
  const canInstall = web && !isInstalled && (s.canPromptNatively || isIOS);
  return {
    canPromptNatively: web && s.canPromptNatively,
    isIOS,
    iosDevice: s.iosDevice,
    iosBrowser: s.iosBrowser,
    isDesktop: desktop,
    isInstalled,
    canInstall,
    shouldShowCard: canInstall && !s.dismissedForever && s.snoozeUntil <= Date.now() && s.welcome === 'done',
    promptInstall,
    snooze,
    dismissForever,
  };
}
