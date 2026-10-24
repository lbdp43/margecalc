/**
 * The countdown of an undo toast (« Aperol supprimé · Annuler ⑤ »): the
 * seconds left in a 24 px ring that drains clockwise from the top, in lime on
 * the ink toast.
 *
 *   <UndoCountdown remaining={0.62} seconds={4} />
 *
 * Logic adapted from Kokonut UI « Undo Button » by @dorianbaffier (kokonutui.com,
 * MIT License, Copyright (c) 2025 kokonutUI): the remaining time drawn as a
 * draining outline plus the seconds digit. The ring itself is redrawn by the
 * Toast host's clock (time-based, paused while held, hovered or in the
 * background). Under reduce motion the ring stays full and only the digit
 * changes, once a second.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fontFamily, palette } from '../../theme';

const SIZE = 24;
const STROKE = 2;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export interface UndoCountdownProps {
  /** 1 → 0: the share of the window left. */
  remaining: number;
  /** Whole seconds left (shown in the ring). */
  seconds: number;
  /** Reduce motion: a full, static ring. */
  still?: boolean;
  color?: string;
}

export function UndoCountdown({ remaining, seconds, still, color = palette.lime }: UndoCountdownProps) {
  const left = still ? 1 : Math.max(0, Math.min(1, remaining));
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={palette.onEmeraldWash} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={color}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${C} ${C}`}
          // Starts at 12 o'clock and drains back toward it, clockwise.
          strokeDashoffset={C * (1 - left)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <Text style={[styles.digit, { color }]}>{Math.max(0, seconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  digit: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 14, fontVariant: ['tabular-nums'] },
});
