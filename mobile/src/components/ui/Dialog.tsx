/**
 * Dialog (spec §3.13 « centered modal »). Mount <DialogHost /> once (App.tsx).
 *
 *   const ok = await dialog.confirm({
 *     title: 'Supprimer ce produit ?', message: 'Cette action est définitive.',
 *     confirmLabel: 'Supprimer', destructive: true });
 *   await dialog.alert({ title: 'Lecture impossible', message: 'Reprenez la photo…' });
 *   const choice = await dialog.show({ title: '…', actions: [
 *     { label: 'Remplacer', value: 'replace', style: 'primary' },
 *     { label: 'Garder les deux', value: 'both', style: 'secondary' },
 *     { label: 'Annuler', value: null, style: 'cancel' } ] });
 *
 * Width 100 % − 40 (max 400), radius 24, padding 24, title3 title, 15/22 body,
 * actions stacked (primary, then text button). Destructive actions use a
 * `bad` text button, never a red filled button. Replaces window.alert/confirm.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { elevation, motion, palette, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { Button } from './Button';
import { IconName } from './Icon';
import { useChromeStore } from './chrome';
import { ModalFocusSink } from './ModalFocusSink';

export type DialogActionStyle = 'primary' | 'secondary' | 'cancel' | 'destructive';

export interface DialogAction<T = unknown> {
  label: string;
  value?: T;
  style?: DialogActionStyle;
}

export interface DialogOptions<T = unknown> {
  title: string;
  message?: string;
  actions?: DialogAction<T>[];
  icon?: IconName;
  tone?: 'brand' | 'bad' | 'warn';
  /** Tap on the scrim resolves with the cancel action (default true). */
  dismissible?: boolean;
}

interface Request extends DialogOptions<any> {
  id: number;
  resolve: (v: any) => void;
}

let pending: Request[] = [];
let seq = 0;
const listeners = new Set<(r: Request[]) => void>();
const emit = () => listeners.forEach((l) => l(pending));

function show<T = unknown>(opts: DialogOptions<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    pending = [...pending, { ...opts, id: ++seq, resolve }];
    emit();
  });
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: IconName;
}

function confirm(opts: ConfirmOptions | string, message?: string): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === 'string' ? { title: opts, message } : opts;
  if (o.destructive) haptics.warning();
  return show<boolean>({
    title: o.title,
    message: o.message,
    icon: o.icon ?? (o.destructive ? 'trash-outline' : undefined),
    tone: o.destructive ? 'bad' : 'brand',
    actions: [
      { label: o.confirmLabel ?? 'Confirmer', value: true, style: o.destructive ? 'destructive' : 'primary' },
      { label: o.cancelLabel ?? 'Annuler', value: false, style: 'cancel' },
    ],
  }).then((v) => v === true);
}

function alertDialog(opts: { title: string; message?: string; okLabel?: string; icon?: IconName; tone?: 'brand' | 'bad' | 'warn' } | string, message?: string): Promise<void> {
  const o = typeof opts === 'string' ? { title: opts, message } : opts;
  return show({
    title: o.title,
    message: o.message,
    icon: o.icon,
    tone: o.tone,
    actions: [{ label: o.okLabel ?? 'OK', value: true, style: 'primary' }],
  }).then(() => undefined);
}

export const dialog = { show, confirm, alert: alertDialog };

const TONES = {
  brand: { bg: palette.em50, fg: palette.em700 },
  bad: { bg: palette.badBg, fg: palette.bad },
  warn: { bg: palette.warnBg, fg: palette.warn },
};

/**
 * Presses within this delay after a dialog opens are ignored: the second tap
 * of a double tap (or the click that follows the long press which opened the
 * dialog) must never close it or hit one of its buttons. Same guard as
 * BottomSheet; keyboard activations (Enter/Space) are always allowed.
 */
const OPEN_GUARD_MS = 300;

let lastPointerDown = 0;
const webDocument: any = Platform.OS === 'web' ? (globalThis as any).document : undefined;
if (webDocument) {
  webDocument.addEventListener(
    'pointerdown',
    () => {
      lastPointerDown = Date.now();
    },
    true,
  );
}

