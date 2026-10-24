/**
 * Screen — the shell of every screen (replaces ScreenWrapper).
 *
 *   // Tab root with a large title (compact bar cross-fades in after 40 px)
 *   <Screen>
 *     <LargeTitleHeader title="Mes produits" subline="24 produits" trailing={<FAB … />} />
 *     …
 *   </Screen>
 *
 *   // Pushed form: fixed NavBar + sticky « Enregistrer »
 *   <Screen header={<NavBar title="Nouveau produit" />}
 *           stickyFooter={<StickyActionBar primary={{ title: 'Enregistrer', onPress: save }} />}>
 *     …
 *   </Screen>
 *
 *   // Long list: let FlatList own the scroll
 *   <Screen scroll={false}>
 *     <ScreenList data={products} renderItem={…} ListHeaderComponent={<LargeTitleHeader … />} />
 *   </Screen>
 *
 *   // Hero (gradient under the status bar)
 *   <Screen safeTop={false} padded={false}><HeroHeader>…</HeroHeader>…</Screen>
 *
 * Bottom inset (`bottomInset="auto"`): sticky footer height + 16, else
 * 68 + barBottom + 24 when the floating tab bar is visible (any screen inside
 * the tab navigator), else safe-area bottom + 24. Content never hides under
 * the bars. Scrolling works on web (bounded flex chain, RN ScrollView).
 *
 * With a sticky footer (polish n° 6): the inset is the footer's MEASURED
 * height + 16, plus the keyboard while it is open on web and on iOS without
 * the KeyboardAvoidingView (the bar rides above it; Android resizes the
 * window and iOS's KeyboardAvoidingView shrinks the scroll area). On web the
 * same amount is the scroll container's `scroll-padding-bottom`, so a field
 * the browser brings into view (focus, Tab, scrollIntoView) stops above the
 * bar, and the focused field is brought back above the bar when the keyboard opens.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  FlatListProps,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  RefreshControl,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import Animated, { interpolate, SharedValue, useAnimatedStyle, useSharedValue, Extrapolation } from 'react-native-reanimated';
import { layout, palette, type } from '../../theme';
import { useKeyboardHeight, useSafeIsFocused } from './chrome';

interface ScreenContextValue {
  scrollY: SharedValue<number>;
  bottomInset: number;
  gutter: number;
  insideTabs: boolean;
  handleScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  setCompactTitle: (title: string | null) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Internal: a ScreenList registers its scroll node (web `scroll-padding-bottom`). */
  setScrollNode?: (node: any) => void;
}

/** Web: the DOM node behind a ScrollView / FlatList ref. */
function domNodeOf(ref: any): any {
  if (!ref) return null;
  const n = typeof ref.getScrollableNode === 'function' ? ref.getScrollableNode() : ref;
  return n && n.style ? n : null;
}

/** Web: what the browser keeps clear at the bottom when it brings an element into view. */
function applyScrollPadding(ref: any, bottom: number | null) {
  if (Platform.OS !== 'web') return;
  const node = domNodeOf(ref);
  if (node) node.style.scrollPaddingBottom = bottom !== null ? `${Math.round(bottom)}px` : '';
}

