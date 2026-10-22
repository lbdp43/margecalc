/**
 * BottomSheet (spec §3.13 + §5.8). Modal transparent + reanimated.
 *
 *   <BottomSheet visible={open} onClose={() => setOpen(false)}
 *     title="Catégorie fiscale" subline="13 catégories · barème des douanes 2026"
 *     search={{ value: q, onChangeText: setQ, placeholder: 'Porto, IPA, Lillet, cidre…' }}>
 *     <SectionHeader variant="caps" title="Spiritueux & liqueurs" />
 *     <ListRow title="Spiritueux" subtitle="…" right="radio" selected onPress={…} />
 *   </BottomSheet>
 *
 * - Scrim fades to 0.48 in 240 ms; the sheet rises with the gentle spring.
 * - Drag the grabber/header (or the content when scrolled to the top) down to
 *   dismiss: > 30 % of the height or > 900 px/s. Works with the mouse on web.
 * - Max 90 % of the screen (`snap="full"` → always 90 %). Content scrolls,
 *   with a white bottom fade when it overflows.
 * - While open, toasts are queued (never shown on top of a sheet).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { elevation, gradients, layout, motion, palette, radius, type } from '../../theme';
import { IconButton } from './Button';
import { TextField } from './TextField';
import { useChromeStore, useKeyboardHeight } from './chrome';
import { ModalFocusSink } from './ModalFocusSink';

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

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subline?: string;
  children?: React.ReactNode;
  search?: { value: string; onChangeText: (t: string) => void; placeholder?: string; autoFocus?: boolean };
  /** Fixed area under the content (e.g. a primary button). */
  footer?: React.ReactNode;
  /** 'content' (auto height, max 90 %) or 'full' (90 %). */
  snap?: 'content' | 'full';
  showClose?: boolean;
  /** Content padding (default 20; rows that carry their own 12 px padding look best with 8). */
  contentPadding?: number;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  subline,
  children,
  search,
  footer,
  snap = 'content',
  showClose = true,
  contentPadding = layout.gutter,
  scrollable = true,
  contentStyle,
  accessibilityLabel,
  testID,
}: BottomSheetProps) {
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const kb = useKeyboardHeight();
  const [mounted, setMounted] = useState(visible);
  const sheetH = useRef(winH * 0.6);
  const translate = useSharedValue(winH);
  const scrim = useSharedValue(0);
  const scrollTop = useRef(0);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const viewportH = useRef(0);
  const contentH = useRef(0);
  const closing = useRef(false);
  // Web: a click whose pointer went down BEFORE the sheet opened (the touch
  // that long-pressed a card) must not land on the scrim or a row of the sheet.
  const openedAt = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const sheetOpened = useChromeStore((s) => s.sheetOpened);
  const sheetClosed = useChromeStore((s) => s.sheetClosed);

  useEffect(() => {
    if (!webDocument || !visible) return undefined;
    const swallowGhostClick = (e: { detail: number; stopPropagation: () => void; preventDefault: () => void }) => {
      // detail 0 = keyboard-generated click: always allowed.
      if (e.detail > 0 && lastPointerDown < openedAt.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    webDocument.addEventListener('click', swallowGhostClick, true);
    return () => webDocument.removeEventListener('click', swallowGhostClick, true);
  }, [visible]);

  // Mount / unmount with animations
  useEffect(() => {
    if (visible) {
      closing.current = false;
      openedAt.current = Date.now();
      setMounted(true);
      sheetOpened();
      return () => {
        sheetClosed();
      };
    }
    return undefined;
  }, [visible, sheetOpened, sheetClosed]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      translate.value = reduce ? 0 : winH;
      scrim.value = 0;
      scrim.value = withTiming(1, { duration: reduce ? 120 : motion.duration.base });
      translate.value = reduce ? 0 : withSpring(0, motion.spring.gentle);
    } else {
      animateOut(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mounted]);

  function animateOut(done?: () => void) {
    scrim.value = withTiming(0, { duration: 220, easing: motion.easing.accel });
    translate.value = withTiming(
      reduce ? 0 : Math.max(sheetH.current, 300) + 40,
      { duration: 220, easing: motion.easing.accel },
      (finished) => {
        if (finished && done) runOnJS(done)();
      },
    );
  }

  const requestClose = () => {
    if (closing.current) return;
    closing.current = true;
    setTimeout(() => {
      closing.current = false;
    }, 500);
    Keyboard.dismiss();
    onCloseRef.current();
  };

  // Drag to dismiss
  const startDrag = useRef(0);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startDrag.current = translate.value;
      },
      onPanResponderMove: (_e, g) => {
        const dy = g.dy;
        translate.value = dy >= 0 ? startDrag.current + dy : startDrag.current + dy * 0.3;
      },
      onPanResponderRelease: (_e, g) => settle(g.dy, g.vy),
      onPanResponderTerminate: (_e, g) => settle(g.dy, g.vy),
    }),
  ).current;

  // Content drag (only when scrolled to the top and dragging down)
  const contentPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_e, g) => scrollTop.current <= 0 && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startDrag.current = translate.value;
      },
      onPanResponderMove: (_e, g) => {
        translate.value = Math.max(0, startDrag.current + g.dy);
      },
      onPanResponderRelease: (_e, g) => settle(g.dy, g.vy),
      onPanResponderTerminate: (_e, g) => settle(g.dy, g.vy),
    }),
  ).current;

  function settle(dy: number, vy: number) {
    // vy is px/ms → 0.9 = 900 px/s
    if (dy > sheetH.current * 0.3 || vy > 0.9) {
      requestClose();
    } else {
      translate.value = withSpring(0, motion.spring.gentle);
    }
  }

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translate.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  const maxH = winH * 0.9;
  const lift = Platform.OS === 'android' ? 0 : kb;

  const onSheetLayout = (e: LayoutChangeEvent) => {
    sheetH.current = e.nativeEvent.layout.height;
  };
  const checkOverflow = () => setOverflowing(contentH.current > viewportH.current + 4);

  if (!mounted) return null;

  const header = (
    <View {...pan.panHandlers} style={[styles.header, Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none', touchAction: 'none' } as any) : null]}>
      <View style={styles.grabberWrap}>
        <View style={styles.grabber} />
      </View>
      {title || showClose ? (
        <View style={styles.titleRow}>
          <View style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            {title ? (
              <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
                {title}
              </Text>
            ) : null}
            {subline ? (
              <Text style={styles.subline} numberOfLines={2}>
                {subline}
              </Text>
            ) : null}
          </View>
          {showClose ? <IconButton icon="close" variant="sunken" onPress={requestClose} accessibilityLabel="Fermer" /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <View style={styles.root} testID={testID}>
        <ModalFocusSink label={accessibilityLabel ?? title} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          />
        </Animated.View>
        <Animated.View
          onLayout={onSheetLayout}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          style={[
            styles.sheet,
            { maxHeight: maxH - lift, marginBottom: lift },
            snap === 'full' ? { height: maxH - lift } : null,
            sheetStyle,
          ]}
        >
          {header}
          {search ? (
            <View style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
              <TextField
                variant="sunken"
                leftIcon="search"
                value={search.value}
                onChangeText={search.onChangeText}
                placeholder={search.placeholder ?? 'Rechercher…'}
                autoFocus={search.autoFocus}
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel={search.placeholder ?? 'Rechercher'}
              />
            </View>
          ) : null}
          <View style={[snap === 'full' ? { flex: 1 } : { flexShrink: 1 }, { minHeight: 0 }]} {...contentPan.panHandlers}>
            {scrollable ? (
              <ScrollView
                style={[{ flexGrow: 0, flexShrink: 1 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
                contentContainerStyle={[{ paddingHorizontal: contentPadding, paddingTop: 4, paddingBottom: footer ? 12 : insets.bottom + 24 }, contentStyle]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  const y = e.nativeEvent.contentOffset.y;
                  scrollTop.current = y;
                  const end = y + viewportH.current >= contentH.current - 8;
                  if (end !== atEnd) setAtEnd(end);
                }}
                onLayout={(e) => {
                  viewportH.current = e.nativeEvent.layout.height;
                  checkOverflow();
                }}
                onContentSizeChange={(_w, h) => {
                  contentH.current = h;
                  checkOverflow();
                }}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[{ paddingHorizontal: contentPadding, paddingBottom: footer ? 12 : insets.bottom + 24 }, contentStyle]}>{children}</View>
            )}
            {overflowing && !atEnd ? (
              <LinearGradient {...gradients.fadeBottomSurface} style={[styles.fade, footer ? { height: 40 } : null]} pointerEvents="none" />
            ) : null}
          </View>
          {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: palette.scrim },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    ...elevation.e3,
  },
  header: { paddingHorizontal: layout.gutter, paddingBottom: 12 },
  grabberWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: palette.lineStrong },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { ...type.title3, color: palette.ink },
  subline: { ...type.footnote, color: palette.text2, marginTop: 2 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  footer: { paddingHorizontal: layout.gutter, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
});
