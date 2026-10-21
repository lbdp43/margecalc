import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, GestureResponderEvent, LayoutChangeEvent, Text, Platform } from 'react-native';
import { colors, spacing, typography } from '../../theme';

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
  const trackXRef = useRef(0);

  const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  const thumbX = ratio * trackWidth;

  const computeValue = (pageX: number) => {
    const x = pageX - trackXRef.current;
    const r = Math.max(0, Math.min(1, x / trackWidth));
    const raw = min + r * (max - min);
    const stepped = Math.round(raw / step) * step;
    const clamped = Math.max(min, Math.min(max, stepped));
    onValueChange(Math.round(clamped * 100) / 100);
  };

  const measureAndUpdate = useCallback((e: GestureResponderEvent) => {
    const pageX = e.nativeEvent.pageX;

    // Re-measure track position every time to account for scroll
    if (Platform.OS === 'web' && trackRef.current) {
      try {
        const node = trackRef.current as any;
        // On web, we can access the DOM node directly
        if (node && typeof node.getBoundingClientRect === 'function') {
          const rect = node.getBoundingClientRect();
          trackXRef.current = rect.left;
        } else if (node._nativeTag || node.measure) {
          node.measureInWindow?.((x: number) => {
            if (x !== undefined) trackXRef.current = x;
          });
        }
      } catch {
        // fallback to stored value
      }
    } else {
      trackRef.current?.measureInWindow?.((x) => {
        if (x !== undefined) trackXRef.current = x;
      });
    }

    computeValue(pageX);
  }, [min, max, step, trackWidth, onValueChange]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
    trackRef.current?.measureInWindow?.((x) => {
      if (x !== undefined) trackXRef.current = x;
    });
  };

  const label = formatLabel ? formatLabel(value) : String(value);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <View style={styles.labelSpacer} />
        <Text style={[styles.valueLabel, { color: accentColor }]}>{label}</Text>
      </View>
      <View
        ref={trackRef}
        style={styles.track}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={measureAndUpdate}
        onResponderMove={(e) => computeValue(e.nativeEvent.pageX)}
      >
        <View style={[styles.trackFill, { width: thumbX, backgroundColor: accentColor }]} />
        <View style={[styles.thumb, { left: thumbX - 12, borderColor: accentColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.sm,
  },
  labelSpacer: {
    flex: 1,
  },
  valueLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  track: {
    height: 32,
    justifyContent: 'center',
    cursor: 'pointer' as any,
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
});
