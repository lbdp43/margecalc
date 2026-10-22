/**
 * Slider (spec §3.6 + §5.6, grafts 2 & 13). Mouse AND touch (PanResponder,
 * reliable on RNW 0.19).
 *
 *   <Slider value={price} onChange={setPrice} min={1} max={20} step={0.1}
 *           formatLabel={(v) => formatEuro(v, { trimZeros: true })}
 *           marker={{ value: 7.96, label: 'Objectif 65 % · 7,96 €' }}
 *           zones={[{ to: 5.6, color: 'bad' }, { to: 7.96, color: 'warn' }, { color: 'good' }]}
 *           onSlidingChange={setDragging} accessibilityLabel="Prix de vente TTC" />
 *
 * - Track 6 px (surface3, or tinted by zones), em600→em700 gradient fill.
 * - 28 px knob with a 10 px em700 core, grows to 1.15 while grabbed.
 * - Magnetic detent at the marker (±1.5 % of the track) with a select haptic.
 * - Values snap to `step`. While dragging, `onChange` fires continuously; use
 *   `onSlidingChange(true/false)` to make AnimatedNumbers update instantly.
 * - Accessible: role slider with aria-valuemin/max/now/valuetext on web,
 *   focusable with the keyboard (arrows ± step, PageUp/PageDown, Home/End,
 *   focus ring on the knob); VoiceOver/TalkBack increment/decrement on native.
 */
