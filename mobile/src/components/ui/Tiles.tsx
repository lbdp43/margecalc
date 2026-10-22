/**
 * StatTile (dashboard KPI) and ResultTile (pricing results), spec §3.7.
 *
 *   <StatTile label="Produits" value={24} unit="suivis" icon="cube-outline" />
 *   <StatTile label="Meilleur produit" icon="trophy-outline" iconTone="trophy">
 *     <RichContent/>
 *   </StatTile>
 *
 *   <StatTile label="Marge moyenne" value="72,5 %" zone="green" highlight caption="objectif 65 %" />
 *
 *   <ResultTile label="Marge" value={formatPercent(69)} zone="green" highlight caption="objectif 65 %" />
 *   <ResultTile label="Prix HT" value={formatEuro(7.5)} caption="HT · 5 cl" compact />
 *   <ResultGrid>{six ResultTiles}</ResultGrid>   2 rows × 3, gap 8
 *
 * Long values shrink to fit their tile on every platform (native:
 * adjustsFontSizeToFit; web: the font size is computed from the measured width).
 */
import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
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

/**
 * Web: react-native-web ignores `adjustsFontSizeToFit`. Estimate the text width
 * (Jakarta, tabular digits ≈ 0.6 em per character) against the measured room
 * and return a smaller font size when it would not fit.
 */
function useFitFont(text: string, baseSize: number, minSize: number, inset: number) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  if (Platform.OS !== 'web' || !width || !text) return { onLayout, fit: null as TextStyle | null };
  const room = width - inset;
  const needed = text.length * baseSize * 0.6;
  if (needed <= room) return { onLayout, fit: null as TextStyle | null };
  const size = Math.max(minSize, Math.floor(room / (text.length * 0.6)));
  return { onLayout, fit: { fontSize: size, lineHeight: Math.round(size * 1.25), letterSpacing: -0.02 * size } as TextStyle };
}

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
  /** Line under the value (footnote, text3), e.g. « objectif 65 % ». */
  caption?: string;
  /** Margin zone of the value: colours it (and the tint with `highlight`). */
  zone?: MarginZone;
  /** Tinted background in the zone colour (goodBg / warnBg / badBg). */
  highlight?: boolean;
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
  caption,
  zone,
  highlight = false,
  accessibilityLabel,
  delay,
}: StatTileProps) {
  const tone = iconTone === 'trophy' ? { bg: palette.trophyBg, fg: palette.trophy } : { bg: palette.em50, fg: palette.em700 };
  const z = zone ? marginColors[zone] : null;
  const valueColor = z ? z.fg : palette.ink;
  const shownValue = value === undefined ? '' : typeof value === 'number' ? format(value) : value;
  const { onLayout, fit } = useFitFont(`${shownValue}${unit ? `  ${unit}` : ''}`, type.numL.fontSize as number, 18, 28);
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
        <View>
          <View style={styles.statValueRow}>
            {typeof value === 'number' ? (
              <AnimatedNumber value={value} format={format} style={[type.numL, { color: valueColor }, fit, valueStyle]} delay={delay} />
            ) : (
              <Text
                style={[type.numL, { color: valueColor }, fit, valueStyle]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                maxFontSizeMultiplier={1.3}
              >
                {value}
              </Text>
            )}
            {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
          </View>
          {caption ? (
            <Text style={[styles.statCaption, highlight && z ? { color: z.fg } : null]} numberOfLines={2}>
              {caption}
            </Text>
          ) : null}
        </View>
      )}
    </>
  );
  const a11y =
    accessibilityLabel ??
    `${label}${shownValue ? ` : ${shownValue}` : ''}${unit ? ` ${unit}` : ''}${z ? `, ${z.label}` : ''}${caption ? `, ${caption}` : ''}`;
  const tileStyle = [styles.stat, highlight && z ? { backgroundColor: z.bg, borderColor: 'transparent' } : null, style];
  if (onPress) {
    return (
      <PressableScale scaleTo="card" onPress={onPress} onLayout={onLayout} accessibilityLabel={a11y} style={tileStyle}>
        {body}
      </PressableScale>
    );
  }
  return (
    <View style={tileStyle} onLayout={onLayout} accessible accessibilityLabel={a11y}>
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
  /** Tighter tile (min height 56, padding 8/10, value 17) for dense grids and sheets. */
  compact?: boolean;
  valueStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function ResultTile({
  label,
  value,
  caption,
  zone,
  highlight = false,
  valueColor,
  compact = false,
  valueStyle,
  style,
  accessibilityLabel,
}: ResultTileProps) {
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
  const baseSize = compact ? 17 : (type.numM.fontSize as number);
  const { onLayout, fit } = useFitFont(value, baseSize, 11, compact ? 22 : 26);
  const a11y =
    accessibilityLabel ??
    `${label} ${value.replace(/ /g, ' ').replace('%', 'pour cent').replace('€', 'euros')}${z ? `, ${z.label}` : ''}${caption ? `, ${caption}` : ''}`;

  return (
    <Animated.View
      style={[styles.result, compact && styles.resultCompact, highlight && z ? { borderColor: 'transparent' } : null, animated, style]}
      onLayout={onLayout}
      accessible
      accessibilityLabel={a11y}
    >
      <Text style={[styles.resultLabel, highlight && z ? { color: z.fg } : null]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          type.numM,
          { color },
          compact ? styles.resultValueCompact : null,
          highlight ? { fontFamily: fontFamily.extrabold } : null,
          fit,
          valueStyle,
        ]}
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
              {React.isValidElement(c) ? React.cloneElement(c as React.ReactElement<any>, { style: [{ flex: 1 }, (c as any).props.style] }) : c}
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
  statCaption: { ...type.footnote, color: palette.text3, marginTop: 2 },
  result: {
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'flex-start',
    gap: 2,
  },
  resultCompact: { minHeight: 56, paddingHorizontal: 10, paddingVertical: 8 },
  resultValueCompact: { fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  resultLabel: { ...type.footnoteStrong, fontSize: 12, lineHeight: 16, color: palette.text3 },
  resultCaption: { ...type.footnote, fontSize: 12, lineHeight: 16, color: palette.text3 },
});
