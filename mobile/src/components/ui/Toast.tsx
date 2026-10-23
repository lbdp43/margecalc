/**
 * Toast (spec §3.14). Mount <ToastHost /> once (App.tsx), then anywhere:
 *
 *   toast.success('Hendrick’s Gin enregistré');
 *   toast.error('Connexion impossible');
 *   toast.info('Tarifs à jour · Barème officiel des douanes');
 *   toast.success('Produit supprimé', { action: { label: 'Annuler', onPress: undo } });
 *
 * - ink pill, 52 tall, radius 16, e3; icon in em300 / #FF8B78; action in lime.
 * - 3 s, or 5 s with an action (errors 5 s). Swipe down to dismiss.
 * - Sits 12 px above the sticky action bar, else above the floating tab bar.
 * - Never shown on top of an open BottomSheet or Dialog: it waits until the
 *   overlay closes. One opening over a toast already seen (> 800 ms) dismisses it.
 * - The newest message wins: it replaces a plain toast at once, and cuts an
 *   action toast down to 1,5 s. A toast that waited more than 4 s (not
 *   counting time behind an open overlay) is dropped.
 *
 * Undo toasts (lot 2 n° 11): act now, commit later, « Annuler » meanwhile.
 *
 *   const h = toast.undo('Aperol supprimé', {
 *     onUndo: restore,            // « Annuler » (or ⌘Z / Ctrl Z on web): put it back, no request
 *     onCommit: sendDelete,       // the window closed without an undo: do the real write
 *     commitOnLeave: true,        // the app goes to the background / the page is left: commit at once
 *   });                           // h.undo() · h.commit()
 *
 * - « Annuler » carries a countdown (6 s by default): the seconds left in a
 *   draining lime ring (UndoCountdown). The clock is time-based and PAUSES
 *   while the toast is held (touch), hovered (mouse), hidden behind a sheet or
 *   a dialog, or while the app is in the background.
 * - Exactly one of `onUndo` / `onCommit` runs: swiping it away, a newer toast
 *   (after 1,5 s), `toast.clear()` never drop it (it stays), and the end of the
 *   countdown all commit. Never de-duplicated, never dropped as stale.
 * - Logic adapted from Kokonut UI « Undo Button » by @dorianbaffier
 *   (kokonutui.com, MIT License, Copyright (c) 2025 kokonutUI): phase
 *   pending → done with onAction / onCommit / onUndo, time accumulated per
 *   tick (not one setTimeout) so it can pause, ⌘Z while pending.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AppState, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { elevation, fontFamily, layout, motion, palette, type } from '../../theme';
import { stickyBarHeight, useChromeStore } from './chrome';
import { PressableScale } from './PressableScale';
import { IconName } from './Icon';
import { UndoCountdown } from './UndoCountdown';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastOptions {
  action?: { label: string; onPress: () => void };
  /** ms (default 3000; 5000 with an action or for errors). */
  duration?: number;
  icon?: IconName;
}

export interface UndoToastOptions {
  /** « Annuler »: put things back (no request for a deferred write). */
  onUndo: () => void;
  /** The window closed without an undo (countdown over, swiped away, replaced, app left): do the real write. */
  onCommit?: () => void;
  /** Length of the undo window, in ms (default 6000). */
  duration?: number;
  /** Action label (default « Annuler »). */
  label?: string;
  /** Commit at once when the app goes to the background or the page is left (deferred deletes). */
  commitOnLeave?: boolean;
  icon?: IconName;
  kind?: ToastKind;
}

export interface UndoHandle {
  id: number;
  /** Same as tapping « Annuler » (no-op once settled). */
  undo: () => void;
  /** Close the window now and commit (no-op once settled). */
  commit: () => void;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
  /** When it was asked for: a toast still waiting after STALE_MS is dropped. */
  queuedAt: number;
  undo?: UndoToastOptions;
  /** Undo toasts: onUndo or onCommit already ran. */
  settled?: boolean;
}

