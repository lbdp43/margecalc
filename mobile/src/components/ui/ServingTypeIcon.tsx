import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../theme';

/**
 * Maps serving type names (or icon hint strings) to Ionicons.
 * Each entry has a unique icon and a tint color from the app palette.
 */
const ICON_MAP: Record<string, { icon: string; tint: string }> = {
  // By name
  shot: { icon: 'flame-outline', tint: '#C0392B' },
  'verre (spiritueux)': { icon: 'wine-outline', tint: '#2D6A4F' },
  'verre de vin': { icon: 'wine', tint: '#8B1A4A' },
  demi: { icon: 'beer-outline', tint: '#E67E22' },
  pinte: { icon: 'beer', tint: '#D4A017' },
  // Fallback aliases by emoji
  '🥃': { icon: 'wine-outline', tint: '#2D6A4F' },
  '🍷': { icon: 'wine', tint: '#8B1A4A' },
  '🍺': { icon: 'beer-outline', tint: '#E67E22' },
};

const DEFAULT_ICON = { icon: 'ellipse-outline', tint: colors.accent };

interface ServingTypeIconProps {
  name: string;
  icon?: string;
  size?: number;
}

export function ServingTypeIcon({ name, icon, size = 40 }: ServingTypeIconProps) {
  const key = name.toLowerCase();
  const resolved = ICON_MAP[key] || (icon ? ICON_MAP[icon] : null) || DEFAULT_ICON;
  const iconSize = size * 0.5;

  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.25 }]}>
      <Ionicons name={resolved.icon as any} size={iconSize} color={resolved.tint} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
});