/** Web: bring the focused element of this scroll node back into view (above the sticky bar: scroll-padding). */
function revealFocused(ref: any) {
  const node = domNodeOf(ref);
  const doc: any = (globalThis as any).document;
  const el = doc?.activeElement;
  if (!node || !el || el === doc.body || !node.contains(el) || typeof el.scrollIntoView !== 'function') return;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

const ScreenContext = createContext<ScreenContextValue | null>(null);

/** Access the current Screen (scrollY, bottomInset…). Null outside a Screen. */
export function useScreen(): ScreenContextValue | null {
  return useContext(ScreenContext);
}

/** True when rendered inside the bottom tab navigator (the floating bar is visible). */
export function useInsideTabs(): boolean {
  return useContext(BottomTabBarHeightContext) !== undefined;
}

export interface ScreenProps {
  children?: React.ReactNode;
  /** false: content is a static flex View (use ScreenList for long lists). */
  scroll?: boolean;
  /** Fixed header above the scroll area (NavBar). */
  header?: React.ReactNode;
  /** Bottom bar (StickyActionBar). Content gets its height + 16 as bottom inset. */
  stickyFooter?: React.ReactNode;
  /** Absolute layer above the content (rarely needed). */
  overlay?: React.ReactNode;
  /**
   * Horizontal gutter (20) on the content. Default: true when `scroll`,
   * false when `scroll={false}` (full-bleed container — ScreenList pads its own content).
   */
  padded?: boolean;
  /** Pad the top by the safe-area inset (status bar). Default true. */
  safeTop?: boolean;
  bottomInset?: 'auto' | number;
  background?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboardAvoiding?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Partial<ScrollViewProps>;
  scrollRef?: React.Ref<ScrollView>;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  statusBar?: 'dark' | 'light';
  testID?: string;
}

export function Screen({
  children,
  scroll = true,
  header,
  stickyFooter,
  overlay,
  padded,
  safeTop = true,
  bottomInset = 'auto',
  background = palette.bg,
  refreshing,
  onRefresh,
  keyboardAvoiding = true,
  style,
  contentContainerStyle,
  scrollViewProps,
  scrollRef,
  onScroll,
  statusBar,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const insideTabs = useInsideTabs();
  const focused = useSafeIsFocused();
  const scrollY = useSharedValue(0);
  const [footerH, setFooterH] = useState(0);
  const kb = useKeyboardHeight(!!stickyFooter);
  // The keyboard covers the bottom of the scroll area where nothing else makes room for it.
  const kbInset = stickyFooter && (Platform.OS === 'web' || (Platform.OS === 'ios' && !keyboardAvoiding)) ? kb : 0;
  const [compactTitle, setCompactTitle] = useState<string | null>(null);
  const userOnScroll = useRef(onScroll);
  userOnScroll.current = onScroll;

  const computedBottom =
    typeof bottomInset === 'number'
      ? bottomInset
      : stickyFooter
        ? footerH + 16 + kbInset
        : insideTabs
          ? layout.contentBottomInset(insets.bottom)
          : insets.bottom + 24;

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.value = e.nativeEvent.contentOffset.y;
      userOnScroll.current?.(e);
    },
    [scrollY],
  );

  const gutter = (padded ?? scroll) ? layout.gutter : 0;
  // Web: the scroll node of this Screen (its ScrollView, or a ScreenList inside) for `scroll-padding-bottom`.
  const scrollNode = useRef<any>(null);
  const scrollPadding = stickyFooter ? computedBottom : null;
  const scrollPaddingRef = useRef(scrollPadding);
  scrollPaddingRef.current = scrollPadding;
  const setScrollNode = useCallback((n: any) => {
    scrollNode.current = n;
    applyScrollPadding(n, scrollPaddingRef.current);
  }, []);
  useEffect(() => {
    applyScrollPadding(scrollNode.current, scrollPadding);
  }, [scrollPadding]);
  // The keyboard just opened (the bar rose with it): the focused field, scrolled into view before, may now sit under it.
  const lastKb = useRef(kbInset);
  useEffect(() => {
    const opened = kbInset > lastKb.current;
    lastKb.current = kbInset;
    if (!opened || Platform.OS !== 'web') return;
    const raf = requestAnimationFrame(() => revealFocused(scrollNode.current));
    return () => cancelAnimationFrame(raf);
  }, [kbInset]);

  const ctx = useMemo<ScreenContextValue>(
    () => ({ scrollY, bottomInset: computedBottom, gutter, insideTabs, handleScroll, setCompactTitle, refreshing, onRefresh, setScrollNode }),
    [scrollY, computedBottom, gutter, insideTabs, handleScroll, refreshing, onRefresh, setScrollNode],
  );
  const mergedScrollRef = useCallback(
    (n: ScrollView | null) => {
      setScrollNode(n);
      if (typeof scrollRef === 'function') scrollRef(n);
      else if (scrollRef) (scrollRef as React.MutableRefObject<ScrollView | null>).current = n;
    },
    [scrollRef, setScrollNode],
  );

  const refreshControl = onRefresh ? (
    <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.em700} colors={[palette.em700]} />
  ) : undefined;

  const body = scroll ? (
    <ScrollView
      ref={mergedScrollRef}
      style={styles.flex}
      contentContainerStyle={[{ paddingHorizontal: gutter, paddingBottom: computedBottom, flexGrow: 1 }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      // Never 'on-drag' on web: RNW dismisses the keyboard on EVERY scroll
      // event, including the browser scrolling a focused input into view.
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : Platform.OS === 'android' ? 'on-drag' : 'none'}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, { paddingHorizontal: gutter }, contentContainerStyle]}>{children}</View>
  );

  const content =
    keyboardAvoiding && Platform.OS === 'ios' ? (
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {body}
      </KeyboardAvoidingView>
    ) : (
      body
    );

  return (
    <ScreenContext.Provider value={ctx}>
      <View
        style={[styles.root, { backgroundColor: background, paddingTop: safeTop ? insets.top : 0 }, style]}
        testID={testID}
      >
        {statusBar && focused ? <StatusBar style={statusBar} /> : null}
        {header}
        {content}
        {compactTitle ? <CompactBar title={compactTitle} scrollY={scrollY} top={safeTop ? insets.top : 0} /> : null}
        {stickyFooter ? (
          <View style={styles.footer} onLayout={(e: LayoutChangeEvent) => setFooterH(e.nativeEvent.layout.height)} pointerEvents="box-none">
            {stickyFooter}
          </View>
        ) : null}
        {overlay}
      </View>
    </ScreenContext.Provider>
  );
}