/** A toast that waited longer than this (behind other toasts) is no longer news. Time spent behind an open sheet or dialog does not count. */
const STALE_MS = 4000;
/** A toast seen for longer than this is dismissed, not re-shown, when an overlay opens over it. */
const SEEN_MS = 800;
/** A new toast cuts a visible action toast down to at most this. */
const ACTION_GRACE_MS = 1500;
/** Default undo window. */
export const UNDO_MS = 6000;

type Listener = (queue: ToastItem[]) => void;
type HostCommand = { type: 'preempt' } | { type: 'shorten'; ms: number } | { type: 'hide'; id: number };
let queue: ToastItem[] = [];
let seq = 0;
/** The toast the host is showing right now (kept by ToastHost). */
let shownNow: { id: number; at: number } | null = null;
const listeners = new Set<Listener>();
const hostCommands = new Set<(c: HostCommand) => void>();
const emit = () => listeners.forEach((l) => l(queue));
const command = (c: HostCommand) => hostCommands.forEach((h) => h(c));
/** Undo clocks, per toast id: kept while the toast is hidden behind an overlay. */
const clocks = new Map<number, { elapsed: number; duration: number }>();

/** Runs exactly one of onUndo / onCommit for an undo toast. */
function settle(item: ToastItem, how: 'undo' | 'commit') {
  if (!item.undo || item.settled) return;
  item.settled = true;
  try {
    if (how === 'undo') item.undo.onUndo();
    else item.undo.onCommit?.();
  } catch {
    // A failing callback must never break the toast queue.
  }
}

/**
 * Queue rules: one toast on screen at a time, and the newest message wins.
 * - A new toast replaces a visible toast that has no action, at once.
 * - A visible action toast (« Annuler ») is cut down to 1,5 s, then the new one shows.
 * - Waiting toasts without an action are superseded by the new one.
 */
function show(message: string, kind: ToastKind = 'info', opts: ToastOptions = {}, undo?: UndoToastOptions): number {
  if (!message) return 0;
  // de-duplicate identical consecutive messages (never an undo toast: each one owns a write)
  const last = queue[queue.length - 1];
  if (!undo && last && !last.undo && last.message === message && last.kind === kind) return 0;
  const item: ToastItem = { id: ++seq, kind, message, queuedAt: Date.now(), ...opts, undo };
  const current = queue[0];
  const currentShown = !!current && shownNow?.id === current.id;
  const waiting = queue.slice(currentShown ? 1 : 0).filter((t) => !!t.action);
  queue = [...(currentShown ? [current] : []), ...waiting, item];
  emit();
  if (currentShown) command(current.action ? { type: 'shorten', ms: ACTION_GRACE_MS } : { type: 'preempt' });
  return item.id;
}

/** Removes a toast from the queue. An undo toast that was neither undone nor committed commits here. */
function dismiss(id: number) {
  const item = queue.find((t) => t.id === id);
  if (!item) return;
  settle(item, 'commit');
  clocks.delete(id);
  queue = queue.filter((t) => t.id !== id);
  emit();
}

/** Settles an undo toast now and takes it off screen (fade when it is showing). */
function settleNow(id: number, how: 'undo' | 'commit') {
  const item = queue.find((t) => t.id === id);
  if (!item || item.settled) return;
  settle(item, how);
  if (shownNow?.id === id) command({ type: 'hide', id });
  else dismiss(id);
}

/** The app goes to the background, or the page is left: commit the deferred writes at once. */
function commitOnLeave() {
  const leaving = queue.filter((t) => t.undo?.commitOnLeave && !t.settled);
  if (!leaving.length) return;
  leaving.forEach((t) => settle(t, 'commit'));
  leaving.forEach((t) => clocks.delete(t.id));
  queue = queue.filter((t) => !leaving.includes(t));
  emit();
}

let leaveWired = false;
function wireLeave() {
  if (leaveWired) return;
  leaveWired = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'background') commitOnLeave();
  });
  const w: any = Platform.OS === 'web' ? (globalThis as any).window : undefined;
  w?.addEventListener?.('pagehide', commitOnLeave);
}

