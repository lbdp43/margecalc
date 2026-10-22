import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette } from '../../theme';
import type { IconName } from './Icon';

/**
 * Service icons (spec §3.4): `flask-outline` for shots, `wine-outline` for
 * glasses, `beer-outline` for demis and pints. Resolved from the service name,
 * then its volume, so custom services get a sensible glyph too.
 *
 *   <ServingTypeIcon name="Pinte" size={36} />           em50 tile, em700 glyph
 *   servingIconName('Verre de vin', 12) → 'wine-outline'
 */
export function servingIconName(name?: string | null, volumeCl?: number | null): IconName {
  const n = (name ?? '').toLowerCase();
  if (/shot|shooter|dose|liqueur|digestif/.test(n)) return 'flask-outline';
  if (/demi|pinte|bi[eè]re|pression|galopin|chope|pichet/.test(n)) return 'beer-outline';
  if (/verre|vin|coupe|fl[uû]te|ballon|cocktail/.test(n)) return 'wine-outline';
  if (/canette|bouteille|soft|jus/.test(n)) return 'cafe-outline';
  const v = volumeCl ?? 0;
  if (v > 0 && v <= 4) return 'flask-outline';
  if (v >= 20) return 'beer-outline';
  return 'wine-outline';
}

interface ServingTypeIconProps {
  name: string;
  /** Legacy emoji hint (unused: the name and volume decide). */
  icon?: string;
  volumeCl?: number;
  size?: number;
  /** Tile colours (default em50 / em700). */
  tone?: 'brand' | 'neutral';
}

export function ServingTypeIcon({ name, volumeCl, size = 40, tone = 'brand' }: ServingTypeIconProps) {
  const glyph = servingIconName(name, volumeCl);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: Math.round(size * 0.3) },
        tone === 'neutral' ? { backgroundColor: palette.surface2 } : null,
      ]}
    >
      <Ionicons name={glyph} size={Math.round(size * 0.5)} color={tone === 'neutral' ? palette.text2 : palette.em700} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
