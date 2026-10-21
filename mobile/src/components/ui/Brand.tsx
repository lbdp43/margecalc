/**
 * Brand (spec §2).
 *
 *   <BrandMark />                         40 px squircle, em600→em800 gradient, white double ring + « M »
 *   <BrandMark variant="onEmerald" />     12 % white with a 22 % white border (on hero gradients)
 *   <BrandMark variant="tonal" size={44}/> em700 rings, no fill (inside an em50 circle — EmptyState)
 *   <Wordmark tone="onEmerald" />         « MargeBar Pro » + « par La Brasserie des Plantes »
 *   <Avatar name="Le Comptoir Démo" variant="onEmerald" />   « LC »
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { elevation, fontFamily, gradients, palette, type } from '../../theme';

export interface BrandMarkProps {
  size?: number;
  variant?: 'brand' | 'onEmerald' | 'tonal';
  style?: StyleProp<ViewStyle>;
}

export function BrandMark({ size = 40, variant = 'brand', style }: BrandMarkProps) {
  const k = size / 40;
  const ringColor = variant === 'tonal' ? palette.em700 : 'rgba(255,255,255,0.9)';
  const ring2Color = variant === 'tonal' ? 'rgba(8,117,83,0.55)' : 'rgba(255,255,255,0.55)';
  const fg = variant === 'tonal' ? palette.em700 : '#FFFFFF';
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 12 * k,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        variant === 'brand' && elevation.mark,
        variant === 'onEmerald' && { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel="MargeBar Pro"
    >
      {variant === 'brand' ? (
        <LinearGradient {...gradients.iconTile} style={[StyleSheet.absoluteFill, { borderRadius: 12 * k }]} />
      ) : null}
      <View
        style={{
          position: 'absolute',
          top: 5 * k,
          left: 5 * k,
          right: 5 * k,
          bottom: 5 * k,
          borderRadius: size,
          borderWidth: Math.max(1, 1.5 * k),
          borderColor: ringColor,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 8 * k,
          left: 8 * k,
          right: 8 * k,
          bottom: 8 * k,
          borderRadius: size,
          borderWidth: Math.max(0.75, 1 * k),
          borderColor: ring2Color,
        }}
      />
      <Text
        style={{ fontFamily: fontFamily.extrabold, fontSize: 13 * k, lineHeight: 16 * k, letterSpacing: -0.4 * k, color: fg }}
        allowFontScaling={false}
      >
        M
      </Text>
    </View>
  );
}

export interface WordmarkProps {
  tone?: 'onEmerald' | 'light';
  withMark?: boolean;
  /** Hide the « par La Brasserie des Plantes » line. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Wordmark({ tone = 'light', withMark = true, compact, style }: WordmarkProps) {
  const on = tone === 'onEmerald';
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, style]} accessible accessibilityLabel="MargeBar Pro, par La Brasserie des Plantes">
      {withMark ? <BrandMark variant={on ? 'onEmerald' : 'brand'} /> : null}
      <View>
        <Text style={{ fontFamily: fontFamily.extrabold, fontSize: 17, lineHeight: 21, letterSpacing: -0.3, color: on ? '#FFFFFF' : palette.ink }}>
          MargeBar Pro
        </Text>
        {!compact ? (
          <Text style={[type.footnote, { color: on ? palette.onEmerald2 : palette.text3 }]}>par La Brasserie des Plantes</Text>
        ) : null}
      </View>
    </View>
  );
}

export function initialsOf(name?: string | null): string {
  if (!name) return 'MB';
  const words = name
    .replace(/[.,;:!?()«»"&]/g, ' ')
    .split(/[\s'’-]+/)
    .filter((w) => w.length > 0);
  const letters = (words[0]?.[0] ?? '') + (words[1]?.[0] ?? words[0]?.[1] ?? '');
  return letters.toUpperCase() || 'MB';
}

export interface AvatarProps {
  name?: string | null;
  size?: number;
  variant?: 'onEmerald' | 'light';
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ name, size = 44, variant = 'light', style }: AvatarProps) {
  const on = variant === 'onEmerald';
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? 'rgba(255,255,255,0.12)' : palette.em50,
          borderWidth: on ? 1 : 0,
          borderColor: 'rgba(255,255,255,0.22)',
        },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={name ?? 'Profil'}
    >
      <Text style={{ fontFamily: fontFamily.extrabold, fontSize: size * 0.36, letterSpacing: -0.3, color: on ? '#FFFFFF' : palette.em700 }} allowFontScaling={false}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}