function undo(message: string, opts: UndoToastOptions): UndoHandle {
  wireLeave();
  const label = opts.label ?? 'Annuler';
  const id = show(
    message,
    opts.kind ?? 'success',
    { icon: opts.icon, action: { label, onPress: () => settleNow(id, 'undo') } },
    { ...opts, label, duration: opts.duration ?? UNDO_MS },
  );
  return { id, undo: () => settleNow(id, 'undo'), commit: () => settleNow(id, 'commit') };
}

export const toast = {
  show,
  success: (message: string, opts?: ToastOptions) => show(message, 'success', opts),
  error: (message: string, opts?: ToastOptions) => show(message, 'error', opts),
  info: (message: string, opts?: ToastOptions) => show(message, 'info', opts),
  /** « Aperol supprimé · Annuler ⑥ »: see the header. */
  undo,
  /**
   * Remove every pending toast. Undo toasts stay (each one still owns a
   * write): a newer toast cuts them to 1,5 s, then they commit.
   */
  clear: () => {
    queue = queue.filter((t) => t.undo && !t.settled);
    emit();
  },
  /** Commit every open undo window now (sign-out…). */
  commitPending: () => {
    const open = queue.filter((t) => t.undo && !t.settled);
    open.forEach((t) => settle(t, 'commit'));
    open.forEach((t) => clocks.delete(t.id));
    if (open.length) {
      queue = queue.filter((t) => !open.includes(t));
      emit();
    }
  },
};

// Dev only: lets Playwright / the console fire toasts (`__mbToast.success('…')`).
if (__DEV__ && Platform.OS === 'web') (globalThis as any).__mbToast = toast;

