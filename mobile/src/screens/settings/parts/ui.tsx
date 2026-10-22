/**
 * Small building blocks shared by the Réglages sections and sheets.
 * Everything is composed from the D1 kit (tokens + components).
 *
 * - `SettingsSection`: a group with a light header (one per area).
 * - `Sheet`: the kit BottomSheet + `useSheetLifecycle` (browser/Android back
 *   closes it first, it closes when the screen loses focus, and a toast that is
 *   already on screen is dismissed instead of coming back later).
 * - `SwitchRow`: a ListRow whose whole row toggles the switch (44 pt target,
 *   role « switch »), with an off track that stays visible on white.
 * - `SheetFlash` / `useSheetFlash`: the inline confirmation shown inside a sheet
 *   (toasts never show over a sheet).
 */
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContext } from '@react-navigation/native';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import {
  BottomSheet,
  BottomSheetProps,
  Button,
  FadeIn,
  IconName,
  ListRow,
  ListRowProps,
  PressableScale,
  Skeleton,
  toast,
} from '../../../components/ui';
import { springOrTiming } from '../../../components/ui/motion';
import { elevation, fontFamily, motion, palette, radius, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';

// ─── Section ───────────────────────────────────────────────────────────────
/** A titled group of the Réglages screen (entrance staggered by `index`). */
export function SettingsSection({
  title,
  index,
  right,
  footer,
  children,
  testID,
}: {
  title: string;
  index: number;
  right?: React.ReactNode;
  footer?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <FadeIn index={index} style={[styles.section, index === 0 && styles.sectionFirst]} testID={testID}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      {children}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </FadeIn>
  );
}

// ─── Sheet lifecycle ───────────────────────────────────────────────────────
type WebWindow = {
  history: { state: any; pushState: (s: any, t: string) => void; back: () => void };
  addEventListener: (t: string, l: () => void) => void;
  removeEventListener: (t: string, l: () => void) => void;
};
const webWindow: WebWindow | undefined = Platform.OS === 'web' ? (globalThis as any).window : undefined;
let sheetSeq = 0;
/** Our own `history.back()` that is still in flight (the next sheet waits for it). */
let pendingBack: Promise<void> | null = null;

function popOwnEntry(w: WebWindow) {
  pendingBack = new Promise<void>((resolve) => {
    const done = () => {
      w.removeEventListener('popstate', done);
      clearTimeout(timer);
      pendingBack = null;
      resolve();
    };
    const timer = setTimeout(done, 250);
    w.addEventListener('popstate', done);
    w.history.back();
  });
}

/**
 * Wire an overlay of Réglages to the platform:
 * - web: opening it pushes a history entry (same URL, same React Navigation
 *   id), so the browser back button closes the sheet instead of leaving the
 *   screen underneath it; closing it any other way removes that entry;
 * - it closes when its screen loses focus (tab change, programmatic
 *   navigation), so it never stays on top of another screen;
 * - a toast already visible when it opens is dismissed (it would otherwise
 *   come back, stale, once the overlay closes).
 * Android back is handled by the BottomSheet's Modal itself.
 */
export function useSheetLifecycle(visible: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const navigation = useContext(NavigationContext);

  useEffect(() => {
    if (!visible) return undefined;
    toast.clear();
    return undefined;
  }, [visible]);

  useEffect(() => {
    if (!visible || !navigation) return undefined;
    return navigation.addListener('blur', () => closeRef.current());
  }, [visible, navigation]);

  useEffect(() => {
    const w = webWindow;
    if (!visible || !w) return undefined;
    const token = ++sheetSeq;
    let active = true;
    let pushed = false;
    let poppedByUser = false;
    const onPop = () => {
      if (w.history.state?.mbSheet === token) return;
      poppedByUser = true;
      w.removeEventListener('popstate', onPop);
      closeRef.current();
    };
    const push = () => {
      if (!active) return;
      // Keep React Navigation's id so its own popstate handler sees « same screen ».
      w.history.pushState({ ...(w.history.state ?? {}), mbSheet: token }, '');
      pushed = true;
      w.addEventListener('popstate', onPop);
    };
    if (pendingBack) pendingBack.then(push);
    else push();
    return () => {
      active = false;
      w.removeEventListener('popstate', onPop);
      // Closed by ×, scrim, drag or an action: drop our entry, unless the user
      // already went back, or something else was pushed on top of it.
      if (pushed && !poppedByUser && w.history.state?.mbSheet === token) popOwnEntry(w);
    };
  }, [visible]);
}

/** The kit BottomSheet with the Réglages lifecycle (see `useSheetLifecycle`). */
export function Sheet(props: BottomSheetProps) {
  useSheetLifecycle(props.visible, props.onClose);
  return <BottomSheet {...props} />;
}

// ─── Switch row ────────────────────────────────────────────────────────────
function SwitchKnob({ value, disabled }: { value: boolean; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = springOrTiming(value ? 1 : 0, motion.spring.snappy, reduce);
  }, [value, p, reduce]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(p.value, [0, 1], [palette.text4, palette.em600]) }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 20 }] }));
  return (
    <Animated.View style={[styles.track, track, disabled && { opacity: 0.5 }]} pointerEvents="none">
      <Animated.View style={[styles.knob, knob]} />
    </Animated.View>
  );
}

