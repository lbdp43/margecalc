/**
 * The invoice viewfinder: a rounded em50 frame with four corner brackets.
 * Empty, it shows a drawn invoice whose product rows are being picked out;
 * with a photo, it shows the photo and, while reading, an emerald sweep that
 * runs down the page (a static band under reduce motion).
 */
import React, { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useReduceMotion } from '../../components/ui';
import { palette, radius } from '../../theme';

export type FrameStatus = 'idle' | 'working' | 'done' | 'error';

interface InvoiceFrameProps {
  uri?: string | null;
  status?: FrameStatus;
  height: number;
  style?: StyleProp<ViewStyle>;
}

const SWEEP_H = 110;

export function InvoiceFrame({ uri, status = 'idle', height, style }: InvoiceFrameProps) {
  const reduce = useReduceMotion();
  const [h, setH] = useState(height);
  const y = useSharedValue(0.5);
  const working = status === 'working';

  useEffect(() => {
    if (!working || reduce) {
      cancelAnimation(y);
      y.value = 0.5;
      return;
    }
    y.value = 0;
    y.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(y);
  }, [working, reduce, y]);

  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value * (h - SWEEP_H / 2) - SWEEP_H / 2 }],
  }));

  return (
    <View
      style={[styles.frame, { height }, style]}
      onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={uri ? 'Photo de la facture' : 'Cadrez la facture en entier'}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <InvoiceArt height={Math.min(176, height * 0.74)} />
        </View>
      )}

      {uri && status === 'error' ? <View style={[StyleSheet.absoluteFill, styles.dim, styles.noTouch]} /> : null}

      {working ? (
        <>
          <View style={[StyleSheet.absoluteFill, styles.tint, styles.noTouch]} />
          <Animated.View style={[styles.sweep, styles.noTouch, sweep]}>
            <LinearGradient
              colors={['rgba(111,211,168,0)', 'rgba(111,211,168,0.42)', 'rgba(111,211,168,0)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.sweepLine} />
          </Animated.View>
        </>
      ) : null}

      <Corners color={uri ? palette.onEmerald : palette.em700} hideTopRight={status === 'done' || status === 'error'} />

      {status === 'done' || status === 'error' ? (
        <View style={[styles.badgeRow, styles.noTouch]}>
          <View style={[styles.badge, { backgroundColor: status === 'done' ? palette.em700 : palette.badSolid }]}>
            <Ionicons name={status === 'done' ? 'checkmark' : 'alert'} size={18} color={palette.onEmerald} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Corners({ color, hideTopRight }: { color: string; hideTopRight?: boolean }) {
  const s = { borderColor: color };
  return (
    <View style={[StyleSheet.absoluteFill, styles.noTouch, { margin: 14 }]}>
      <View style={[styles.corner, s, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 }]} />
      {hideTopRight ? null : <View style={[styles.corner, s, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 }]} />}
      <View style={[styles.corner, s, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 }]} />
      <View style={[styles.corner, s, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 }]} />
    </View>
  );
}

/** A drawn supplier invoice: header, a table of rows, two rows picked out in emerald. */
function InvoiceArt({ height }: { height: number }) {
  const w = height * 0.76;
  const rows = [0, 1, 2, 3, 4];
  return (
    <Svg width={w} height={height} viewBox="0 0 76 100">
      {/* paper */}
      <Rect x={1} y={1} width={74} height={98} rx={6} fill={palette.surface} stroke={palette.line} strokeWidth={1} />
      {/* header */}
      <Rect x={8} y={9} width={26} height={5} rx={2.5} fill={palette.em700} />
      <Rect x={8} y={17} width={18} height={2.4} rx={1.2} fill={palette.lineStrong} />
      <Rect x={50} y={9} width={18} height={4} rx={2} fill={palette.ink} opacity={0.82} />
      <Rect x={54} y={16} width={14} height={2.4} rx={1.2} fill={palette.lineStrong} />
      {/* table head */}
      <Rect x={8} y={28} width={60} height={6} rx={2} fill={palette.surface2} />
      {rows.map((i) => {
        const yy = 39 + i * 9;
        const picked = i === 0 || i === 2;
        return (
          <React.Fragment key={i}>
            {picked ? <Rect x={6} y={yy - 2.6} width={64} height={7.6} rx={2.4} fill={palette.em50} /> : null}
            {picked ? <Circle cx={10.5} cy={yy + 1.2} r={2.2} fill={palette.em700} /> : null}
            {picked ? <Path d={`M9.4 ${yy + 1.2} l0.8 0.8 l1.6 -1.6`} stroke={palette.surface} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null}
            <Rect x={picked ? 15 : 9} y={yy} width={picked ? 26 : 30 - (i % 2) * 6} height={2.4} rx={1.2} fill={picked ? palette.em800 : palette.lineStrong} />
            <Rect x={48} y={yy} width={5} height={2.4} rx={1.2} fill={picked ? palette.em600 : palette.surface3} />
            <Rect x={58} y={yy} width={9} height={2.4} rx={1.2} fill={picked ? palette.em600 : palette.surface3} />
          </React.Fragment>
        );
      })}
      {/* totals */}
      <Rect x={44} y={86} width={24} height={2.4} rx={1.2} fill={palette.lineStrong} />
      <Rect x={50} y={91} width={18} height={3.4} rx={1.7} fill={palette.ink} opacity={0.82} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: palette.em50,
    borderWidth: 1,
    borderColor: palette.line,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  noTouch: { pointerEvents: 'none' },
  dim: { backgroundColor: palette.scrim },
  tint: { backgroundColor: 'rgba(4,64,46,0.16)' },
  sweep: { position: 'absolute', left: 0, right: 0, top: 0, height: SWEEP_H, justifyContent: 'center' },
  sweepLine: { height: 2, backgroundColor: palette.em300, opacity: 0.95 },
  corner: { position: 'absolute', width: 30, height: 30 },
  badgeRow: { position: 'absolute', top: 14, right: 14 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
  },
});
