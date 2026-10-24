/**
 * Badge (spec §3.17).
 *
 *   <Badge variant="margin" value={69} />                      ● 69,0 %  (zone from the user's thresholds)
 *   <Badge variant="margin" zone="orange" label="À surveiller" />
 *   <Badge variant="brand" icon="shield-checkmark" label="Tarifs 2026" size="sm" />
 *   <Badge variant="lime" icon="sparkles" label="Gratuit" />
 *   <Badge variant="pillDark" icon="trending-up" label="+7,5 pts vs objectif" />
 *   <Badge variant="count" label="24" />
 *   <Badge variant="neutral" label="Brouillon" icon="checkmark-circle" />
 *
 * The margin colour always comes from `getMarginColor(value, userThresholds)`.
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily, marginColors, MarginZone, palette, type } from '../../theme';
import { formatPercent } from '../../utils/format';
import { getMarginZone, MarginThresholds, useMarginThresholds } from '../../utils/marginThresholds';
import { IconName } from './Icon';

export type BadgeVariant = 'margin' | 'brand' | 'lime' | 'pillDark' | 'count' | 'neutral' | 'onEmerald';

export interface BadgeProps {
  variant?: BadgeVariant;
  /** margin: the percentage (→ label « 69,0 % » and the zone). */
  value?: number;
  zone?: MarginZone;
  thresholds?: MarginThresholds;
  label?: string;
  icon?: IconName;
  /** md 26 · sm 22 */
  size?: 'md' | 'sm';
  /** margin: hide the dot. */
  noDot?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Badge(props: BadgeProps) {
  if (props.variant === 'margin' || props.variant === undefined) return <MarginBadge {...props} />;
  return <PlainBadge {...props} />;
}

function MarginBadge({ value, zone, thresholds, label, size = 'md', noDot, style, accessibilityLabel, icon }: BadgeProps) {
  const userThresholds = useMarginThresholds();
  const z: MarginZone = zone ?? getMarginZone(value ?? 0, thresholds ?? userThresholds);
  const c = marginColors[z];
  const text = label ?? formatPercent(value ?? 0, 1);
  const sm = size === 'sm';
  return (
    <View
      style={[styles.base, sm ? styles.sm : styles.md, { backgroundColor: c.bg }, style]}
      accessible
      accessibilityLabel={accessibilityLabel ?? `Marge ${text.replace(/ /g, ' ').replace('%', 'pour cent')}, ${c.label}`}
    >
      {icon ? <Ionicons name={icon} size={13} color={c.fg} /> : !noDot ? <View style={[styles.dot, { backgroundColor: c.solid }]} /> : null}
      <Text style={[styles.text, sm && styles.textSm, { color: c.fg }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {text}
      </Text>
    </View>
  );
}

const PLAIN: Record<Exclude<BadgeVariant, 'margin'>, { bg: string; fg: string }> = {
  brand: { bg: palette.em50, fg: palette.em700 },
  lime: { bg: palette.lime, fg: palette.onLime },
  pillDark: { bg: 'rgba(197,240,74,0.16)', fg: palette.lime },
  onEmerald: { bg: 'rgba(255,255,255,0.12)', fg: '#FFFFFF' },
  count: { bg: 'transparent', fg: palette.text3 },
  neutral: { bg: palette.surface2, fg: palette.text2 },
};

function PlainBadge({ variant = 'brand', label = '', icon, size = 'md', style, accessibilityLabel }: BadgeProps) {
  const c = PLAIN[variant as Exclude<BadgeVariant, 'margin'>];
  const sm = size === 'sm';
  if (variant === 'count') {
    return (
      <Text style={[styles.count, style as any]} accessibilityLabel={accessibilityLabel}>
        {label}
      </Text>
    );
  }
  const big = variant === 'lime' || variant === 'pillDark';
  return (
    <View
      style={[
        styles.base,
        sm ? styles.sm : big ? styles.lg : styles.md,
        { backgroundColor: c.bg },
        variant === 'onEmerald' && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
        style,
      ]}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? <Ionicons name={icon} size={sm ? 12 : big ? 15 : 14} color={c.fg} /> : null}
      <Text
        style={[styles.text, sm && styles.textSm, big && !sm && styles.textLg, { color: c.fg }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    borderRadius: 999,
  },
  md: { height: 26, paddingHorizontal: 10 },
  sm: { height: 22, paddingHorizontal: 8, gap: 4 },
  lg: { height: 30, paddingHorizontal: 12, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'] },
  textSm: { fontSize: 12, lineHeight: 16 },
  textLg: { fontSize: 14, lineHeight: 18 },
  count: { ...type.footnoteStrong, color: palette.text3, fontVariant: ['tabular-nums'] },
});