function CompactBar({ title, scrollY, top }: { title: string; scrollY: SharedValue<number>; top: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [28, 52], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [28, 52], [-4, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.compact, { top: 0, paddingTop: top, height: layout.compactBarHeight + top }, style]}>
      <Text style={[type.title3, { color: palette.ink }]} numberOfLines={1}>
        {title}
      </Text>
    </Animated.View>
  );
}

/** Internal: lets LargeTitleHeader register the compact bar title. */
export function useRegisterCompactTitle(title: string | null) {
  const ctx = useContext(ScreenContext);
  React.useEffect(() => {
    if (!ctx) return;
    ctx.setCompactTitle(title);
    return () => ctx.setCompactTitle(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, ctx?.setCompactTitle]);
}

export type ScreenListProps<T> = FlatListProps<T> & { padded?: boolean };

/**
 * FlatList wired to the parent Screen: gutter, bottom inset (tab bar /
 * sticky footer), compact-title scroll tracking, pull-to-refresh.
 * Use inside <Screen scroll={false}>.
 */
export function ScreenList<T>({ padded, contentContainerStyle, onScroll, refreshControl, ...props }: ScreenListProps<T>) {
  const ctx = useContext(ScreenContext);
  const setScrollNode = ctx?.setScrollNode;
  const listRef = useCallback((n: any) => setScrollNode?.(n), [setScrollNode]);
  const insets = useSafeAreaInsets();
  const gutter = padded === false ? 0 : layout.gutter;
  const bottom = ctx?.bottomInset ?? insets.bottom + 24;
  const handle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    ctx?.handleScroll(e);
    onScroll?.(e);
  };
  return (
    <FlatList
      ref={listRef}
      style={styles.flex}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={handle}
      refreshControl={
        refreshControl ??
        (ctx?.onRefresh ? (
          <RefreshControl refreshing={!!ctx.refreshing} onRefresh={ctx.onRefresh} tintColor={palette.em700} colors={[palette.em700]} />
        ) : undefined)
      }
      contentContainerStyle={[{ paddingHorizontal: gutter, paddingBottom: bottom, flexGrow: 1 }, contentContainerStyle]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? ({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as ViewStyle) : null),
  },
  flex: { flex: 1, minHeight: 0 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  compact: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 64,
    backgroundColor: palette.bg,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
});
