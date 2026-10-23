/**
 * Chip + ChipRow (spec §3.4).
 *
 *   <Chip label="Spiritueux" count={9} selected={sel} onPress={…} />
 *   <Chip label="Verre 5 cl" icon="wine-outline" done />          « déjà tarifé » mark
 *   <Chip label="Verre 5 cl" icon="wine-outline" pending />       on, price still to set (dashed circle)
 *   <Chip label="< 50 %" dot={marginColors.red.solid} count={3} />  zone dot before the label
 *   <ChipRow compact … />   12 px sides, 6 px gaps: three zone chips fit a 360 px row
 *
 *   <ChipRow
 *     items={[{ key: 'all', label: 'Tous', count: 24 }, { key: 'spi', label: 'Spiritueux', count: 9 }]}
 *     selectedKey={cat} onSelect={setCat} />
 *
 * ChipRow is a horizontal ScrollView (gap 8, side padding 20) that bleeds to
 * the screen edges (`bleed`, default true = marginHorizontal −20), and keeps
 * the selected chip in view. Edge fades (44 px) show only where there is more
 * to scroll: on the right until the end is reached, on the left once the row
 * has scrolled from its start. Labels are never truncated.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
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
  /**
   * Same 16 px place as `done`, as a dashed circle: switched on, but still
   * waiting for something (a service whose price is « à calculer »). Say it in
   * `accessibilityLabel` too (« Verre 5 cl, ajouté, prix à calculer »).
   */
  pending?: boolean;
  /**
   * An 8 px dot of this colour before the label, e.g. a margin zone
   * (`marginColors[zone].solid`). Decorative: say the zone in the label or
   * `accessibilityLabel`. Selected, it gets a 1.5 px white ring inside the same
   * 8 px box (so it stays distinct on em700 and the chip never changes width).
   */
  dot?: string;
  /** Tighter chip: 12 px sides and 6 px between dot / icon, label and count (narrow rows). */
  compact?: boolean;
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
  pending,
  dot,
  compact = false,
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
      aria-pressed={onPress ? selected : undefined}
      accessibilityLabel={accessibilityLabel ?? (count !== undefined ? `${label}, ${count}` : label)}
      testID={testID}
      style={[styles.chip, compact && styles.compact, bg, disabled && { opacity: 0.5 }, style]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: dot }, selected ? styles.dotSelected : null]} /> : null}
      {icon ? <Ionicons name={icon} size={18} color={selected ? '#FFFFFF' : palette.text2} /> : null}
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? <Text style={[styles.count, { color: countColor }]}>{count}</Text> : null}
      {done ? (
        <View style={[styles.done, selected && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Ionicons name="checkmark" size={11} color={selected ? '#FFFFFF' : palette.good} />
        </View>
      ) : pending ? (
        <View style={[styles.pending, selected && { borderColor: 'rgba(255,255,255,0.72)' }]} />
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
  /** Dashed circle: on, still waiting (see `ChipProps.pending`). */
  pending?: boolean;
  /** Colour of a small dot before the label (see `ChipProps.dot`). */
  dot?: string;
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
  /** Compact chips (`ChipProps.compact`), e.g. three zone chips on a 360 px phone. */
  compact?: boolean;
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
  compact = false,
  style,
  contentContainerStyle,
  accessibilityLabel,
}: ChipRowProps) {
  const ref = useRef<ScrollView>(null);
  const positions = useRef<Record<number, { x: number; width: number }>>({});
  const viewport = useRef(0);
  const contentW = useRef(0);
  const offsetX = useRef(0);
  const mounted = useRef(false);
  // Edge fades: 1 = shown. The right one starts hidden until the row is known to overflow.
  const leftFade = useSharedValue(0);
  const rightFade = useSharedValue(0);
  const updateFades = useCallback(() => {
    const vw = viewport.current;
    const cw = contentW.current;
    if (!vw || !cw) return;
    const left = offsetX.current > 4 ? 1 : 0;
    const right = offsetX.current + vw < cw - 4 ? 1 : 0;
    if (leftFade.value !== left) leftFade.value = withTiming(left, { duration: motion.duration.fast });
    if (rightFade.value !== right) rightFade.value = withTiming(right, { duration: motion.duration.fast });
  }, [leftFade, rightFade]);
  const leftFadeStyle = useAnimatedStyle(() => ({ opacity: leftFade.value }));
  const rightFadeStyle = useAnimatedStyle(() => ({ opacity: rightFade.value }));
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetX.current = e.nativeEvent.contentOffset.x;
    contentW.current = e.nativeEvent.contentSize.width || contentW.current;
    updateFades();
  };

  const activeIndex = items ? items.findIndex((i) => i.key === selectedKey) : selectedIndex ?? -1;

  const scrollToActive = (animated: boolean) => {
    const pos = positions.current[activeIndex];
    if (!pos || !ref.current) return;
    // Initial: only when the chip would sit under the right fade; then x − 128.
    if (!animated && pos.x + pos.width <= viewport.current - 44) return;
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
          pending={it.pending}
          dot={it.dot}
          compact={compact}
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
          updateFades();
        }}
        onContentSizeChange={(w) => {
          contentW.current = w;
          updateFades();
        }}
        onScroll={fade ? onScroll : undefined}
        scrollEventThrottle={16}
        contentContainerStyle={[{ gap: 8, paddingHorizontal: inset, alignItems: 'center' }, contentContainerStyle]}
      >
        {content}
      </ScrollView>
      {fade ? (
        <>
          <Animated.View style={[styles.fadeLeft, leftFadeStyle]} pointerEvents="none">
            <LinearGradient {...(fade === 'surface' ? gradients.fadeLeftSurface : gradients.fadeLeft)} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View style={[styles.fade, rightFadeStyle]} pointerEvents="none">
            <LinearGradient {...(fade === 'surface' ? gradients.fadeRightSurface : gradients.fadeRight)} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </>
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
  compact: { paddingHorizontal: 12, gap: 6 },
  label: { ...type.calloutStrong, flexShrink: 0 },
  // The chip's gap separates it from the label (MarginLegend dots are the same size).
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  // Selected (em700): a 1.5 px white ring inside the same 8 px box, so the chip keeps its width.
  dotSelected: { borderWidth: 1.5, borderColor: palette.onEmerald },
  count: { ...type.footnoteStrong, fontVariant: ['tabular-nums'] },
  done: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.goodBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pending: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: palette.text3,
  },
  fade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
  },
  fadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 32,
  },
});
