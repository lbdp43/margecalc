import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../../theme';

interface DecorativeCurveProps {
  variant?: 'top' | 'middle' | 'bottom';
  color?: string;
}

export function DecorativeCurve({ variant = 'bottom', color }: DecorativeCurveProps) {
  const baseColor = color || colors.primary;

  if (variant === 'top') {
    return (
      <View style={styles.container} pointerEvents="none">
        <View style={[styles.topCurve1, { backgroundColor: baseColor }]} />
        <View style={[styles.topCurve2, { backgroundColor: baseColor }]} />
      </View>
    );
  }

  if (variant === 'middle') {
    return (
      <View style={styles.middleContainer} pointerEvents="none">
        <View style={[styles.middleCurve1, { backgroundColor: baseColor }]} />
        <View style={[styles.middleCurve2, { backgroundColor: baseColor }]} />
      </View>
    );
  }

  // bottom (default)
  return (
    <View style={styles.bottomContainer} pointerEvents="none">
      <View style={[styles.bottomCurve1, { backgroundColor: baseColor }]} />
      <View style={[styles.bottomCurve2, { backgroundColor: baseColor }]} />
      <View style={[styles.bottomCurve3, { backgroundColor: baseColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -60,
    left: -40,
    right: -40,
    height: 200,
    overflow: 'hidden',
  },
  topCurve1: {
    position: 'absolute',
    top: 0,
    left: -20,
    width: 500,
    height: 180,
    borderBottomLeftRadius: 300,
    borderBottomRightRadius: 200,
    opacity: 0.04,
    transform: [{ rotate: '-3deg' }],
  },
  topCurve2: {
    position: 'absolute',
    top: 20,
    right: -40,
    width: 400,
    height: 140,
    borderBottomLeftRadius: 250,
    borderBottomRightRadius: 180,
    opacity: 0.03,
    transform: [{ rotate: '2deg' }],
  },
  middleContainer: {
    position: 'absolute',
    left: -60,
    right: -60,
    height: 300,
    overflow: 'hidden',
  },
  middleCurve1: {
    position: 'absolute',
    top: 30,
    left: -20,
    width: 500,
    height: 200,
    borderRadius: 250,
    opacity: 0.035,
    transform: [{ rotate: '-8deg' }],
  },
  middleCurve2: {
    position: 'absolute',
    top: 80,
    right: -60,
    width: 350,
    height: 150,
    borderRadius: 200,
    opacity: 0.025,
    transform: [{ rotate: '5deg' }],
  },
  bottomContainer: {
    position: 'absolute',
    bottom: -40,
    left: -60,
    right: -60,
    height: 250,
    overflow: 'hidden',
  },
  bottomCurve1: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 500,
    height: 200,
    borderTopLeftRadius: 200,
    borderTopRightRadius: 300,
    opacity: 0.05,
    transform: [{ rotate: '2deg' }],
  },
  bottomCurve2: {
    position: 'absolute',
    bottom: 10,
    right: -50,
    width: 380,
    height: 160,
    borderTopLeftRadius: 250,
    borderTopRightRadius: 180,
    opacity: 0.035,
    transform: [{ rotate: '-4deg' }],
  },
  bottomCurve3: {
    position: 'absolute',
    bottom: -10,
    left: 40,
    width: 300,
    height: 120,
    borderTopLeftRadius: 180,
    borderTopRightRadius: 220,
    opacity: 0.025,
    transform: [{ rotate: '6deg' }],
  },
});
