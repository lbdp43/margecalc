/**
 * Tab content cross-fade (spec §5.5): when a tab gains focus its content
 * fades in over 180 ms with translateY 8 → 0. No horizontal slide — tabs are
 * places, not steps. Skipped under reduce motion.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '../theme';

export function withTabTransition<P extends object>(Component: React.ComponentType<P>) {
  function TabScene(props: P) {
    const focused = useIsFocused();
    const reduce = useReducedMotion();
    const p = useSharedValue(1);

    useEffect(() => {
      if (!focused || reduce) return;
      p.value = 0;
      p.value = withTiming(1, { duration: 180, easing: motion.easing.decel });
    }, [focused, reduce, p]);

    const style = useAnimatedStyle(() =>
      p.value >= 1 ? { opacity: 1, transform: [] } : { opacity: p.value, transform: [{ translateY: (1 - p.value) * 8 }] },
    );

    return (
      <Animated.View style={[styles.fill, style]}>
        <Component {...props} />
      </Animated.View>
    );
  }
  TabScene.displayName = `TabScene(${Component.displayName || Component.name || 'Screen'})`;
  return TabScene;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