export interface SwitchRowProps extends Omit<ListRowProps, 'right' | 'value' | 'onPress' | 'onLongPress' | 'switchValue' | 'onSwitchChange' | 'selected'> {
  value: boolean;
  onChange: (value: boolean) => void;
}

/** A ListRow whose whole surface toggles its switch. */
export function SwitchRow({ value, onChange, disabled, accessibilityLabel, testID, divider, ...row }: SwitchRowProps) {
  return (
    <PressableScale
      onPress={() => {
        haptics.select();
        onChange(!value);
      }}
      disabled={disabled}
      scaleTo="card"
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? [row.title, row.subtitle].filter(Boolean).join(', ')}
      testID={testID}
      style={styles.switchPress}
    >
      <ListRow {...row} divider={divider} disabled={disabled} right={<SwitchKnob value={value} disabled={disabled} />} />
    </PressableScale>
  );
}

// ─── Inline confirmation inside a sheet ────────────────────────────────────
export interface SheetFlashValue {
  id: number;
  text: string;
  tone?: 'good' | 'bad';
}

/** Inline confirmation shown inside a sheet for ~3,5 s. */
export function useSheetFlash(): [SheetFlashValue | null, (text: string, tone?: 'good' | 'bad') => void, () => void] {
  const [flash, setFlash] = useState<SheetFlashValue | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const show = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    if (timer.current) clearTimeout(timer.current);
    setFlash({ id: Date.now(), text, tone });
    timer.current = setTimeout(() => setFlash(null), 3600);
  }, []);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setFlash(null);
  }, []);
  return [flash, show, clear];
}

export function SheetFlash({ flash, style }: { flash: SheetFlashValue | null; style?: StyleProp<ViewStyle> }) {
  if (!flash) return null;
  const bad = flash.tone === 'bad';
  return (
    <FadeIn key={flash.id} offset={6} style={[styles.flash, bad && { backgroundColor: palette.badBg }, style]}>
      <Ionicons name={bad ? 'alert-circle' : 'checkmark-circle'} size={18} color={bad ? palette.bad : palette.good} />
      <Text style={[styles.flashText, bad && { color: palette.bad }]} accessibilityLiveRegion="polite">
        {flash.text}
      </Text>
    </FadeIn>
  );
}