const ICONS: Record<ToastKind, { name: IconName; color: string }> = {
  success: { name: 'checkmark-circle', color: palette.em300 },
  error: { name: 'alert-circle', color: '#FF8B78' },
  info: { name: 'information-circle', color: palette.em300 },
};

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>(queue);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const sheetCount = useChromeStore((s) => s.sheetCount);
  const tabBarVisible = useChromeStore((s) => s.tabBarVisible);
  const sticky = useChromeStore(stickyBarHeight);
  const [shownId, setShownId] = useState<number | null>(null);
  const y = useSharedValue(16);
  const opacity = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endsAt = useRef(0);
  const drag = useSharedValue(0);
  // Undo clock: ms left (drawn by the ring) and what holds it.
  const [undoLeft, setUndoLeft] = useState(0);
  const pause = useRef({ press: false, hover: false, away: AppState.currentState === 'background' || AppState.currentState === 'inactive' });

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const current = items[0];
  const blocked = sheetCount > 0;

  const finishHide = (afterId: number) => {
    if (shownNow?.id === afterId) shownNow = null;
    setShownId((id) => (id === afterId ? null : id));
    drag.value = 0;
    dismiss(afterId);
  };

  const hide = (afterId: number, duration: number = motion.duration.fast) => {
    // Never fade out a newer toast with an older one's timer.
    if (shownNow?.id !== afterId) {
      dismiss(afterId);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    opacity.value = withTiming(0, { duration, easing: motion.easing.accel }, (finished) => {
      if (finished) runOnJS(finishHide)(afterId);
    });
  };

  const schedule = (id: number, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    endsAt.current = Date.now() + ms;
    timer.current = setTimeout(() => hide(id), ms);
  };

  // When the last overlay closed: what waited behind it was deliberately held
  // back (« Tarifs à jour », « Compte créé » behind the welcome sheet), not
  // stale — its waiting clock starts there.
  const wasBlocked = useRef(blocked);
  const unblockedAt = useRef(0);

  useEffect(() => {
    if (wasBlocked.current && !blocked) unblockedAt.current = Date.now();
    wasBlocked.current = blocked;
    if (!current || blocked || shownId === current.id) return;
    // A sheet that opened in this same commit is not in `blocked` yet.
    if (useChromeStore.getState().sheetCount > 0) return;
    // Waited too long behind other toasts: drop it (never an undo toast: it still owns a write).
    if (!current.undo && Date.now() - Math.max(current.queuedAt, unblockedAt.current) > STALE_MS) {
      dismiss(current.id);
      return;
    }
    setShownId(current.id);
    shownNow = { id: current.id, at: Date.now() };
    drag.value = 0;
    y.value = reduce ? 0 : 16;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: reduce ? 120 : motion.duration.fast });
    if (!reduce) y.value = withSpring(0, motion.spring.gentle);
    if (current.undo) {
      // The clock effect below runs the window; it resumes where it stopped (behind a sheet).
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const clock = clocks.get(current.id) ?? { elapsed: 0, duration: current.undo.duration ?? UNDO_MS };
      clocks.set(current.id, clock);
      setUndoLeft(Math.max(0, clock.duration - clock.elapsed));
    } else schedule(current.id, current.duration ?? (current.action || current.kind === 'error' ? 5000 : 3000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, blocked, shownId]);

  // toast.clear() removed the toast on screen: drop its timer too.
  useEffect(() => {
    if (shownId === null || items.some((t) => t.id === shownId)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (shownNow?.id === shownId) shownNow = null;
    setShownId(null);
  }, [items, shownId]);

  // A newer toast arrived while this one is on screen.
  useEffect(() => {
    const onCommand = (c: HostCommand) => {
      const live = shownNow;
      if (!live) return;
      if (c.type === 'hide') {
        if (c.id === live.id) hide(live.id);
        return;
      }
      if (c.type === 'preempt') hide(live.id, 100);
      else {
        const clock = clocks.get(live.id);
        if (clock) clock.elapsed = Math.max(clock.elapsed, clock.duration - c.ms);
        else if (endsAt.current - Date.now() > c.ms) schedule(live.id, c.ms);
      }
    };
    hostCommands.add(onCommand);
    return () => {
      hostCommands.delete(onCommand);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A sheet or dialog opened while a toast is showing — never stack overlays.
  // Already read (on screen for more than 800 ms): dismiss it. Barely seen:
  // hide it now and show it again once the overlay closes (unless it is stale by then).
  // Undo toasts always come back once the overlay closes, their clock stopped meanwhile.
  useEffect(() => {
    if (!blocked || shownId === null) return;
    const live = shownNow;
    const isUndo = !!queue.find((t) => t.id === shownId)?.undo;
    if (!isUndo && live && live.id === shownId && Date.now() - live.at > SEEN_MS) {
      hide(live.id, 100);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    shownNow = null;
    opacity.value = withTiming(0, { duration: 100 });
    const t = setTimeout(() => setShownId(null), 110);
    return () => clearTimeout(t);
    // Also when the toast appeared in the same commit as the overlay (shownId
    // set after `blocked` flipped): it must not stay on top of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, shownId]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    shownNow = null;
  }, []);

  // ── Undo clock: time-based, paused while held, hovered or in the background ──
  const undoShown = !!current?.undo && shownId === current.id && !blocked;
  useEffect(() => {
    if (!undoShown || !current) return;
    const id = current.id;
    pause.current.press = false;
    pause.current.hover = false;
    let last = Date.now();
    const tick = () => {
      const clock = clocks.get(id);
      if (!clock) return;
      const now = Date.now();
      const p = pause.current;
      if (!(p.press || p.hover || p.away)) clock.elapsed += now - last;
      last = now;
      const left = Math.max(0, clock.duration - clock.elapsed);
      setUndoLeft(left);
      if (left <= 0) {
        clearInterval(interval);
        hide(id);
      }
    };
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoShown, current?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      pause.current.away = state !== 'active';
    });
    return () => sub.remove();
  }, []);

  // ⌘Z / Ctrl Z while an undo toast is on screen (web, keyboard; ignored in fields).
  useEffect(() => {
    if (!undoShown || !current || Platform.OS !== 'web') return;
    const w: any = (globalThis as any).window;
    if (!w?.addEventListener) return;
    const id = current.id;
    const onKey = (e: any) => {
      const t = e.target as any;
      const editable = !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && String(e.key).toLowerCase() === 'z' && !editable) {
        e.preventDefault();
        settleNow(id, 'undo');
      }
    };
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoShown, current?.id]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        drag.value = Math.max(0, g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 28 || g.vy > 0.5) {
          const id = shownNow?.id;
          if (id !== undefined) hide(id);
        } else drag.value = withSpring(0, motion.spring.snappy);
      },
    }),
  ).current;

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value + drag.value }],
  }));

  if (!current || shownId !== current.id) return null;

  const bottom = sticky
    ? sticky + 12
    : tabBarVisible
      ? layout.floatingBottom(insets.bottom)
      : insets.bottom + 16;
  const icon = current.icon ? { name: current.icon, color: palette.em300 } : ICONS[current.kind];
  const undoItem = current.undo;
  const undoDuration = undoItem ? clocks.get(current.id)?.duration ?? undoItem.duration ?? UNDO_MS : 0;
  const undoSeconds = Math.ceil(undoLeft / 1000);
  // Held (touch) or hovered (mouse only: a tap's emulated mouseenter never pauses for good).
  const holdHandlers: any = undoItem
    ? {
        onTouchStart: () => (pause.current.press = true),
        onTouchEnd: () => (pause.current.press = false),
        onTouchCancel: () => (pause.current.press = false),
        onPointerEnter: (e: any) => {
          if (e?.nativeEvent?.pointerType === 'mouse') pause.current.hover = true;
        },
        onPointerLeave: (e: any) => {
          if (e?.nativeEvent?.pointerType === 'mouse') pause.current.hover = false;
        },
      }
    : null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <Animated.View
        {...pan.panHandlers}
        {...holdHandlers}
        style={[styles.toast, undoItem ? styles.toastUndo : null, { bottom }, style]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        testID={undoItem ? 'toast-undo' : 'toast'}
      >
        <Ionicons name={icon.name} size={20} color={icon.color} />
        {/* 3 lines: a full French sentence (« Session expirée : reconnectez-vous… ») is never cut. */}
        <Text style={styles.text} numberOfLines={3}>
          {current.message}
        </Text>
        {current.action ? (
          <PressableScale
            scaleTo="chip"
            onPress={() => {
              if (undoItem) {
                // settleNow fades it out (undo runs first, exactly once).
                current.action?.onPress();
                return;
              }
              current.action?.onPress();
              hide(current.id);
            }}
            accessibilityLabel={
              undoItem
                ? `${current.action.label}, ${undoSeconds} seconde${undoSeconds > 1 ? 's' : ''} pour annuler`
                : current.action.label
            }
            hitSlop={undoItem ? { top: 4, bottom: 4, left: 8, right: 8 } : 8}
            style={[styles.action, undoItem ? styles.actionUndo : null]}
            testID={undoItem ? 'toast-undo-action' : undefined}
          >
            <Text style={styles.actionText}>{current.action.label}</Text>
            {undoItem ? <UndoCountdown remaining={undoDuration ? undoLeft / undoDuration : 0} seconds={undoSeconds} still={reduce} /> : null}
          </PressableScale>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 1000, ...(Platform.OS === 'web' ? ({ position: 'fixed' } as any) : null) },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignSelf: 'center',
    maxWidth: 520,
    marginHorizontal: 'auto',
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: palette.ink,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    ...elevation.e3,
  },
  text: { ...type.calloutStrong, color: '#FFFFFF', flex: 1 },
  action: { paddingHorizontal: 4, height: 32, justifyContent: 'center' },
  // 44 tall (40 + 4 px slop above and below): « Annuler » plus its countdown ring.
  toastUndo: { paddingRight: 8, paddingVertical: 6 },
  actionUndo: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderRadius: 12 },
  actionText: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 20, color: palette.lime },
});
