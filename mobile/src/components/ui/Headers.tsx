/**
 * Headers (spec §3.10).
 *
 * LargeTitleHeader — tab roots / list roots. Put it as the FIRST child of a
 * <Screen> (or as ListHeaderComponent of a ScreenList): it scrolls with the
 * content and registers a compact 56 px bar that cross-fades in after 40 px.
 *   <LargeTitleHeader title="Mes produits"
 *     subline={<>24 produits · marge moy. <Text style={{ color: palette.good }}>72,5 %</Text></>}
 *     trailing={<FAB accessibilityLabel="Ajouter un produit" onPress={…} />} />
 *
 * NavBar — pushed screens. Pass it to <Screen header={…}> (fixed).
 *   <NavBar title="Nouveau produit" trailing={<Badge variant="brand" label="Tarifs 2026" />} />
 *   (back defaults to navigation.goBack(), or goHome() when there is nothing
 *   underneath; pass onBack to override, back={false} to hide)
 *
 * HeroHeader — landing & dashboard. heroBase + heroGlint gradients, concentric
 * ring watermark, bottom radius 28, white status bar. Use with
 * <Screen safeTop={false} padded={false}>. Following tiles can overlap the
 * hero by 28 px with `marginTop: -28`.
 *   <HeroHeader>{children on emerald}</HeroHeader>
 */
import React, { useContext } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContext } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import Animated, { interpolate, useAnimatedStyle, Extrapolation } from 'react-native-reanimated';
import { gradients, layout, palette, radius, type } from '../../theme';
import { IconButton } from './Button';
import { useRegisterCompactTitle, useScreen } from './Screen';
import { useSafeIsFocused } from './chrome';
import { goHome } from '../../navigation/routes';

// ─── LargeTitleHeader ──────────────────────────────────────────────────────
export interface LargeTitleHeaderProps {
  title: string;
  subline?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Register the compact bar (default true). */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function LargeTitleHeader({ title, subline, trailing, compact = true, style }: LargeTitleHeaderProps) {
  useRegisterCompactTitle(compact ? title : null);
  const screen = useScreen();
  const fade = useAnimatedStyle(() => {
    const y = screen ? screen.scrollY.value : 0;
    return { opacity: interpolate(y, [0, 44], [1, 0.2], Extrapolation.CLAMP) };
  });
  return (
    <Animated.View style={[styles.large, fade, style]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.largeTitle} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
        {subline ? (
          typeof subline === 'string' ? (
            <Text style={styles.subline} numberOfLines={2}>
              {subline}
            </Text>
          ) : (
            <Text style={styles.subline} numberOfLines={2}>
              {subline}
            </Text>
          )
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Animated.View>
  );
}

// ─── NavBar ────────────────────────────────────────────────────────────────
export interface NavBarProps {
  title?: string;
  onBack?: () => void;
  back?: boolean;
  trailing?: React.ReactNode;
  /** Close (×) instead of a back chevron — for modal-like flows. */
  close?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Hairline under the bar once content scrolls (default true). */
  hairline?: boolean;
}

export function NavBar({ title, onBack, back = true, trailing, close, style, hairline = true }: NavBarProps) {
  const navigation = useContext(NavigationContext);
  const screen = useScreen();
  const handleBack = () => {
    if (onBack) return onBack();
    if (!navigation) return;
    // A URL opened directly may have nothing underneath: go home instead of
    // doing nothing (dashboard when logged in, landing when logged out).
    if (navigation.canGoBack()) navigation.goBack();
    else goHome(navigation as any);
  };
  const line = useAnimatedStyle(() => {
    const y = screen && hairline ? screen.scrollY.value : 0;
    return { opacity: interpolate(y, [0, 12], [0, 1], Extrapolation.CLAMP) };
  });
  return (
    <View style={[styles.nav, style]}>
      {back ? (
        <IconButton
          icon={close ? 'close' : 'chevron-back'}
          variant="plain"
          iconSize={close ? 24 : 26}
          onPress={handleBack}
          accessibilityLabel={close ? 'Fermer' : 'Retour'}
        />
      ) : (
        <View style={{ width: 8 }} />
      )}
      {title ? (
        <Text style={styles.navTitle} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
      ) : (
        <View style={styles.navSpacer} />
      )}
      {trailing ? <View style={styles.navTrailing}>{trailing}</View> : null}
      <Animated.View pointerEvents="none" style={[styles.navLine, line]} />
    </View>
  );
}

// ─── HeroHeader ────────────────────────────────────────────────────────────
export interface HeroHeaderProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra bottom padding (e.g. 28 + 24 when tiles overlap the hero). */
  paddingBottom?: number;
  rings?: boolean;
  /** Add the safe-area top inset inside the gradient (default true). */
  safeTop?: boolean;
}

export function HeroHeader({ children, style, contentStyle, paddingBottom = 24, rings = true, safeTop = true }: HeroHeaderProps) {
  const insets = useSafeAreaInsets();
  const focused = useSafeIsFocused();
  return (
    <View style={[styles.hero, style]}>
      {focused ? <StatusBar style="light" /> : null}
      <LinearGradient {...gradients.heroBase} style={StyleSheet.absoluteFill} />
      <LinearGradient {...gradients.heroGlint} style={StyleSheet.absoluteFill} />
      {rings ? <HeroRings /> : null}
      <View style={[{ paddingTop: (safeTop ? insets.top : 0) + 16, paddingBottom, paddingHorizontal: layout.gutter }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

/** Concentric ring watermark (echoes the double ring of the logo), off-canvas top right. */
export function HeroRings({ size = 420, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const c = size / 2;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', right: -size * 0.36, top: -size * 0.3, width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={c * 0.52} stroke="rgba(255,255,255,0.07)" strokeWidth={1.5} fill="none" />
        <Circle cx={c} cy={c} r={c * 0.72} stroke="rgba(197,240,74,0.10)" strokeWidth={1.5} fill="none" />
        <Circle cx={c} cy={c} r={c * 0.94} stroke="rgba(255,255,255,0.06)" strokeWidth={1} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  large: {
    minHeight: layout.largeTitleHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 16,
  },
  largeTitle: { ...type.title1, color: palette.ink },
  subline: { ...type.footnote, color: palette.text3, marginTop: 2 },
  trailing: { alignItems: 'flex-end', justifyContent: 'center' },
  nav: {
    height: layout.navBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: layout.gutter,
    gap: 6,
    backgroundColor: palette.bg,
    zIndex: 2,
  },
  navTitle: { ...type.title3, color: palette.ink, flex: 1, minWidth: 0 },
  navSpacer: { flex: 1 },
  navTrailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: palette.line },
  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    backgroundColor: palette.em800,
  },
});
