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
 * - Never shown on top of an open BottomSheet or Dialog: queued until it closes.
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
}

type Listener = (queue: ToastItem[]) => void;
let queue: ToastItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(queue));

function show(message: string, kind: ToastKind = 'info', opts: ToastOptions = {}) {
  if (!message) return;
  // de-duplicate identical consecutive messages
  const last = queue[queue.length - 1];
  if (last && last.message === message && last.kind === kind) return;
  queue = [...queue, { id: ++seq, kind, message, ...opts }];
  emit();
}

function dismissCurrent() {
  queue = queue.slice(1);
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
  const drag = useSharedValue(0);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const current = items[0];
  const blocked = sheetCount > 0;

  const hide = (afterId: number) => {
    if (timer.current) clearTimeout(timer.current);
    opacity.value = withTiming(0, { duration: motion.duration.fast, easing: motion.easing.accel }, (finished) => {
      if (finished) runOnJS(finishHide)(afterId);
    });
  };

  const finishHide = (afterId: number) => {
    setShownId(null);
    drag.value = 0;
    if (queue[0]?.id === afterId) dismissCurrent();
  };

  useEffect(() => {
    if (!current || blocked || shownId === current.id) return;
    setShownId(current.id);
    drag.value = 0;
    y.value = reduce ? 0 : 16;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: reduce ? 120 : motion.duration.fast });
    if (!reduce) y.value = withSpring(0, motion.spring.gentle);
    const duration = current.duration ?? (current.action || current.kind === 'error' ? 5000 : 3000);
    if (timer.current) clearTimeout(timer.current);
    const id = current.id;
    timer.current = setTimeout(() => hide(id), duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, blocked, shownId]);

  // A sheet or dialog opened while a toast is showing: hide it now and show
  // it again (full duration) once the overlay closes — never stack overlays.
  useEffect(() => {
    if (!blocked || shownId === null) return;
    if (timer.current) clearTimeout(timer.current);
    opacity.value = withTiming(0, { duration: 100 });
    const t = setTimeout(() => setShownId(null), 110);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        drag.value = Math.max(0, g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 28 || g.vy > 0.5) {
          const id = queue[0]?.id;
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
