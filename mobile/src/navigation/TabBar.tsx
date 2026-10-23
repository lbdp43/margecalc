/**
 * Floating pill TabBar (spec §3.11 + grafts 10): Réglages · Produits ·
 * (Scanner, geometrically centred, raised and labelled) · Tableau de bord
 * (wider right slot). Sliding em50 indicator (snappy spring, stretches mid
 * flight), outline→filled icon pop, fadeBottom gradient behind, safe-area aware.
 * The Scanner opens the staggered spring menu (spec §5.7) for every user:
 * « Scanner un produit » (bottle photo → product form) and « Scanner une
 * facture » (invoice import), so the invoice import stays reachable once the
 * dashboard is no longer empty. While open, the menu counts as an overlay
 * (chrome sheetCount): toasts and the update dialog wait for it to close.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  Extrapolation,
} from 'react-native-reanimated';
import { elevation, gradients, layout, motion, palette, type } from '../theme';
import { haptics } from '../theme/haptics';
import { useChromeStore, useKeyboardHeight } from '../components/ui/chrome';
import { PressableScale } from '../components/ui/PressableScale';
import type { IconName } from '../components/ui/Icon';
import { ROUTES, TAB_BAR_HIDDEN_ROUTES } from './routes';

const SCAN = 58;
const SCAN_SLOT = 66;
const ITEM_W = 68;
const WIDE_W = 112;
const PILL_W = 56;
const PILL_H = 30;
const RAISE = layout.tabBarRaise; // the scan circle rises above the bar

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName; wide?: boolean }> = {
  [ROUTES.settingsTab]: { label: 'Réglages', icon: 'settings-outline', iconActive: 'settings' },
  [ROUTES.productsTab]: { label: 'Produits', icon: 'grid-outline', iconActive: 'grid' },
  [ROUTES.dashboardTab]: { label: 'Tableau de bord', icon: 'stats-chart-outline', iconActive: 'stats-chart', wide: true },
};
const LEFT = [ROUTES.settingsTab, ROUTES.productsTab];

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const rootFocused = useIsFocused();
  const kb = useKeyboardHeight();
  const setTabBarVisible = useChromeStore((s) => s.setTabBarVisible);
  const [rowW, setRowW] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const focusedRoute = state.routes[state.index];
  const focusedOptions = descriptors[focusedRoute.key]?.options;
  const nestedName = getFocusedRouteNameFromRoute(focusedRoute);
  const hiddenByRoute =
    (focusedOptions?.tabBarStyle as any)?.display === 'none' || (nestedName ? TAB_BAR_HIDDEN_ROUTES.has(nestedName) : false);
  const hidden = hiddenByRoute || kb > 0;

  useEffect(() => {
    setTabBarVisible(rootFocused && !hidden);
  }, [rootFocused, hidden, setTabBarVisible]);
  useEffect(() => () => setTabBarVisible(false), [setTabBarVisible]);

  const barBottom = layout.tabBarBottom(insets.bottom);

  // ── geometry (computed, no per-item measuring) ──
  // Narrow phones (< 340 px row, e.g. 320 px screens): narrower scan slot,
  // items shrink to fit their half, 11 px labels.
  const geo = useMemo(() => {
    const compact = rowW > 0 && rowW < 340;
    const scanSlot = compact ? 60 : SCAN_SLOT;
    const half = rowW ? (rowW - 8 - scanSlot) / 2 : 0;
    const itemW = rowW ? Math.min(ITEM_W, Math.floor(half / 2)) : ITEM_W;
    const wideW = rowW ? Math.min(WIDE_W, Math.floor(half)) : WIDE_W;
    const pillW = Math.min(PILL_W, itemW - (compact ? 8 : 4));
    const free = half - itemW * 2;
    const centers = {
      [ROUTES.settingsTab]: 4 + free / 4 + itemW / 2,
      [ROUTES.productsTab]: 4 + (free * 3) / 4 + itemW * 1.5,
      [ROUTES.dashboardTab]: 4 + half + scanSlot + half / 2,
    } as Record<string, number>;
    return { compact, scanSlot, itemW, wideW, pillW, centers };
  }, [rowW]);
  const centers = geo.centers;
  const pillBase = useSharedValue(PILL_W);
  useEffect(() => {
    pillBase.value = geo.pillW;
  }, [geo.pillW, pillBase]);

  const activeName = focusedRoute.name;
  const x = useSharedValue(0);
  const from = useSharedValue(0);
  const to = useSharedValue(0);
  const t = useSharedValue(1);
  const ready = useRef(false);

  useEffect(() => {
    if (!rowW) return;
    const target = centers[activeName] ?? 0;
    if (!ready.current || reduce) {
      ready.current = true;
      from.value = target;
      to.value = target;
      t.value = 1;
      return;
    }
    from.value = interpolate(t.value, [0, 1], [from.value, to.value]);
    to.value = target;
    t.value = 0;
    t.value = withSpring(1, motion.spring.snappy);
  }, [activeName, rowW, centers, reduce, from, to, t]);

  const pill = useAnimatedStyle(() => {
    const cx = from.value + (to.value - from.value) * t.value;
    const stretch = 8 * 4 * Math.max(0, Math.min(1, t.value)) * (1 - Math.max(0, Math.min(1, t.value)));
    const w = pillBase.value + stretch;
    return { width: w, transform: [{ translateX: cx - w / 2 }] };
  });

  // ── hide / show ──
  const shown = useSharedValue(hidden ? 0 : 1);
  useEffect(() => {
    shown.value = withTiming(hidden ? 0 : 1, { duration: motion.duration.fast });
  }, [hidden, shown]);
  const barShown = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 24 }],
  }));

  const onTabPress = (routeName: string, routeKey: string, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused) haptics.select();
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  // ── Scanner ──
  const openScan = (screen: string) => {
    setMenuOpen(false);
    (navigation as any).navigate(screen, {});
  };
  const onScanPress = () => {
    haptics.tap();
    setMenuOpen((o) => !o);
  };
  // The menu never outlives the bar (a form opened, keyboard up, screen left).
  useEffect(() => {
    if (hidden || !rootFocused) setMenuOpen(false);
  }, [hidden, rootFocused]);
  // The open menu is an overlay like a sheet: toasts and the update dialog wait
  // until it closes (no stacked overlays).
  useEffect(() => {
    if (!menuOpen) return undefined;
    const chrome = useChromeStore.getState();
    chrome.sheetOpened();
    return () => chrome.sheetClosed();
  }, [menuOpen]);

  const renderTab = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    const conf = TABS[name];
    if (!route || !conf) return null;
    const focused = route.key === focusedRoute.key;
    const options = descriptors[route.key]?.options;
    return (
      <TabItem
        key={route.key}
        label={conf.label}
        icon={conf.icon}
        iconActive={conf.iconActive}
        width={conf.wide ? geo.wideW : geo.itemW}
        pillW={geo.pillW}
        compact={geo.compact}
        focused={focused}
        onPress={() => onTabPress(route.name, route.key, focused)}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        accessibilityLabel={options?.tabBarAccessibilityLabel ?? conf.label}
      />
    );
  };

  const leftTabs = LEFT.map(renderTab);
  const rightTab = renderTab(ROUTES.dashboardTab);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={[styles.fade, { height: layout.fadeBottomHeight(insets.bottom) }, barShown]}>
        <LinearGradient {...gradients.fadeBottom} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View
        pointerEvents={hidden ? 'none' : 'box-none'}
        style={[styles.bar, { bottom: barBottom }, barShown]}
        accessibilityRole="tablist"
      >
        <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setRowW(e.nativeEvent.layout.width)}>
          {rowW ? <Animated.View pointerEvents="none" style={[styles.pill, pill]} /> : null}
          <View style={styles.half}>{leftTabs}</View>
          <View style={[styles.scanSlot, { width: geo.scanSlot }]}>
            <Text style={[styles.label, geo.compact && styles.labelCompact, { color: menuOpen ? palette.em700 : palette.text3 }]} numberOfLines={1}>
              Scanner
            </Text>
          </View>
          <View style={[styles.half, { justifyContent: 'center' }]}>{rightTab}</View>
        </View>
      </Animated.View>

      <ScannerMenu
        open={menuOpen}
        bottom={barBottom + layout.tabBarHeight + RAISE + 14}
        onClose={() => setMenuOpen(false)}
        onProduct={() => openScan(ROUTES.productForm)}
        onInvoice={() => openScan(ROUTES.invoiceScan)}
      />

      <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.scanWrap, { bottom: barBottom + layout.tabBarHeight - SCAN + RAISE - 4 }, barShown]}>
        <ScanButton open={menuOpen} onPress={onScanPress} />
      </Animated.View>
    </View>
  );
}

// ─── Tab item ──────────────────────────────────────────────────────────────
function TabItem({
  label,
  icon,
  iconActive,
  width,
  pillW,
  compact,
  focused,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  label: string;
  icon: IconName;
  iconActive: IconName;
  width: number;
  pillW: number;
  compact: boolean;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel: string;
}) {
  const reduce = useReducedMotion();
  const c = useSharedValue(focused ? 1 : 0);
  const pop = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    c.value = withTiming(focused ? 1 : 0, { duration: motion.duration.fast });
    if (focused && !first.current && !reduce) {
      pop.value = withSequence(withTiming(0.9, { duration: 60 }), withSpring(1, motion.spring.pop));
    }
    first.current = false;
  }, [focused, reduce, c, pop]);

  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(c.value, [0, 1], [palette.text3, palette.em700]) }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      accessibilityLabel={accessibilityLabel}
      style={[styles.item, { width }, Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : null]}
    >
      <Animated.View style={[styles.iconBox, { width: pillW }, iconStyle]}>
        <Ionicons name={focused ? iconActive : icon} size={23} color={focused ? palette.em700 : palette.text3} />
      </Animated.View>
      <Animated.Text style={[styles.label, compact && styles.labelCompact, labelStyle]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

// ─── Scan button ───────────────────────────────────────────────────────────
function ScanButton({ open, onPress }: { open: boolean; onPress: () => void }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    p.value = open
      ? reduce
        ? withTiming(1, { duration: 120 })
        : withSpring(1, motion.spring.snappy)
      : withTiming(0, { duration: motion.duration.fast, easing: motion.easing.accel });
  }, [open, reduce, p]);
  const rotate = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 90}deg` }] }));
  const scanIcon = useAnimatedStyle(() => ({ opacity: 1 - p.value }));
  const closeIcon = useAnimatedStyle(() => ({ opacity: p.value }));

  return (
    <PressableScale
      onPress={onPress}
      scaleTo="scan"
      accessibilityRole="button"
      accessibilityLabel={open ? 'Fermer le menu Scanner' : 'Scanner'}
      accessibilityState={{ expanded: open }}
      aria-expanded={open}
      aria-haspopup="menu"
      style={styles.scanOuter}
    >
      <View style={[styles.scan, elevation.glow]}>
        <LinearGradient {...gradients.scanButton} style={[StyleSheet.absoluteFill, { borderRadius: SCAN / 2 }]} />
        <Animated.View style={[styles.scanIcons, rotate]}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, scanIcon]}>
            <Ionicons name="scan" size={27} color="#FFFFFF" />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, closeIcon]}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
        <View style={styles.spark} />
      </View>
    </PressableScale>
  );
}

// ─── Scanner menu (spec §5.7) ──────────────────────────────────────────────
function ScannerMenu({
  open,
  bottom,
  onClose,
  onProduct,
  onInvoice,
}: {
  open: boolean;
  bottom: number;
  onClose: () => void;
  onProduct: () => void;
  onInvoice: () => void;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const scrim = useSharedValue(0);
  const a = useSharedValue(0); // nearest card (product)
  const b = useSharedValue(0); // invoice

  useEffect(() => {
    if (open) {
      setMounted(true);
      scrim.value = withTiming(1, { duration: 200 });
      if (reduce) {
        a.value = withTiming(1, { duration: 120 });
        b.value = withTiming(1, { duration: 120 });
      } else {
        a.value = withSpring(1, motion.spring.gentle);
        b.value = withDelay(50, withSpring(1, motion.spring.gentle));
      }
    } else if (mounted) {
      const out = { duration: motion.duration.fast, easing: motion.easing.accel };
      b.value = withTiming(0, out);
      a.value = withDelay(30, withTiming(0, out));
      scrim.value = withTiming(0, out);
      const tm = setTimeout(() => setMounted(false), motion.duration.fast + 60);
      return () => clearTimeout(tm);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const cardA = useAnimatedStyle(() => ({
    opacity: interpolate(a.value, [0, 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: (1 - a.value) * 24 }, { scale: 0.96 + 0.04 * a.value }],
  }));
  const cardB = useAnimatedStyle(() => ({
    opacity: interpolate(b.value, [0, 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: (1 - b.value) * 24 }, { scale: 0.96 + 0.04 * b.value }],
  }));

  if (!mounted) return null;

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer le menu Scanner" />
      </Animated.View>
      <View pointerEvents={open ? 'box-none' : 'none'} style={[styles.menu, { bottom }]}>
        <Animated.View style={cardB}>
          <MenuCard icon="receipt-outline" title="Scanner une facture" subtitle="Importer plusieurs produits" onPress={onInvoice} />
        </Animated.View>
        <Animated.View style={cardA}>
          <MenuCard icon="wine-outline" title="Scanner un produit" subtitle="Photo d’une bouteille" onPress={onProduct} primary />
        </Animated.View>
      </View>
    </>
  );
}

function MenuCard({ icon, title, subtitle, onPress, primary }: { icon: IconName; title: string; subtitle: string; onPress: () => void; primary?: boolean }) {
  return (
    <PressableScale onPress={onPress} scaleTo="card" haptic="select" accessibilityLabel={`${title}, ${subtitle}`} style={styles.menuCard}>
      <View style={[styles.menuIcon, primary && { backgroundColor: palette.em700 }]}>
        <Ionicons name={icon} size={22} color={primary ? '#FFFFFF' : palette.em700} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.text4} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    position: 'absolute',
    left: layout.tabBarSide,
    right: layout.tabBarSide,
    height: layout.tabBarHeight,
    borderRadius: 26,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    maxWidth: 560,
    alignSelf: 'center',
    marginHorizontal: 'auto',
    ...elevation.e3,
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  half: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: '100%' },
  scanSlot: { height: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 9 },
  pill: {
    position: 'absolute',
    left: 0,
    top: (layout.tabBarHeight - 2 - 48) / 2,
    height: PILL_H,
    borderRadius: PILL_H / 2,
    backgroundColor: palette.em50,
  },
  // borderRadius: the keyboard focus ring (outline) follows the tab's rounded shape.
  item: { height: 60, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 16 },
  iconBox: { width: PILL_W, height: PILL_H, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.tabLabel },
  labelCompact: { fontSize: 11, lineHeight: 14, letterSpacing: -0.2 },
  scanWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  scanOuter: { width: SCAN + 8, height: SCAN + 8, borderRadius: (SCAN + 8) / 2, alignItems: 'center', justifyContent: 'center' },
  scan: { width: SCAN, height: SCAN, borderRadius: SCAN / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.em700 },
  scanIcons: { width: 30, height: 30 },
  center: { alignItems: 'center', justifyContent: 'center' },
  spark: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.lime,
    borderWidth: 2,
    borderColor: palette.em700,
  },
  menu: { position: 'absolute', left: 20, right: 20, alignItems: 'stretch', gap: 10, maxWidth: 420, alignSelf: 'center', marginHorizontal: 'auto' },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    ...elevation.e3,
  },
  menuIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
  menuTitle: { ...type.headline, color: palette.ink },
  menuSub: { ...type.footnote, color: palette.text3, marginTop: 1 },
});