import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { elevation, gradients, motion, palette, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { clamp, roundToStep } from '../../utils/format';
import { springOrTiming } from './motion';

const KNOB = 28;
const INSET = KNOB / 2;
const ROW = 44;
const DETENT = 0.015;

export type ZoneColor = 'good' | 'warn' | 'bad' | string;
export interface SliderZone {
  /** Upper bound (value domain). Omit on the last zone. */
  to?: number;
  color: ZoneColor;
}

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Called on release with the final value. */
  onChangeEnd?: (value: number) => void;
  onSlidingChange?: (sliding: boolean) => void;
  marker?: { value: number; label?: string };
  zones?: SliderZone[];
  /** Min / max labels under the track ends. */
  formatLabel?: (v: number) => string;
  showMinMax?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  /** Spoken value (default: formatLabel(value)). */
  accessibilityValueText?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ZONE_TINT: Record<string, string> = {
  good: '#CBEBDB',
  warn: '#FBE2B3',
  bad: '#F7D2CB',
};

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  onChangeEnd,
  onSlidingChange,
  marker,
  zones,
  formatLabel,
  showMinMax = true,
  disabled = false,
  accessibilityLabel,
  accessibilityValueText,
  style,
  testID,
}: SliderProps) {
  const reduce = useReducedMotion();
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const [trackW, setTrackW] = useState(0);
  const range = max - min || 1;
  const ratioOf = (v: number) => clamp((v - min) / range, 0, 1);

  const pos = useSharedValue(ratioOf(value));
  const grab = useSharedValue(0);
  const w = useSharedValue(0);

  // Latest props for the (stable) PanResponder.
  const props = useRef({ min, max, step, range, onChange, onChangeEnd, onSlidingChange, marker, disabled, trackW });
  props.current = { min, max, step, range, onChange, onChangeEnd, onSlidingChange, marker, disabled, trackW };
  const dragging = useRef(false);
  const startX = useRef(0);
  const lastValue = useRef(value);
  const inDetent = useRef(false);

  useEffect(() => {
    lastValue.current = value;
    if (dragging.current) return;
    const r = ratioOf(value);
    pos.value = reduce ? r : withTiming(r, { duration: 120, easing: motion.easing.standard });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max]);

  const updateFromX = (x: number) => {
    const p = props.current;
    if (!p.trackW) return;
    let r = clamp(x / p.trackW, 0, 1);
    if (p.marker) {
      const mr = clamp((p.marker.value - p.min) / p.range, 0, 1);
      if (Math.abs(r - mr) <= DETENT) {
        r = mr;
        if (!inDetent.current) {
          inDetent.current = true;
          haptics.select();
        }
      } else inDetent.current = false;
    }
    pos.value = r;
    let v = p.min + r * p.range;
    const snappedToMarker = p.marker && inDetent.current;
    v = snappedToMarker ? Number(p.marker!.value.toFixed(2)) : clamp(roundToStep(v, p.step), p.min, p.max);
    if (v !== lastValue.current) {
      lastValue.current = v;
      p.onChange(v);
    }
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !props.current.disabled,
      onMoveShouldSetPanResponder: () => !props.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        dragging.current = true;
        props.current.onSlidingChange?.(true);
        grab.value = springOrTiming(1, motion.spring.snappy, reduceRef.current);
        startX.current = (e.nativeEvent.locationX ?? 0) - INSET;
        updateFromX(startX.current);
      },
      onPanResponderMove: (_e, g) => {
        updateFromX(startX.current + g.dx);
      },
      onPanResponderRelease: () => end(),
      onPanResponderTerminate: () => end(),
    }),
  ).current;

  function end() {
    dragging.current = false;
    grab.value = springOrTiming(0, motion.spring.snappy, reduceRef.current);
    props.current.onSlidingChange?.(false);
    props.current.onChangeEnd?.(lastValue.current);
  }

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const tw = e.nativeEvent.layout.width - KNOB;
    setTrackW(tw);
    w.value = tw;
  };

  const fillStyle = useAnimatedStyle(() => ({ width: pos.value * w.value }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * w.value }, { scale: 1 + grab.value * 0.15 }],
  }));
  const knobShadow = useAnimatedStyle(() => ({ opacity: grab.value }));

  // Zones → track segments (value domain → flex)
  let zoneSegments: { flex: number; color: string }[] | null = null;
  if (zones && zones.length) {
    let from = min;
    zoneSegments = zones
      .map((z) => {
        const to = clamp(z.to ?? max, min, max);
        const seg = { flex: Math.max(0, to - from), color: ZONE_TINT[z.color] ?? z.color };
        from = Math.max(from, to);
        return seg;
      })
      .filter((s) => s.flex > 0);
  }

  const markerRatio = marker ? ratioOf(marker.value) : null;
  const label = (v: number) => (formatLabel ? formatLabel(v) : String(v));

  // Marker label clamping
  const [markerLabelW, setMarkerLabelW] = useState(0);
  const [minW, setMinW] = useState(0);
  const [maxW, setMaxW] = useState(0);
  let markerLeft = 0;
  if (markerRatio !== null && trackW) {
    const center = INSET + markerRatio * trackW;
    const lo = showMinMax ? minW + 10 : 0;
    const hi = trackW + KNOB - (showMinMax ? maxW + 10 : 0) - markerLabelW;
    markerLeft = clamp(center - markerLabelW / 2, lo, Math.max(lo, hi));
  }

  const setTo = (next: number) => {
    const v = clamp(roundToStep(next, step), min, max);
    if (v === lastValue.current) return;
    lastValue.current = v;
    onChange(v);
    onChangeEnd?.(v);
  };
  const stepA11y = (dir: 1 | -1) => setTo(lastValue.current + dir * step);

  // Web keyboard (WAI-ARIA slider pattern): arrows ± step, PageUp/Down ± 10
  // steps, Home/End → min/max. A focus ring shows on the knob.
  const [focused, setFocused] = useState(false);
  const onKeyDown = (e: any) => {
    if (disabled) return;
    const k = e?.nativeEvent?.key ?? e?.key;
    const big = Math.max(step * 10, (max - min) / 10);
    let next: number | null = null;
    if (k === 'ArrowRight' || k === 'ArrowUp') next = lastValue.current + step;
    else if (k === 'ArrowLeft' || k === 'ArrowDown') next = lastValue.current - step;
    else if (k === 'PageUp') next = lastValue.current + big;
    else if (k === 'PageDown') next = lastValue.current - big;
    else if (k === 'Home') next = min;
    else if (k === 'End') next = max;
    if (next === null) return;
    e.preventDefault?.();
    setTo(next);
  };
  const valueText = accessibilityValueText ?? label(value);
  const webA11y =
    Platform.OS === 'web'
      ? ({
          'aria-valuemin': min,
          'aria-valuemax': max,
          'aria-valuenow': value,
          'aria-valuetext': valueText,
          'aria-disabled': disabled || undefined,
          tabIndex: disabled ? -1 : 0,
          onKeyDown,
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
        } as any)
      : null;

  return (
    <View style={[{ opacity: disabled ? 0.5 : 1 }, style]} testID={testID}>
      <View
        style={[styles.row, Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'grab', touchAction: 'none', userSelect: 'none', outlineStyle: 'none' } as any) : null]}
        onLayout={onTrackLayout}
        {...responder.panHandlers}
        {...webA11y}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value, text: valueText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => stepA11y(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        <View style={styles.track} pointerEvents="none">
          {zoneSegments ? (
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', borderRadius: 3, overflow: 'hidden' }]}>
              {zoneSegments.map((s, i) => (
                <View key={i} style={{ flex: s.flex, backgroundColor: s.color }} />
              ))}
            </View>
          ) : null}
          <Animated.View style={[styles.fill, fillStyle]}>
            <LinearGradient {...gradients.sliderFill} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
        {markerRatio !== null && trackW ? (
          <View pointerEvents="none" style={[styles.markerTick, { left: INSET + markerRatio * trackW - 1 }]} />
        ) : null}
        <Animated.View pointerEvents="none" style={[styles.knob, focused && styles.knobFocused, knobStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.knobGrabShadow, knobShadow]} />
          <View style={styles.knobCore} />
        </Animated.View>
      </View>
      {showMinMax || marker?.label ? (
        <View style={styles.labels} pointerEvents="none">
          {showMinMax ? (
            <Text style={styles.minmax} onLayout={(e) => setMinW(e.nativeEvent.layout.width)}>
              {label(min)}
            </Text>
          ) : (
            <View />
          )}
          {showMinMax ? (
            <Text style={styles.minmax} onLayout={(e) => setMaxW(e.nativeEvent.layout.width)}>
              {label(max)}
            </Text>
          ) : null}
          {marker?.label && trackW ? (
            <Text
              style={[styles.markerLabel, { left: markerLeft, opacity: markerLabelW ? 1 : 0 }]}
              numberOfLines={1}
              onLayout={(e) => setMarkerLabelW(e.nativeEvent.layout.width)}
            >
              {marker.label}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ROW,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: INSET,
    backgroundColor: palette.surface3,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    overflow: 'hidden',
  },
  markerTick: {
    position: 'absolute',
    top: ROW / 2 - 8,
    width: 2,
    height: 16,
    borderRadius: 1,
    backgroundColor: 'rgba(11,28,21,0.35)',
  },
  knob: {
    position: 'absolute',
    left: 0,
    top: (ROW - KNOB) / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.knob,
  },
  knobFocused: { borderWidth: 2, borderColor: palette.em700, ...(Platform.OS === 'web' ? ({ boxShadow: `0 0 0 4px ${palette.focusRing}` } as any) : null) },
  knobGrabShadow: {
    borderRadius: KNOB / 2,
    ...elevation.knobGrab,
  },
  knobCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.em700,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    minHeight: 18,
  },
  minmax: { ...type.footnote, color: palette.text3, fontVariant: ['tabular-nums'] },
  markerLabel: {
    ...type.footnoteStrong,
    color: palette.text2,
    position: 'absolute',
    top: 0,
    fontVariant: ['tabular-nums'],
  },
});
