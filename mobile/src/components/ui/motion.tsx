/**
 * Motion helpers (reanimated 3.6, web-safe).
 *
 *   <FadeIn>…</FadeIn>                       opacity 0→1 + translateY 12→0, 280 ms decel
 *   <FadeIn index={i}>…</FadeIn>             staggered 40 ms per item, capped at 8
 *   <FadeIn delay={120} offset={8}>…</FadeIn>
 *   <Stagger>{items}</Stagger>               wraps each child in a staggered FadeIn
 *   const reduce = useReduceMotion();        true when the OS asks for less motion
 *
 * Mount-only: re-renders and refetches never replay the entrance.
 * Under reduce motion every helper renders its final state at once.
 */
import React, { useEffect } from 'react';
import { StyleProp, ViewStyle, ViewProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../../theme';

export function useReduceMotion(): boolean {
  return useReducedMotion();
}

/** Delay for the `index`-th item of a staggered list (40 ms each, capped at 8). */
export function staggerDelay(index: number, base = 0, step: number = motion.stagger.step): number {
  return base + Math.min(Math.max(0, index), motion.stagger.max) * step;
}

/** Spring config, or a 160 ms standard timing under reduce motion. */
export function springOrTiming(
  toValue: number,
  spring: { stiffness: number; damping: number; mass: number },
  reduce: boolean,
) {
  'worklet';
  return reduce
    ? withTiming(toValue, { duration: motion.duration.fast, easing: motion.easing.standard })
    : withSpring(toValue, spring);
}

export interface FadeInProps extends ViewProps {
  children?: React.ReactNode;
  /** Extra delay in ms. */
  delay?: number;
  /** Position in a list → +40 ms each, capped at 8. */
  index?: number;
  /** Start offset on Y (default 12). */
  offset?: number;
  duration?: number;
  /** Render immediately without animating (e.g. cached data, back navigation). */
  skip?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function FadeIn({
  children,
  delay = 0,
  index,
  offset = 12,
  duration = motion.duration.enter,
  skip = false,
  style,
  ...rest
}: FadeInProps) {
  const reduce = useReducedMotion();
  const instant = skip || reduce;
  const progress = useSharedValue(instant ? 1 : 0);

  useEffect(() => {
    if (instant) {
      progress.value = 1;
      return;
    }
    const d = index !== undefined ? staggerDelay(index, delay) : delay;
    progress.value = withDelay(d, withTiming(1, { duration, easing: motion.easing.decel }));
    // mount-only on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offset }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]} {...rest}>
      {children}
    </Animated.View>
  );
}

export interface StaggerProps {
  children: React.ReactNode;
  /** Base delay before the first child. */
  delay?: number;
  /** Per-item step (default 40 ms). */
  step?: number;
  offset?: number;
  skip?: boolean;
  /** Style applied to every wrapper. */
  itemStyle?: StyleProp<ViewStyle>;
}

/** Wraps each child in a FadeIn with a 40 ms stagger (max 8 steps). */
export function Stagger({ children, delay = 0, step = motion.stagger.step, offset, skip, itemStyle }: StaggerProps) {
  let i = 0;
  return (
    <>
      {React.Children.map(children, (child) => {
        if (child === null || child === undefined || child === false) return child;
        const index = i++;
        return (
          <FadeIn delay={staggerDelay(index, delay, step)} offset={offset} skip={skip} style={itemStyle}>
            {child}
          </FadeIn>
        );
      })}
    </>
  );
}

/**
 * Crossfade between values: renders `children` keyed by `value`; when it
 * changes, the new content fades in from 6 px below (160 ms).
 * Used for the segmented « Prix / Marge / Coeff » value area.
 */
export function SwapFade({ value, children, style }: { value: string | number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <FadeIn key={String(value)} offset={6} duration={motion.duration.fast} style={style}>
      {children}
    </FadeIn>
  );
}
