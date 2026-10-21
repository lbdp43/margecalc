/**
 * SegmentedControl (spec §3.5): surface2 track 44 tall, radius 14, padding 4,
 * a white thumb sliding with the snappy spring. Optional unit hint per option.
 *
 *   <SegmentedControl
 *     options={[{ key: 'price', label: 'Prix', hint: '€' }, { key: 'margin', label: 'Marge', hint: '%' }, { key: 'coeff', label: 'Coeff', hint: '×' }]}
 *     value={mode} onChange={setMode} accessibilityLabel="Mode de calcul" />
 */
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { elevation, motion, palette, type } from '../../theme';
import { haptics } from '../../theme/haptics';

export interface SegmentOption<K extends string = string> {
  key: K;
  label: string;
  /** Unit hint shown after the label in text3 (« € », « % », « × »). */
  hint?: string;
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<K extends string = string> {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
  height?: number;
  accessibilityLabel?: string;
  /** On a white card the track stays surface2; on bg use 'surface3'. */
  track?: 'surface2' | 'surface3';
}

export function SegmentedControl<K extends string = string>({
  options,
  value,
  onChange,
  style,
  height = 44,
  accessibilityLabel,
  track = 'surface2',
}: SegmentedControlProps<K>) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const segW = width > 0 ? (width - 8) / options.length : 0;
  const x = useSharedValue(index * segW);
  const ready = useSharedValue(0);

  useEffect(() => {
    if (!segW) return;
    if (!ready.value) {
      x.value = index * segW;
      ready.value = 1;
      return;
    }
    x.value = reduce
      ? withTiming(index * segW, { duration: motion.duration.fast, easing: motion.easing.standard })
      : withSpring(index * segW, motion.spring.snappy);
  }, [index, segW, reduce, x, ready]);

  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    opacity: ready.value,
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      style={[styles.track, { height, backgroundColor: palette[track] }, style]}
      onLayout={onLayout}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {segW > 0 ? (
        <Animated.View style={[styles.thumb, { width: segW, height: height - 8 }, thumb]} pointerEvents="none" />
      ) : null}
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              if (!on) {
                haptics.select();
                onChange(o.key);
              }
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            style={[styles.opt, Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : null]}
          >
            <Text style={[styles.label, { color: on ? palette.ink : palette.text3 }]} numberOfLines={1}>
              {o.label}
              {o.hint ? <Text style={[styles.hint, { color: on ? palette.text3 : palette.text4 }]}>{` ${o.hint}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    borderRadius: 10,
    backgroundColor: palette.surface,
    ...elevation.thumb,
  },
  opt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...type.calloutStrong },
  hint: { ...type.footnoteStrong },
});
