/**
 * StatTile (dashboard KPI) and ResultTile (pricing results), spec §3.7.
 *
 *   <StatTile label="Produits" value={24} unit="suivis" icon="cube-outline" />
 *   <StatTile label="Meilleur produit" icon="trophy-outline" iconTone="trophy">
 *     <RichContent/>
 *   </StatTile>
 *
 *   <ResultTile label="Marge" value={formatPercent(69)} zone="green" highlight caption="objectif 65 %" />
 *   <ResultTile label="Prix HT" value={formatEuro(7.5)} caption="HT · 5 cl" />
 *   <ResultGrid>{six ResultTiles}</ResultGrid>   2 rows × 3, gap 8
 */
import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { elevation, fontFamily, marginColors, MarginZone, motion, palette, radius, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { AnimatedNumber } from './AnimatedNumber';
import { PressableScale } from './PressableScale';
import { IconName } from './Icon';

// ─── StatTile ──────────────────────────────────────────────────────────────
export interface StatTileProps {
  label: string;
  /** Number → counts up (with `format`); string → shown as is. */
  value?: number | string;
  format?: (n: number) => string;
  unit?: string;
  icon?: IconName;
  iconTone?: 'brand' | 'trophy';
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  /** Delay for the count-up (stagger in dashboards). */
  delay?: number;
}

export function StatTile({
  label,
  value,
  format = (n) => String(Math.round(n)),
  unit,
  icon,
  iconTone = 'brand',
  children,
  onPress,
  style,
  valueStyle,
  accessibilityLabel,
  delay,
}: StatTileProps) {
  const tone = iconTone === 'trophy' ? { bg: palette.trophyBg, fg: palette.trophy } : { bg: palette.em50, fg: palette.em700 };
  const body = (
    <>
      <View style={styles.statTop}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        {icon ? (
          <View style={[styles.statIcon, { backgroundColor: tone.bg }]}>
            <Ionicons name={icon} size={18} color={tone.fg} />
          </View>
        ) : null}
      </View>
      {children ? (
        children
      ) : (
        <View style={styles.statValueRow}>
          {typeof value === 'number' ? (
            <AnimatedNumber value={value} format={format} style={[type.numL, { color: palette.ink }, valueStyle]} delay={delay} />
          ) : (
            <Text style={[type.numL, { color: palette.ink }, valueStyle]} maxFontSizeMultiplier={1.3}>
              {value}
            </Text>
          )}
          {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
        </View>
      )}
    </>
  );
  const a11y = accessibilityLabel ?? `${label}${value !== undefined ? ` : ${typeof value === 'number' ? format(value) : value}` : ''}${unit ? ` ${unit}` : ''}`;
  if (onPress) {
    return (
      <PressableScale scaleTo="card" onPress={onPress} accessibilityLabel={a11y} style={[styles.stat, style]}>
        {body}
      </PressableScale>
    );
  }
  return (
    <View style={[styles.stat, style]} accessible accessibilityLabel={a11y}>
      {body}
    </View>
  );
}

// ─── ResultTile ────────────────────────────────────────────────────────────
export interface ResultTileProps {
  label: string;
  value: string;
  caption?: string;
  /** Margin zone of the value (colours the highlight variant and the value). */
  zone?: MarginZone;
  /** Tinted background + Jakarta 800 value in the zone colour. */
  highlight?: boolean;
  /** Colour the value without the tinted background (e.g. Gain/dose in good). */
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function ResultTile({ label, value, caption, zone, highlight = false, valueColor, style, accessibilityLabel }: ResultTileProps) {
  const reduce = useReducedMotion();
  const z = zone ? marginColors[zone] : null;
  const prevZone = useRef<MarginZone | undefined>(zone);
  const from = useSharedValue(highlight && z ? z.bg : palette.surface);
  const to = useSharedValue(highlight && z ? z.bg : palette.surface);
  const t = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    const target = highlight && z ? z.bg : palette.surface;
    if (target === to.value) return;
    from.value = to.value;
    to.value = target;
    t.value = 0;
    t.value = withTiming(1, { duration: motion.duration.fast });
    if (highlight && prevZone.current && prevZone.current !== zone) {
      haptics.select();
      if (!reduce) scale.value = withSequence(withSpring(1.04, motion.spring.pop), withSpring(1, motion.spring.pop));
    }
    prevZone.current = zone;
  }, [zone, highlight, z, reduce, from, to, t, scale]);

  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [from.value, to.value]),
    transform: [{ scale: scale.value }],
  }));

  const color = valueColor ?? (highlight && z ? z.fg : palette.ink);
  const a11y =
    accessibilityLabel ??
    `${label} ${value.replace(/ /g, ' ').replace('%', 'pour cent').replace('€', 'euros')}${z ? `, ${z.label}` : ''}${caption ? `, ${caption}` : ''}`;

  return (
    <Animated.View
      style={[styles.result, highlight && z ? { borderColor: 'transparent' } : null, animated, style]}
      accessible
      accessibilityLabel={a11y}
    >
      <Text style={[styles.resultLabel, highlight && z ? { color: z.fg } : null]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[type.numM, { color }, highlight ? { fontFamily: fontFamily.extrabold } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
      {caption ? (
        <Text style={styles.resultCaption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** 3 columns, gap 8 — pass 3 or 6 ResultTiles. */
export function ResultGrid({ children, style, columns = 3 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; columns?: number }) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View style={[{ gap: 8 }, style]}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {r.map((c, j) => (
            <View key={j} style={{ flex: 1, minWidth: 0 }}>
              {c}
            </View>
          ))}
          {r.length < columns
            ? Array.from({ length: columns - r.length }).map((_, k) => <View key={`f${k}`} style={{ flex: 1 }} />)
            : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    minHeight: 100,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: 'space-between',
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 8,
    ...elevation.e2,
  },
  statTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  statLabel: { ...type.footnoteStrong, color: palette.text3, flex: 1, marginTop: 6 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  statUnit: { ...type.footnote, color: palette.text3 },
  result: {
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 2,
  },
  resultLabel: { ...type.footnoteStrong, fontSize: 12, lineHeight: 16, color: palette.text3 },
  resultCaption: { ...type.footnote, fontSize: 12, lineHeight: 16, color: palette.text3 },
});
