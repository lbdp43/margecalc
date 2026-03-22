import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, spacing, typography } from '../../theme';

interface YinYangSpinnerProps {
  size?: number;
  message?: string;
  submessage?: string;
}

export function YinYangSpinner({
  size = 100,
  message,
  submessage,
}: YinYangSpinnerProps) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const r = size / 2;
  const smallR = size / 8;

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Left half (dark) */}
          <Path
            d={`M${r},0 A${r},${r} 0 0 1 ${r},${size} A${r / 2},${r / 2} 0 0 1 ${r},${r} A${r / 2},${r / 2} 0 0 0 ${r},0 Z`}
            fill={colors.primary}
          />
          {/* Right half (light) */}
          <Path
            d={`M${r},0 A${r},${r} 0 0 0 ${r},${size} A${r / 2},${r / 2} 0 0 0 ${r},${r} A${r / 2},${r / 2} 0 0 1 ${r},0 Z`}
            fill="#8B5CF6"
          />
          {/* Small circle in dark half (light dot) */}
          <Circle cx={r} cy={r / 2} r={smallR} fill="#8B5CF6" />
          {/* Small circle in light half (dark dot) */}
          <Circle cx={r} cy={r + r / 2} r={smallR} fill={colors.primary} />
        </Svg>
      </Animated.View>

      {message && <Text style={styles.message}>{message}</Text>}
      {submessage && <Text style={styles.submessage}>{submessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  message: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  submessage: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
