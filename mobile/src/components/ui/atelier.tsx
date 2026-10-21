// Atelier — small set of artisanal display primitives.
// Hand-drawn warmth: ink stamps, eyebrow labels, italic display, script accents,
// and scribbled rules. Used across the redesigned screens.

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { colors, fonts, typography, spacing } from '../../theme';

// ─── Eyebrow — uppercase tracked label ──────────────────────────
interface EyebrowProps {
  children: React.ReactNode;
  color?: string;
  size?: number;
  track?: number;
  style?: StyleProp<TextStyle>;
}

export const Eyebrow = React.memo(function Eyebrow({
  children, color = colors.textSecondary, size = 10.5, track = 1.6, style,
}: EyebrowProps) {
  return (
    <Text style={[
      { fontSize: size, fontWeight: '700', letterSpacing: track, color, textTransform: 'uppercase' },
      style,
    ]}>
      {children}
    </Text>
  );
});

// ─── Display — italic serif headline ────────────────────────────
interface DisplayProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  italic?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export const Display = React.memo(function Display({
  children, size = 24, color = colors.text, italic = true, style, numberOfLines,
}: DisplayProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{
        fontFamily: fonts.serif,
        fontSize: size,
        fontStyle: italic ? 'italic' : 'normal',
        fontWeight: '400',
        letterSpacing: -0.3,
        color,
      }, style]}
    >
      {children}
    </Text>
  );
});

// ─── Script — handwritten accent text ───────────────────────────
interface ScriptProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export const Script = React.memo(function Script({
  children, size = 18, color = colors.accent, style,
}: ScriptProps) {
  return (
    <Text style={[
      typography.script,
      { fontSize: size, color },
      style,
    ]}>
      {children}
    </Text>
  );
});

// ─── Number — italic serif tabular number ───────────────────────
interface NumProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
}

export const Num = React.memo(function Num({
  children, size = 16, color = colors.text, weight = '400', style,
}: NumProps) {
  return (
    <Text style={[{
      fontFamily: fonts.serif,
      fontSize: size,
      fontWeight: weight,
      fontStyle: 'italic',
      color,
    }, style]}>
      {children}
    </Text>
  );
});

// ─── Scribble — hand-drawn underline ────────────────────────────
interface ScribbleProps {
  width?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const Scribble = React.memo(function Scribble({
  width = 40, color = colors.accent, style,
}: ScribbleProps) {
  return (
    <View style={style}>
      <Svg width={width} height={10} viewBox={`0 0 ${width} 10`}>
        <Path
          d={`M 2 6 Q ${width * 0.25} 2, ${width * 0.5} 5 T ${width - 2} 4`}
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          opacity={0.85}
        />
      </Svg>
    </View>
  );
});

// ─── InkStamp — circular monogram stamp ─────────────────────────
interface InkStampProps {
  size?: number;
  color?: string;
  letter?: string;
  rotate?: number;
  label?: string;
}

export const InkStamp = React.memo(function InkStamp({
  size = 40, color = colors.accent, letter = 'M', rotate = -5, label,
}: InkStampProps) {
  return (
    <View style={{ width: size, height: size, transform: [{ rotate: `${rotate}deg` }] }}>
      <Svg width={size} height={size} viewBox="0 0 60 60">
        <Circle cx={30} cy={30} r={26} stroke={color} strokeWidth={1.6} fill="none" opacity={0.9} />
        <Circle cx={30} cy={30} r={22} stroke={color} strokeWidth={0.8} fill="none" opacity={0.55} />
        <SvgText
          x={30}
          y={36.5}
          textAnchor="middle"
          fill={color}
          fontFamily={fonts.serif}
          fontSize={22}
          fontWeight="400"
        >
          {letter}
        </SvgText>
        {label ? (
          <SvgText
            x={30}
            y={50}
            textAnchor="middle"
            fill={color}
            fontFamily={fonts.body}
            fontSize={3.6}
            letterSpacing={1}
            fontWeight="700"
          >
            {label}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
});

// ─── HangTag — string-tag chip ──────────────────────────────────
interface HangTagProps {
  children: React.ReactNode;
  color?: string;
  background?: string;
  rotate?: number;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export const HangTag = React.memo(function HangTag({
  children, color = colors.accent, background = colors.cardBackground,
  rotate = -3, size = 'md', style,
}: HangTagProps) {
  const padV = size === 'sm' ? 4 : 6;
  const padH = size === 'sm' ? 10 : 14;
  const fs = size === 'sm' ? 11 : 12;
  return (
    <View style={[
      {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: background,
        borderWidth: 1.2,
        borderColor: color,
        borderRadius: 4,
        paddingVertical: padV,
        paddingLeft: padH + 12,
        paddingRight: padH,
        transform: [{ rotate: `${rotate}deg` }],
      },
      style,
    ]}>
      <View style={{
        position: 'absolute',
        left: 6,
        top: '50%',
        marginTop: -4,
        width: 7,
        height: 7,
        borderRadius: 999,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: color,
      }} />
      <Text style={{
        fontSize: fs,
        fontWeight: '600',
        letterSpacing: 0.3,
        color,
      }}>
        {children}
      </Text>
    </View>
  );
});

// ─── DashedRule — horizontal dashed divider ─────────────────────
interface DashedRuleProps {
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const DashedRule = React.memo(function DashedRule({
  color = colors.border, style,
}: DashedRuleProps) {
  return (
    <View style={[
      { height: 1, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: color, opacity: 0.85 },
      style,
    ]} />
  );
});

// ─── Section — eyebrow + scribble pairing ───────────────────────
interface SectionLabelProps {
  children: React.ReactNode;
  color?: string;
  scribbleColor?: string;
  scribbleWidth?: number;
  style?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
}

export const SectionLabel = React.memo(function SectionLabel({
  children, color = colors.textSecondary, scribbleColor = colors.accent,
  scribbleWidth = 28, style, right,
}: SectionLabelProps) {
  return (
    <View style={[styles.sectionRow, style]}>
      <View style={styles.sectionLeft}>
        <Scribble width={scribbleWidth} color={scribbleColor} style={{ marginRight: 8 }} />
        <Eyebrow color={color}>{children}</Eyebrow>
      </View>
      {right}
    </View>
  );
});

const styles = StyleSheet.create({
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
