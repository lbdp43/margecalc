/**
 * Skeletons — `surface2` blocks with a 1200 ms shimmer (static under reduce
 * motion). Layouts mirror ProductCard and StatTile so nothing shifts.
 *
 *   <Skeleton width={64} height={64} radius={16} />
 *   <SkeletonText lines={2} />
 *   <SkeletonProductCard />   <SkeletonStatTile />   <SkeletonList count={5} />
 *   const show = useDelayedLoading(isLoading && !data);  // true after 150 ms
 */
import React, { useEffect, useState } from 'react';
import { DimensionValue, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { elevation, gradients, motion, palette, radius } from '../../theme';

const SHIMMER_W = 120;

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Disable the shimmer (e.g. decorative marquee). */
  still?: boolean;
  color?: string;
}

export function Skeleton({ width = '100%', height = 14, radius: r = 6, style, still, color = palette.surface2 }: SkeletonProps) {
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const animate = !reduce && !still && w > 0;

  useEffect(() => {
    if (!animate) return;
    x.value = 0;
    x.value = withRepeat(withTiming(1, { duration: motion.duration.shimmer, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(x);
  }, [animate, x]);

  const shimmer = useAnimatedStyle(() => ({
    transform: [{ translateX: -SHIMMER_W + x.value * (w + SHIMMER_W * 2) }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[{ width, height, borderRadius: r, backgroundColor: color, overflow: 'hidden' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {animate ? (
        <Animated.View style={[StyleSheet.absoluteFill, { width: SHIMMER_W }, shimmer]} pointerEvents="none">
          <LinearGradient {...gradients.shimmer} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function SkeletonText({ lines = 2, lastWidth = '60%', lineHeight = 12, gap = 8, style }: {
  lines?: number;
  lastWidth?: DimensionValue;
  lineHeight?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={lineHeight} width={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </View>
  );
}

/** Mirrors ProductCard (height 90, thumb 64, 3 lines + badge). */
export function SkeletonProductCard({ style, still }: { style?: StyleProp<ViewStyle>; still?: boolean }) {
  return (
    <View style={[styles.card, style]}>
      <Skeleton width={64} height={64} radius={16} still={still} />
      <View style={{ flex: 1, gap: 9 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton height={14} width="55%" still={still} />
          <View style={{ flex: 1 }} />
          <Skeleton height={26} width={64} radius={13} still={still} />
        </View>
        <Skeleton height={10} width="45%" still={still} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Skeleton height={14} width={70} still={still} />
          <View style={{ flex: 1 }} />
          <Skeleton height={10} width={64} still={still} />
        </View>
      </View>
    </View>
  );
}

/** Mirrors StatTile (≈100 tall). */
export function SkeletonStatTile({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tile, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Skeleton height={12} width="45%" />
        <Skeleton height={32} width={32} radius={10} />
      </View>
      <Skeleton height={28} width="50%" radius={8} />
    </View>
  );
}

export function SkeletonList({ count = 5, gap = 10, style }: { count?: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonProductCard key={i} />
      ))}
    </View>
  );
}

/** True once `loading` has been true for `delay` ms (avoids skeleton flashes). */
export function useDelayedLoading(loading: boolean, delay = 150): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [loading, delay]);
  return show;
}

const styles = StyleSheet.create({
  card: {
    height: 90,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    ...elevation.e2,
  },
  tile: {
    minHeight: 100,
    padding: 14,
    paddingTop: 12,
    justifyContent: 'space-between',
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    ...elevation.e2,
  },
});
