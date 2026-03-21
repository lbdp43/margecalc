import React, { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent, Text } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface PriceSliderProps {
  min: number;
  max: number;
  value: number;
  step?: number;
  onValueChange: (value: number) => void;
  formatLabel?: (value: number) => string;
  accentColor?: string;
}

export function PriceSlider({
  min,
  max,
  value,
  step = 0.1,
  onValueChange,
  formatLabel,
  accentColor = colors.primary,
}: PriceSliderProps) {
  const trackRef = useRef<View>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [trackX, setTrackX] = useState(0);

  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  const thumbX = ratio * trackWidth;

  const updateValue = (pageX: number) => {
    const x = pageX - trackX;
    const r = Math.max(0, Math.min(1, x / trackWidth));
    const raw = min + r * (max - min);
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onValueChange(Math.round(clamped * 100) / 100);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => updateValue(e.nativeEvent.pageX),
      onPanResponderMove: (e) => updateValue(e.nativeEvent.pageX),
    })
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
    trackRef.current?.measureInWindow((x) => {
      if (x !== undefined) setTrackX(x);
    });
  };

  const label = formatLabel ? formatLabel(value) : String(value);

  return (
    <View style={styles.container}>
      <View
        ref={trackRef}
        style={styles.track}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.trackFill, { width: thumbX, backgroundColor: accentColor }]} />
        <View style={[styles.thumb, { left: thumbX - 14, borderColor: accentColor }]}>
          <Text style={[styles.thumbLabel, { color: accentColor }]}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  track: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    justifyContent: 'center',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  thumb: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 3,
    top: -11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbLabel: {
    position: 'absolute',
    top: -22,
    ...typography.caption,
    fontWeight: '700',
    width: 80,
    textAlign: 'center',
  },
});
