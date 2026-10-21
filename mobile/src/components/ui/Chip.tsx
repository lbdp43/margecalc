/**
 * Chip + ChipRow (spec §3.4).
 *
 *   <Chip label="Spiritueux" count={9} selected={sel} onPress={…} />
 *   <Chip label="Verre 5 cl" icon="wine-outline" done />          « déjà tarifé » mark
 *
 *   <ChipRow
 *     items={[{ key: 'all', label: 'Tous', count: 24 }, { key: 'spi', label: 'Spiritueux', count: 9 }]}
 *     selectedKey={cat} onSelect={setCat} />
 *
 * ChipRow is a horizontal ScrollView (gap 8, side padding 20) that bleeds to
 * the screen edges (`bleed`, default true = marginHorizontal −20), with a
 * 44 px right-edge fade, and keeps the selected chip in view. Labels are
 * never truncated.
 */
import React, { useEffect, useRef } from 'react';
import { LayoutChangeEvent, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { gradients, layout, motion, palette, radius, type } from '../../theme';
import { PressableScale } from './PressableScale';
import { IconName } from './Icon';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  count?: number | string;
  /** Small goodBg check circle (e.g. a service type that already has a price). */
  done?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  testID?: string;
}

export const Chip = React.memo(function Chip({
  label,
  selected = false,
  onPress,
  icon,
  count,
  done,
  disabled,
  style,
  accessibilityLabel,
  onLayout,
  testID,
}: ChipProps) {
  const p = useSharedValue(selected ? 1 : 0);
  const pressed = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(selected ? 1 : 0, { duration: motion.duration.fast, easing: motion.easing.standard });
  }, [selected, p]);

  const bg = useAnimatedStyle(() => {
    const base = interpolateColor(p.value, [0, 1], [palette.surface, palette.em700]);
    return {
      backgroundColor: pressed.value > 0.5 && p.value < 0.5 ? palette.surface2 : base,
      borderColor: interpolateColor(p.value, [0, 1], [palette.line, palette.em700]),
    };
  });

  const fg = selected ? '#FFFFFF' : palette.text2;
  const countColor = selected ? 'rgba(255,255,255,0.72)' : palette.text3;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo="chip"
      haptic="select"
      progress={pressed}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? (count !== undefined ? `${label}, ${count}` : label)}
      testID={testID}
      style={[styles.chip, bg, disabled && { opacity: 0.5 }, style]}
    >
      {icon ? <Ionicons name={icon} size={18} color={selected ? '#FFFFFF' : palette.text2} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? <Text style={[styles.count, { color: countColor }]}>{count}</Text> : null}
      {done ? (
        <View style={[styles.done, selected && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Ionicons name="checkmark" size={11} color={selected ? '#FFFFFF' : palette.good} />
        </View>
      ) : null}
    </PressableScale>
  );
});

export interface ChipItem {
  key: string;
  label: string;
  icon?: IconName;
  count?: number | string;
  done?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export interface ChipRowProps {
  items?: ChipItem[];
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  /** Custom chips instead of `items` (selection scrolling uses `selectedIndex`). */
  children?: React.ReactNode;
  selectedIndex?: number;
  /** Bleed to the screen edges (marginHorizontal −20). Default true. */
  bleed?: boolean;
  /** Inner side padding (default 20). */
  inset?: number;
  /** Colour behind the row, for the right-edge fade. */
  fade?: 'bg' | 'surface' | false;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function ChipRow({
  items,
  selectedKey,
  onSelect,
  children,
  selectedIndex,
  bleed = true,
  inset = layout.gutter,
  fade = 'bg',
  style,
  contentContainerStyle,
  accessibilityLabel,
}: ChipRowProps) {
  const ref = useRef<ScrollView>(null);
  const positions = useRef<Record<number, { x: number; width: number }>>({});
  const viewport = useRef(0);
  const mounted = useRef(false);

  const activeIndex = items ? items.findIndex((i) => i.key === selectedKey) : selectedIndex ?? -1;

  const scrollToActive = (animated: boolean) => {
    const pos = positions.current[activeIndex];
    if (!pos || !ref.current) return;
    const target = animated ? pos.x - (viewport.current - pos.width) / 2 : pos.x - 128;
    ref.current.scrollTo({ x: Math.max(0, target), animated });
  };

  useEffect(() => {
    if (mounted.current) scrollToActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const onItemLayout = (index: number) => (e: LayoutChangeEvent) => {
    positions.current[index] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
    if (!mounted.current && index === activeIndex) {
      mounted.current = true;
      requestAnimationFrame(() => scrollToActive(false));
    }
  };

  const content = items
    ? items.map((it, i) => (
        <Chip
          key={it.key}
          label={it.label}
          icon={it.icon}
          count={it.count}
          done={it.done}
          disabled={it.disabled}
          accessibilityLabel={it.accessibilityLabel}
          selected={it.key === selectedKey}
          onPress={() => onSelect?.(it.key)}
          onLayout={onItemLayout(i)}
        />
      ))
    : React.Children.map(children, (child, i) => <View onLayout={onItemLayout(i)}>{child}</View>);

  if (activeIndex < 0) mounted.current = true;

  return (
    <View style={[bleed && { marginHorizontal: -layout.gutter }, style]} accessibilityLabel={accessibilityLabel}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => {
          viewport.current = e.nativeEvent.layout.width;
        }}
        contentContainerStyle={[{ gap: 8, paddingHorizontal: inset, alignItems: 'center' }, contentContainerStyle]}
      >
        {content}
      </ScrollView>
      {fade ? (
        <LinearGradient
          {...(fade === 'surface' ? gradients.fadeRightSurface : gradients.fadeRight)}
          style={styles.fade}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 44,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  label: { ...type.calloutStrong, flexShrink: 0 },
  count: { ...type.footnoteStrong, fontVariant: ['tabular-nums'] },
  done: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.goodBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
  },
});