export function DialogHost() {
  const [items, setItems] = useState<Request[]>(pending);
  const reduce = useReducedMotion();
  const current = items[0];
  const scrim = useSharedValue(0);
  const card = useSharedValue(0);
  const openedAt = useRef(0);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const overlayOpened = useChromeStore((s) => s.sheetOpened);
  const overlayClosed = useChromeStore((s) => s.sheetClosed);
  const isOpen = !!current;
  // Toasts wait while a dialog is open.
  useEffect(() => {
    if (!isOpen) return;
    overlayOpened();
    return () => overlayClosed();
  }, [isOpen, overlayOpened, overlayClosed]);

  // Web: swallow a click whose pointer went down before this dialog opened
  // (the tap that opened it), and any pointer click during the open guard.
  useEffect(() => {
    if (!webDocument || !isOpen) return undefined;
    const swallow = (e: { detail: number; stopPropagation: () => void; preventDefault: () => void }) => {
      if (e.detail > 0 && (lastPointerDown < openedAt.current || Date.now() - openedAt.current < OPEN_GUARD_MS)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    webDocument.addEventListener('click', swallow, true);
    return () => webDocument.removeEventListener('click', swallow, true);
  }, [isOpen]);

  useEffect(() => {
    if (!current) return;
    openedAt.current = Date.now();
    scrim.value = 0;
    card.value = 0;
    scrim.value = withTiming(1, { duration: 200 });
    card.value = reduce ? withTiming(1, { duration: 120 }) : withSpring(1, motion.spring.gentle);
  }, [current?.id, reduce, scrim, card]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.value * 1.4),
    transform: [{ scale: 0.94 + 0.06 * card.value }],
  }));

  if (!current) return null;

  // Native: presses in the first 300 ms after opening are ignored.
  const guarded = () => Platform.OS !== 'web' && Date.now() - openedAt.current < OPEN_GUARD_MS;

  const finish = (value: unknown) => {
    if (guarded()) return;
    const req = current;
    pending = pending.filter((p) => p.id !== req.id);
    emit();
    req.resolve(value);
  };

  const actions = current.actions?.length ? current.actions : [{ label: 'OK', value: true, style: 'primary' as const }];
  const cancel = actions.find((a) => a.style === 'cancel');
  const tone = TONES[current.tone ?? 'brand'];

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => {
        openedAt.current = 0; // Android back is a deliberate gesture: never guarded
        finish(cancel?.value);
      }}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <ModalFocusSink label={current.title} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }, scrimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (current.dismissible !== false && cancel ? finish(cancel.value) : undefined)}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Animated.View>
        <Animated.View style={[styles.card, cardStyle]} accessibilityViewIsModal accessibilityRole="alert">
          {current.icon ? (
            <View style={[styles.icon, { backgroundColor: tone.bg }]}>
              <Ionicons name={current.icon} size={24} color={tone.fg} />
            </View>
          ) : null}
          <Text style={styles.title} accessibilityRole="header">
            {current.title}
          </Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((a, i) => (
              <Button
                key={`${a.label}-${i}`}
                title={a.label}
                onPress={() => finish(a.value)}
                variant={
                  a.style === 'destructive'
                    ? 'destructive'
                    : a.style === 'cancel'
                      ? 'text'
                      : a.style === 'secondary'
                        ? 'secondary'
                        : 'primary'
                }
                textStyle={a.style === 'cancel' ? { color: palette.text2 } : undefined}
                style={a.style === 'destructive' ? styles.destructive : undefined}
                fullWidth
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: palette.surface,
    borderRadius: 24,
    padding: 24,
    paddingBottom: 16,
    ...elevation.e3,
  },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { ...type.title3, color: palette.ink },
  message: { ...type.callout, color: palette.text2, marginTop: 8 },
  actions: { marginTop: 24, gap: 4 },
  destructive: { backgroundColor: palette.badBg },
});
