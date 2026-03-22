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
  const pulse = useRef(new Animated.Value(1)).current;
  const fadeMessage = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Smooth rotation
    const spin = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );

    // Breathing pulse
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.12,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    // Fade in message
    const fade = Animated.timing(fadeMessage, {
      toValue: 1,
      duration: 600,
      delay: 300,
      useNativeDriver: true,
    });

    spin.start();
    breathe.start();
    fade.start();

    return () => {
      spin.stop();
      breathe.stop();
      fade.stop();
    };
  }, [rotation, pulse, fadeMessage]);

  const spinInterp = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const r = size / 2;
  const dotR = size / 8;

  // S-curve wave dimensions
  const waveW = size * 1.6;
  const waveH = size * 0.3;

  return (
    <View style={styles.container}>
      {/* Animated S-curve wave behind the yin-yang */}
      <Animated.View style={[styles.waveWrap, { opacity: pulse }]}>
        <Svg width={waveW} height={waveH} viewBox={`0 0 ${waveW} ${waveH}`}>
          <Path
            d={`M0,${waveH} C${waveW * 0.35},${waveH} ${waveW * 0.65},0 ${waveW},0`}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2}
            opacity={0.25}
          />
          <Path
            d={`M0,${waveH * 0.7} C${waveW * 0.3},${waveH * 0.7} ${waveW * 0.7},${waveH * 0.15} ${waveW},${waveH * 0.15}`}
            fill="none"
            stroke={colors.accent}
            strokeWidth={1.5}
            opacity={0.2}
          />
        </Svg>
      </Animated.View>

      {/* Yin-Yang symbol */}
      <Animated.View
        style={{
          transform: [{ rotate: spinInterp }, { scale: pulse }],
        }}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Left half (primary) */}
          <Path
            d={`M${r},0 A${r},${r} 0 0 1 ${r},${size} A${r / 2},${r / 2} 0 0 1 ${r},${r} A${r / 2},${r / 2} 0 0 0 ${r},0 Z`}
            fill={colors.primary}
          />
          {/* Right half (accent green) */}
          <Path
            d={`M${r},0 A${r},${r} 0 0 0 ${r},${size} A${r / 2},${r / 2} 0 0 0 ${r},${r} A${r / 2},${r / 2} 0 0 1 ${r},0 Z`}
            fill={colors.accent}
          />
          {/* Dots */}
          <Circle cx={r} cy={r / 2} r={dotR} fill={colors.accent} />
          <Circle cx={r} cy={r + r / 2} r={dotR} fill={colors.primary} />
        </Svg>
      </Animated.View>

      {/* Text with fade-in */}
      <Animated.View style={{ opacity: fadeMessage }}>
        {message && <Text style={styles.message}>{message}</Text>}
        {submessage && <Text style={styles.submessage}>{submessage}</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  waveWrap: {
    position: 'absolute',
    top: spacing.sm,
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