// ─── Small pieces ──────────────────────────────────────────────────────────
/** Filled count pill (unread replies, open tickets). */
export function CountPill({ count, tone = 'brand', style }: { count: number; tone?: 'brand' | 'bad'; style?: StyleProp<ViewStyle> }) {
  if (!count) return null;
  return (
    <View
      style={[styles.pill, { backgroundColor: tone === 'bad' ? palette.bad : palette.em700 }, style]}
      accessibilityLabel={`${count} nouveau${count > 1 ? 'x' : ''}`}
    >
      <Text style={styles.pillText} maxFontSizeMultiplier={1.3}>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
}

/** Right accessory of a ListRow: optional value or pill, then the chevron. */
export function PillChevron({ count, tone, value }: { count: number; tone?: 'brand' | 'bad'; value?: string }) {
  return (
    <View style={styles.pillChevron}>
      {count ? <CountPill count={count} tone={tone} /> : value ? <Text style={styles.rightValue}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={palette.text4} />
    </View>
  );
}

/** Placeholder with the shape of a one-line ListRow (icon tile + two lines). */
export function RowSkeleton({ last }: { last?: boolean }) {
  return (
    <View style={[styles.skelRow, !last && styles.skelDivider]}>
      <Skeleton width={40} height={40} radius={12} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="48%" height={13} />
        <Skeleton width="72%" height={11} />
      </View>
    </View>
  );
}

/** « ‹ Retour » link at the top of a sheet's sub-view. */
export function SheetBack({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <View style={styles.back}>
      <Button title={label} variant="text" size="sm" icon="chevron-back" onPress={onPress} style={styles.backBtn} haptic="select" testID={testID} />
    </View>
  );
}

/** Calm information card (surface2) with a leading icon. */
export function InfoNote({
  icon = 'information-circle-outline',
  children,
  style,
  tone = 'neutral',
}: {
  icon?: IconName;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'neutral' | 'brand';
}) {
  return (
    <View style={[styles.note, tone === 'brand' && { backgroundColor: palette.em50 }, style]}>
      <Ionicons name={icon} size={20} color={palette.em700} style={{ marginTop: 1 }} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/** Inline error line (alert icon + bad text), for sheet-level errors. */
export function ErrorLine({ message, style }: { message?: string | null; style?: StyleProp<ViewStyle> }) {
  if (!message) return null;
  return (
    <FadeIn offset={4} style={[styles.errorRow, style]}>
      <Ionicons name="alert-circle" size={16} color={palette.bad} style={{ marginTop: 1 }} />
      <Text style={styles.errorText} accessibilityLiveRegion="polite">
        {message}
      </Text>
    </FadeIn>
  );
}

/** Small surface2 stat box used in admin sheets. */
export function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <View style={styles.mini} accessible accessibilityLabel={`${label} : ${value}`}>
      <Text style={styles.miniLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.miniValue, tone === 'bad' ? { color: palette.bad } : tone === 'good' ? { color: palette.good } : null]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionFirst: { marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 22,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: { ...type.footnoteStrong, color: palette.text3, flexShrink: 1 },
  footer: { ...type.footnote, color: palette.text3, marginTop: 8, paddingHorizontal: 4 },
  switchPress: { borderRadius: radius.md },
  track: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: palette.surface, ...elevation.knob },
  pill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16, color: palette.onEmerald, fontVariant: ['tabular-nums'] },
  pillChevron: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rightValue: { ...type.valueRow, color: palette.text2 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 12, minHeight: 56 },
  skelDivider: { borderBottomWidth: 1, borderBottomColor: palette.line, marginRight: 12 },
  back: { flexDirection: 'row', marginLeft: -12, marginTop: -4, marginBottom: 4 },
  backBtn: { paddingHorizontal: 8 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: palette.surface2,
    borderRadius: radius.md,
    padding: 14,
  },
  noteText: { ...type.callout, color: palette.text2, flex: 1, minWidth: 0 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  errorText: { ...type.footnote, color: palette.bad, flex: 1 },
  flash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.goodBg,
  },
  flashText: { ...type.calloutStrong, color: palette.good, flex: 1 },
  mini: {
    flex: 1,
    minWidth: 0,
    backgroundColor: palette.surface2,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  miniLabel: { ...type.footnote, color: palette.text3 },
  miniValue: { ...type.numM, color: palette.ink },
});
