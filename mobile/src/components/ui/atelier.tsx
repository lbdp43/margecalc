/**
 * DEPRECATED — the « Atelier » display primitives, neutralised app-wide.
 * The exports are kept so not-yet-redesigned screens compile, but they now
 * render the D1 « Émeraude Signature » equivalents (no serif, no italics, no
 * script, no scribbles). Do NOT use them in new code: use `type.*`,
 * SectionHeader, BrandMark and Badge from components/ui.
 *
 *   Eyebrow      → small label in text3 (caps style kept only for its size)
 *   Display      → Jakarta 800 title
 *   Script       → Jakarta 600 in em700 (upright)
 *   Num          → Jakarta 800 tabular
 *   Scribble     → renders nothing
 *   InkStamp     → BrandMark
 *   HangTag      → brand Badge
 *   DashedRule   → 1 px line divider
 *   SectionLabel → SectionHeader style
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { fontFamily, palette, type } from '../../theme';
import { BrandMark } from './Brand';

// Old screens pass Atelier colours explicitly (e.g. colors.textMuted on a
// light background, or "rgba(243,248,236,0.78)" on emerald) — keep them.

interface EyebrowProps {
  children: React.ReactNode;
  color?: string;
  size?: number;
  track?: number;
  style?: StyleProp<TextStyle>;
}

export const Eyebrow = React.memo(function Eyebrow({ children, color = palette.text3, style }: EyebrowProps) {
  return <Text style={[type.footnoteStrong, { color }, style]}>{children}</Text>;
});

interface DisplayProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  italic?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export const Display = React.memo(function Display({ children, size = 24, color = palette.ink, style, numberOfLines }: DisplayProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: fontFamily.extrabold, fontSize: Math.min(size, 30), lineHeight: Math.round(Math.min(size, 30) * 1.2), letterSpacing: -0.6, color },
        style,
      ]}
    >
      {children}
    </Text>
  );
});

interface ScriptProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export const Script = React.memo(function Script({ children, size = 16, color, style }: ScriptProps) {
  // Light colours were used on emerald headers — keep them readable; dark ones become em700.
  const isLight = typeof color === 'string' && /^(rgba\(2[0-9]{2}|#F|#f|white)/.test(color);
  return (
    <Text
      style={[
        { fontFamily: fontFamily.semibold, fontSize: Math.min(Math.max(size, 13), 18), lineHeight: Math.round(Math.min(Math.max(size, 13), 18) * 1.35), color: isLight ? color : palette.em700 },
        style,
      ]}
    >
      {children}
    </Text>
  );
});

interface NumProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
}

export const Num = React.memo(function Num({ children, size = 16, color = palette.ink, style }: NumProps) {
  return (
    <Text style={[{ fontFamily: fontFamily.extrabold, fontSize: size, letterSpacing: -0.5, color, fontVariant: ['tabular-nums'] }, style]}>
      {children}
    </Text>
  );
});

interface ScribbleProps {
  width?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const Scribble = React.memo(function Scribble(_props: ScribbleProps) {
  return null;
});

interface InkStampProps {
  size?: number;
  color?: string;
  letter?: string;
  rotate?: number;
  label?: string;
}

export const InkStamp = React.memo(function InkStamp({ size = 40, color }: InkStampProps) {
  const onEmerald = typeof color === 'string' && /^(#F|#f|rgba\(2[0-9]{2}|white)/.test(color);
  return <BrandMark size={size} variant={onEmerald ? 'onEmerald' : 'brand'} />;
});

interface HangTagProps {
  children: React.ReactNode;
  color?: string;
  background?: string;
  rotate?: number;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export const HangTag = React.memo(function HangTag({ children, size = 'md', style }: HangTagProps) {
  return (
    <View style={[styles.tag, size === 'sm' && styles.tagSm, style]}>
      <Text style={[styles.tagText, size === 'sm' && { fontSize: 12 }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
});

interface DashedRuleProps {
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const DashedRule = React.memo(function DashedRule({ style }: DashedRuleProps) {
  return <View style={[{ height: 1, backgroundColor: palette.line }, style]} />;
});

interface SectionLabelProps {
  children: React.ReactNode;
  color?: string;
  scribbleColor?: string;
  scribbleWidth?: number;
  style?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
}

export const SectionLabel = React.memo(function SectionLabel({ children, style, right }: SectionLabelProps) {
  return (
    <View style={[styles.sectionRow, style]}>
      <Text style={[type.title3, { color: palette.ink, flexShrink: 1 }]}>{children}</Text>
      {right}
    </View>
  );
});

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: palette.em50,
    justifyContent: 'center',
  },
  tagSm: { height: 22, paddingHorizontal: 8, borderRadius: 11 },
  tagText: { fontFamily: fontFamily.bold, fontSize: 13, color: palette.em700 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 32,
  },
});
