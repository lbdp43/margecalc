/**
 * EmptyState (spec §3.15 + graft 14).
 *
 *   <EmptyState
 *     title="Aucun produit pour l’instant"
 *     text="Scannez une bouteille ou une facture : vos marges apparaîtront ici."
 *     primary={{ label: 'Scanner une bouteille', icon: 'scan', onPress: scan }}
 *     secondary={[{ label: 'Facture', icon: 'receipt-outline', onPress: invoice },
 *                 { label: 'À la main', icon: 'create-outline', onPress: manual }]}
 *     marquee />
 *   <EmptyState variant="noResults" query={q} primary={{ label: 'Effacer la recherche', onPress: clear }} />
 *   <EmptyState variant="offline" />
 */
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { palette, type } from '../../theme';
import { BrandMark } from './Brand';
import { Button } from './Button';
import { SkeletonProductCard } from './Skeleton';
import { FadeIn } from './motion';
import { IconName } from './Icon';

export interface EmptyAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
}

export interface EmptyStateProps {
  variant?: 'default' | 'noResults' | 'offline';
  title?: string;
  text?: string;
  /** noResults: the search query (« Aucun résultat pour “…” »). */
  query?: string;
  icon?: IconName;
  primary?: EmptyAction;
  /** One tonal action, or several side by side (graft 14). */
  secondary?: EmptyAction | EmptyAction[];
  /** Faint skeleton rows scrolling upward behind (paused under reduce motion). */
  marquee?: boolean;
  /** Colour behind the empty state (for the marquee fades). Default bg. */
  surface?: 'bg' | 'surface';
  style?: StyleProp<ViewStyle>;
}

const ROW_H = 100; // card 90 + gap 10

function Marquee({ surface }: { surface: string }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    // 24 px/s upward, seamless loop over one row height
    y.value = withRepeat(withTiming(-ROW_H, { duration: (ROW_H / 24) * 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(y);
  }, [reduce, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={styles.marquee} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[{ gap: 10, opacity: 0.4 }, style]}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonProductCard key={i} still />
        ))}
      </Animated.View>
      <LinearGradient
        colors={[surface, withAlpha(surface, 0), withAlpha(surface, 0.7), surface]}
        locations={[0, 0.16, 0.36, 0.56]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function withAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function EmptyState({ variant = 'default', title, text, query, icon, primary, secondary, marquee, surface = 'bg', style }: EmptyStateProps) {
  const [h, setH] = useState(0);
  const resolvedTitle =
    title ??
    (variant === 'noResults'
      ? `Aucun résultat pour « ${query ?? ''} »`
      : variant === 'offline'
        ? 'Hors ligne'
        : 'Aucun produit pour l’instant');
  const resolvedText =
    text ??
    (variant === 'noResults'
      ? 'Essayez un autre mot ou vérifiez l’orthographe.'
      : variant === 'offline'
        ? 'Vos données s’afficheront dès le retour du réseau.'
        : 'Scannez une bouteille ou une facture : vos marges apparaîtront ici.');
  const resolvedIcon: IconName | undefined = icon ?? (variant === 'noResults' ? 'search' : variant === 'offline' ? 'cloud-offline-outline' : undefined);
  const secondaries = secondary ? (Array.isArray(secondary) ? secondary : [secondary]) : [];

  return (
    <View
      style={[styles.wrap, marquee ? styles.wrapMarquee : null, style]}
      onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}
    >
      {marquee && h > 0 ? <Marquee surface={surface === 'surface' ? palette.surface : palette.bg} /> : null}
      <FadeIn style={styles.inner}>
        <View style={styles.circle}>
          {resolvedIcon ? <Ionicons name={resolvedIcon} size={30} color={palette.em700} /> : <BrandMark variant="tonal" size={44} />}
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {resolvedTitle}
        </Text>
        <Text style={styles.text}>{resolvedText}</Text>
        {primary || secondaries.length ? (
          <View style={styles.actions}>
            {primary ? <Button title={primary.label} icon={primary.icon} onPress={primary.onPress} fullWidth /> : null}
            {secondaries.length ? (
              <View style={styles.secondaryRow}>
                {secondaries.map((s) => (
                  <Button key={s.label} title={s.label} icon={s.icon} onPress={s.onPress} variant="tonal" size={secondaries.length > 1 ? 'sm' : 'md'} style={{ flex: 1 }} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 32, alignItems: 'center', justifyContent: 'center' },
  // The marquee must be clipped; leave room so the button glow is not cut.
  wrapMarquee: { overflow: 'hidden', paddingBottom: 44 },
  marquee: { ...StyleSheet.absoluteFillObject, paddingTop: 8, overflow: 'hidden' },
  inner: { alignItems: 'center', maxWidth: 340, width: '100%', paddingHorizontal: 8 },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { ...type.title3, color: palette.ink, textAlign: 'center' },
  text: { ...type.callout, color: palette.text2, textAlign: 'center', marginTop: 6, maxWidth: 300 },
  actions: { alignSelf: 'stretch', marginTop: 24, gap: 10 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
});
