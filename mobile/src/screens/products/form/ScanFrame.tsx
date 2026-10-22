/**
 * The scan step's viewfinder: a rounded frame with four emerald corner
 * brackets. Empty, it shows a drawn bottle with its label; with a photo, it
 * shows the photo and, while reading, an emerald sweep that runs down the
 * label (static band under reduce motion).
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
import Svg, { Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { palette, radius } from '../../../theme';
import { useReduceMotion } from '../../../components/ui';

type Status = 'idle' | 'working' | 'done' | 'error';

interface ScanFrameProps {
  uri?: string | null;
  status?: Status;
  height: number;
  style?: StyleProp<ViewStyle>;
}

const SWEEP_H = 96;

export function ScanFrame({ uri, status = 'idle', height, style }: ScanFrameProps) {
  const reduce = useReduceMotion();
  const [h, setH] = useState(height);
  const y = useSharedValue(0);
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
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.cubic) }),
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
      accessibilityLabel={uri ? 'Photo de l’étiquette' : 'Cadrez l’étiquette de la bouteille'}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <BottleArt size={Math.min(150, height * 0.62)} />
        </View>
      )}

      {uri && status === 'error' ? <View style={[StyleSheet.absoluteFill, styles.dim]} /> : null}

      {working ? (
        <>
          <View style={[StyleSheet.absoluteFill, styles.tint]} pointerEvents="none" />
          <Animated.View pointerEvents="none" style={[styles.sweep, sweep]}>
            <LinearGradient
              colors={['rgba(111,211,168,0)', 'rgba(111,211,168,0.42)', 'rgba(111,211,168,0)']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.sweepLine} />
          </Animated.View>
        </>
      ) : null}

      <Corners color={uri ? '#FFFFFF' : palette.em700} />

      {status === 'done' || status === 'error' ? (
        <View style={styles.badgeRow} pointerEvents="none">
          <View style={[styles.badge, { backgroundColor: status === 'done' ? palette.em700 : palette.badSolid }]}>
            <Ionicons name={status === 'done' ? 'checkmark' : 'alert'} size={18} color="#FFFFFF" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Corners({ color }: { color: string }) {
  const s = { borderColor: color };
  return (
    <View style={[StyleSheet.absoluteFill, { margin: 14 }]} pointerEvents="none">
      <View style={[styles.corner, s, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 }]} />
      <View style={[styles.corner, s, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 }]} />
      <View style={[styles.corner, s, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 }]} />
      <View style={[styles.corner, s, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 }]} />
    </View>
  );
}

/** A drawn bottle: emerald glass, white label with « lines » of text. */
function BottleArt({ size }: { size: number }) {
  const w = size * 0.56;
  return (
    <Svg width={w} height={size} viewBox="0 0 56 100">
      <Rect x={22} y={2} width={12} height={8} rx={2} fill={palette.em800} />
      <Path
        d="M23 10 h10 v14 c0 4 11 9 11 22 v44 a8 8 0 0 1 -8 8 h-16 a8 8 0 0 1 -8 -8 v-44 c0 -13 11 -18 11 -22 z"
        fill={palette.em600}
      />
      <Path d="M17 40 c2 -6 6 -9 8 -11" stroke="rgba(255,255,255,0.35)" strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Rect x={14} y={50} width={28} height={30} rx={4} fill="#FFFFFF" />
      <Rect x={19} y={56} width={18} height={4} rx={2} fill={palette.em700} />
      <Rect x={19} y={64} width={14} height={2.6} rx={1.3} fill={palette.lineStrong} />
      <Rect x={19} y={70} width={16} height={2.6} rx={1.3} fill={palette.lineStrong} />
      <Rect x={19} y={75} width={9} height={2.6} rx={1.3} fill={palette.em300} />
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
  dim: { backgroundColor: 'rgba(11,28,21,0.35)' },
  tint: { backgroundColor: 'rgba(4,64,46,0.18)' },
  sweep: { position: 'absolute', left: 0, right: 0, top: 0, height: SWEEP_H, justifyContent: 'center' },
  sweepLine: { height: 2, backgroundColor: palette.em300, opacity: 0.95 },
  corner: { position: 'absolute', width: 30, height: 30 },
  badgeRow: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
