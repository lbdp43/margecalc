/**
 * PressableScale — the press feedback of every tappable thing.
 * Scales to .97 (button) / .98 (card) / .96 (chip) over 90 ms on press-in,
 * releases with the snappy spring. No opacity dimming.
 *
 *   <PressableScale onPress={…} scaleTo="card" haptic="select" accessibilityLabel="…">
 *     …
 *   </PressableScale>
 *
 * `progress` (optional SharedValue) is driven 0→1 while pressed, so a parent
 * can animate colours (e.g. the primary button darkening to em800).
 */
import React, { forwardRef, useCallback } from 'react';
import { GestureResponderEvent, Platform, Pressable, PressableProps, StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../../theme';
import { fire, HapticKind } from '../../theme/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ScalePreset = 'button' | 'card' | 'chip' | 'scan' | 'none';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Target scale, or a preset (button .97, card .98, chip .96, scan .94). */
  scaleTo?: number | ScalePreset;
  /** Haptic fired on press (default none). */
  haptic?: HapticKind | false;
  /** Driven 0→1 while pressed (90 ms in, 160 ms out). */
  progress?: SharedValue<number>;
}

function resolveScale(s: PressableScaleProps['scaleTo']): number {
  if (typeof s === 'number') return s;
  switch (s) {
    case 'card':
      return motion.pressScale.card;
    case 'chip':
      return motion.pressScale.chip;
    case 'scan':
      return motion.pressScale.scan;
    case 'none':
      return 1;
    default:
      return motion.pressScale.button;
  }
}

export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { children, style, scaleTo = 'button', haptic = false, progress, onPressIn, onPressOut, onPress, disabled, ...rest },
  ref,
) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(1);
  const target = resolveScale(scaleTo);

  const handleIn = useCallback(
    (e: GestureResponderEvent) => {
      if (!reduce && target !== 1) {
        scale.value = withTiming(target, { duration: motion.duration.instant, easing: motion.easing.standard });
      }
      if (progress) progress.value = withTiming(1, { duration: motion.duration.instant });
      onPressIn?.(e);
    },
    [reduce, target, progress, onPressIn, scale],
  );

  const handleOut = useCallback(
    (e: GestureResponderEvent) => {
      if (!reduce && target !== 1) scale.value = withSpring(1, motion.spring.snappy);
      else scale.value = 1;
      if (progress) progress.value = withTiming(0, { duration: motion.duration.fast });
      onPressOut?.(e);
    },
    [reduce, target, progress, onPressOut, scale],
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      fire(haptic);
      onPress?.(e);
    },
    [haptic, onPress],
  );

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      ref={ref as any}
      accessibilityRole="button"
      {...rest}
      disabled={disabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onPress={onPress ? handlePress : undefined}
      style={[
        Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer', userSelect: 'none' } as any) : null,
        style,
        animatedStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
});
