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
 */
import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { elevation, fontFamily, layout, motion, palette, type } from '../../theme';
import { stickyBarHeight, useChromeStore } from './chrome';
import { PressableScale } from './PressableScale';
import { IconName } from './Icon';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastOptions {
  action?: { label: string; onPress: () => void };
  /** ms (default 3000; 5000 with an action or for errors). */
  duration?: number;
  icon?: IconName;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
  /** When it was asked for: a toast still waiting after STALE_MS is dropped. */
  queuedAt: number;
}

/** A toast that waited longer than this (behind other toasts) is no longer news. Time spent behind an open sheet or dialog does not count. */
const STALE_MS = 4000;
/** A toast seen for longer than this is dismissed, not re-shown, when an overlay opens over it. */
const SEEN_MS = 800;
/** A new toast cuts a visible action toast down to at most this. */
const ACTION_GRACE_MS = 1500;

type Listener = (queue: ToastItem[]) => void;
type HostCommand = { type: 'preempt' } | { type: 'shorten'; ms: number };
let queue: ToastItem[] = [];
let seq = 0;
/** The toast the host is showing right now (kept by ToastHost). */
let shownNow: { id: number; at: number } | null = null;
const listeners = new Set<Listener>();
const hostCommands = new Set<(c: HostCommand) => void>();
const emit = () => listeners.forEach((l) => l(queue));
const command = (c: HostCommand) => hostCommands.forEach((h) => h(c));

/**
 * Queue rules: one toast on screen at a time, and the newest message wins.
 * - A new toast replaces a visible toast that has no action, at once.
 * - A visible action toast (« Annuler ») is cut down to 1,5 s, then the new one shows.
 * - Waiting toasts without an action are superseded by the new one.
 */
function show(message: string, kind: ToastKind = 'info', opts: ToastOptions = {}) {
  if (!message) return;
  // de-duplicate identical consecutive messages
  const last = queue[queue.length - 1];
  if (last && last.message === message && last.kind === kind) return;
  const item: ToastItem = { id: ++seq, kind, message, queuedAt: Date.now(), ...opts };
  const current = queue[0];
  const currentShown = !!current && shownNow?.id === current.id;
  const waiting = queue.slice(currentShown ? 1 : 0).filter((t) => !!t.action);
  queue = [...(currentShown ? [current] : []), ...waiting, item];
  emit();
  if (currentShown) command(current.action ? { type: 'shorten', ms: ACTION_GRACE_MS } : { type: 'preempt' });
}

function dismiss(id: number) {
  if (!queue.some((t) => t.id === id)) return;
  queue = queue.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  show,
  success: (message: string, opts?: ToastOptions) => show(message, 'success', opts),
  error: (message: string, opts?: ToastOptions) => show(message, 'error', opts),
  info: (message: string, opts?: ToastOptions) => show(message, 'info', opts),
  /** Remove every pending toast. */
  clear: () => {
    queue = [];
    emit();
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
    // Waited too long behind other toasts: drop it.
    if (Date.now() - Math.max(current.queuedAt, unblockedAt.current) > STALE_MS) {
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
    schedule(current.id, current.duration ?? (current.action || current.kind === 'error' ? 5000 : 3000));
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
      if (c.type === 'preempt') hide(live.id, 100);
      else if (endsAt.current - Date.now() > c.ms) schedule(live.id, c.ms);
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
  useEffect(() => {
    if (!blocked || shownId === null) return;
    const live = shownNow;
    if (live && live.id === shownId && Date.now() - live.at > SEEN_MS) {
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

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <Animated.View
        {...pan.panHandlers}
        style={[styles.toast, { bottom }, style]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Ionicons name={icon.name} size={20} color={icon.color} />
        <Text style={styles.text} numberOfLines={2}>
          {current.message}
        </Text>
        {current.action ? (
          <PressableScale
            scaleTo="chip"
            onPress={() => {
              current.action?.onPress();
              hide(current.id);
            }}
            accessibilityLabel={current.action.label}
            hitSlop={8}
            style={styles.action}
          >
            <Text style={styles.actionText}>{current.action.label}</Text>
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
  actionText: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 20, color: palette.lime },
});
