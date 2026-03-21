import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';

interface DecorativeCurveProps {
  variant?: 'top' | 'middle' | 'bottom';
  color?: string;
  opacity?: number;
}

export function DecorativeCurve({
  variant = 'bottom',
  color,
  opacity = 0.07,
}: DecorativeCurveProps) {
  const { width } = useWindowDimensions();
  const baseColor = color || colors.primary;

  if (variant === 'top') {
    return (
      <View style={styles.topContainer} pointerEvents="none">
        <Svg width={width + 40} height={220} viewBox={`0 0 ${width + 40} 220`}>
          {/* Main flowing wave */}
          <Path
            d={`M-20,180 C${width * 0.15},60 ${width * 0.35},200 ${width * 0.55},100 S${width * 0.85},20 ${width + 40},140`}
            fill="none"
            stroke={baseColor}
            strokeWidth={3}
            opacity={opacity}
          />
          {/* Second parallel wave */}
          <Path
            d={`M-20,195 C${width * 0.2},80 ${width * 0.4},210 ${width * 0.58},115 S${width * 0.88},40 ${width + 40},155`}
            fill="none"
            stroke={baseColor}
            strokeWidth={1.5}
            opacity={opacity * 0.6}
          />
        </Svg>
      </View>
    );
  }

  if (variant === 'middle') {
    return (
      <View style={styles.middleContainer} pointerEvents="none">
        <Svg width={width + 40} height={160} viewBox={`0 0 ${width + 40} 160`}>
          {/* Main S-curve */}
          <Path
            d={`M-20,120 C${width * 0.1},20 ${width * 0.3},150 ${width * 0.5},60 S${width * 0.75},140 ${width + 40},40`}
            fill="none"
            stroke={baseColor}
            strokeWidth={2.5}
            opacity={opacity}
          />
          {/* Thinner companion */}
          <Path
            d={`M-20,130 C${width * 0.15},35 ${width * 0.35},155 ${width * 0.52},72 S${width * 0.78},148 ${width + 40},55`}
            fill="none"
            stroke={baseColor}
            strokeWidth={1.2}
            opacity={opacity * 0.5}
          />
        </Svg>
      </View>
    );
  }

  // bottom (default)
  return (
    <View style={styles.bottomContainer} pointerEvents="none">
      <Svg width={width + 40} height={250} viewBox={`0 0 ${width + 40} 250`}>
        {/* Main flowing wave from left to right */}
        <Path
          d={`M-20,50 C${width * 0.1},180 ${width * 0.25},10 ${width * 0.45},140 S${width * 0.7},30 ${width * 0.85},190 S${width + 20},80 ${width + 40},120`}
          fill="none"
          stroke={baseColor}
          strokeWidth={3}
          opacity={opacity}
        />
        {/* Second thinner wave */}
        <Path
          d={`M-20,65 C${width * 0.12},190 ${width * 0.28},25 ${width * 0.47},150 S${width * 0.72},45 ${width * 0.87},200 S${width + 22},95 ${width + 40},135`}
          fill="none"
          stroke={baseColor}
          strokeWidth={1.5}
          opacity={opacity * 0.5}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  topContainer: {
    position: 'absolute',
    top: -30,
    left: -20,
    right: -20,
    height: 220,
    overflow: 'hidden',
  },
  middleContainer: {
    height: 40,
    marginVertical: -20,
    overflow: 'visible',
    marginHorizontal: -20,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: -20,
    right: -20,
    height: 250,
    overflow: 'hidden',
  },
});
