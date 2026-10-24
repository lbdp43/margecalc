/**
 * Meter / ProgressBar — animated width (0 → value over 500 ms decel).
 * CompositionBar — segments with `flex: amount` and 3 px gaps, using the ONE
 * colour mapping (Achat em800 · Accise em300 · Sécu lime on emerald / warnSolid on light).
 *
 *   <Meter value={0.796} color={palette.good} marker={0.65} />
 *   <CompositionBar surface="emerald" segments={[
 *     { key: 'achat', value: 11 }, { key: 'accise', value: 5.41 }, { key: 'secu', value: 1.74 },
 *   ]} legend="labels" />
 */
import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { compositionColors, motion, palette, type } from '../../theme';
import { formatEuro } from '../../utils/format';

export interface MeterProps {
  /** 0..1 */
  value: number;
  color?: string;
  trackColor?: string;
  height?: number;
  /** Objective tick position 0..1 (e.g. 0.65 for 65 %). */
  marker?: number;
  markerColor?: string;
  delay?: number;
  duration?: number;
  /** Skip the grow animation. */
  instant?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Meter({
  value,
  color = palette.em600,
  trackColor = palette.surface2,
  height = 6,
  marker,
  markerColor = palette.marker,
  delay = 0,
  duration = 500,
  instant = false,
  style,
  accessibilityLabel,
}: MeterProps) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, isFinite(value) ? value : 0));
  const w = useSharedValue(instant || reduce ? clamped : 0);

  useEffect(() => {
    if (instant || reduce) {
      w.value = clamped;
      return;
    }
    w.value = withDelay(delay, withTiming(clamped, { duration, easing: motion.easing.decel }));
  }, [clamped, instant, reduce, delay, duration, w]);

  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View
      style={[{ height: Math.max(height, marker !== undefined ? 16 : height), justifyContent: 'center' }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}>
        <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]} />
      </View>
      {marker !== undefined ? (
        <View
          pointerEvents="none"
          style={[styles.marker, { left: `${Math.max(0, Math.min(1, marker)) * 100}%`, backgroundColor: markerColor, height: height + 10 }]}
        />
      ) : null}
    </View>
  );
}

/** Alias kept for readability in forms / uploads. */
export const ProgressBar = Meter;

export type CompositionKey = 'achat' | 'accise' | 'secu' | 'tva';

export interface CompositionSegment {
  key: CompositionKey | string;
  value: number;
  label?: string;
  /** Override colour (e.g. the good/warn/bad distribution bar). */
  color?: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  achat: 'Achat',
  accise: 'Accise',
  secu: 'Sécu.',
  tva: 'TVA',
};

export interface CompositionBarProps {
  segments: CompositionSegment[];
  /** Which surface the bar sits on — picks the colour mapping. */
  surface?: 'light' | 'emerald';
  height?: number;
  gap?: number;
  /** Legend below: dots + labels, dots + labels + values, or nothing. */
  legend?: false | 'labels' | 'values';
  formatValue?: (n: number) => string;
  style?: StyleProp<ViewStyle>;
}

export function compositionColor(key: string, surface: 'light' | 'emerald' = 'light'): string {
  const map: Record<string, string> = surface === 'emerald' ? compositionColors.onEmerald : compositionColors.light;
  return map[key] ?? palette.text4;
}

export function CompositionBar({
  segments,
  surface = 'light',
  height = 8,
  gap = 3,
  legend = false,
  formatValue = (n) => formatEuro(n),
  style,
}: CompositionBarProps) {
  const visible = segments.filter((s) => s.value > 0 && isFinite(s.value));
  const textColor = surface === 'emerald' ? palette.onEmerald2 : palette.text3;
  const valueColor = surface === 'emerald' ? palette.onEmerald : palette.ink;
  const total = visible.reduce((a, s) => a + s.value, 0);
  const a11y = visible
    .map((s) => `${s.label ?? DEFAULT_LABELS[s.key] ?? s.key} ${Math.round((s.value / (total || 1)) * 100)} pour cent`)
    .join(', ');

  return (
    <View style={style} accessibilityRole="image" accessibilityLabel={a11y}>
      <View style={{ flexDirection: 'row', height, gap }}>
        {visible.map((s) => {
          const amount = s.value;
          return (
          <View
            key={s.key}
            style={{
              flex: amount,
              height,
              borderRadius: height / 2,
              backgroundColor: s.color ?? compositionColor(s.key, surface),
            }}
          />
          );
        })}
        {visible.length === 0 ? (
          <View style={{ flex: 1, height, borderRadius: height / 2, backgroundColor: surface === 'emerald' ? 'rgba(255,255,255,0.16)' : palette.surface2 }} />
        ) : null}
      </View>
      {legend ? (
        <View style={[styles.legend, legend === 'values' && styles.legendValues]}>
          {segments.map((s) => (
            <View key={s.key} style={legend === 'values' ? styles.legendItemValues : styles.legendItem}>
              <View style={styles.legendLabelRow}>
                <View style={[styles.dot, { backgroundColor: s.color ?? compositionColor(s.key, surface) }]} />
                <Text style={[type.footnote, { color: textColor }]} numberOfLines={1}>
                  {s.label ?? DEFAULT_LABELS[s.key] ?? s.key}
                </Text>
              </View>
              {legend === 'values' ? (
                <Text style={[type.numS, { color: valueColor, marginTop: 2 }]}>{formatValue(s.value)}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 16,
    rowGap: 6,
    marginTop: 10,
  },
  legendValues: {
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    columnGap: 8,
  },
  legendItem: {},
  legendItemValues: { flexShrink: 1 },
  legendLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
