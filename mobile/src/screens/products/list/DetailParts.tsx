/**
 * Building blocks of the product detail (D1 tokens, kit components only):
 *   DetailHero        photo (cross-fades in) or an emerald placeholder with the category icon
 *   KeyTile           key number with count-up (marge, coeff, gain/dose, gain par contenant)
 *   ServiceRow        one service: name, margin badge, Prix TTC / HT · Coût · Gain strip
 *   PriceHistoryCard  purchase-price history: sparkline + latest changes
 *   DetailSkeleton    mirrors the layout while nothing is cached
 */
import React, { useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { PriceHistoryEntry } from '../../../services/product.service';
import {
  AnimatedNumber,
  Badge,
  Card,
  HeroRings,
  Icon,
  IconName,
  PressableScale,
  Skeleton,
  SkeletonStatTile,
  useReduceMotion,
} from '../../../components/ui';
import { elevation, fontFamily, gradients, marginColors, MarginZone, motion, palette, radius, type } from '../../../theme';
import { formatEuro, formatNumber, formatPercent, NBSP } from '../../../utils/format';

export const HERO_HEIGHT = 216;

// ─── Hero ──────────────────────────────────────────────────────────────────
export function DetailHero({
  imageUrl,
  thumbnailUrl,
  icon,
  waitingForPhoto,
  name,
}: {
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  icon: IconName;
  /** The product has a photo that is still loading (list data only). */
  waitingForPhoto: boolean;
  name: string;
}) {
  const reduce = useReduceMotion();
  const uri = imageUrl || null;
  const opacity = useSharedValue(0);
  const [failed, setFailed] = useState(false);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const showPhoto = !!uri && !failed;

  return (
    <View style={styles.hero}>
      {/* Emerald base: the placeholder, and what shows while a photo decodes. */}
      <LinearGradient {...gradients.heroBase} style={StyleSheet.absoluteFill} />
      <LinearGradient {...gradients.heroGlint} style={StyleSheet.absoluteFill} />
      <HeroRings size={360} />
      {!showPhoto ? (
        <View style={styles.heroCenter} accessible accessibilityRole="image" accessibilityLabel={`${name}, pas de photo`}>
          <View style={styles.heroIcon}>
            <Icon name={icon} size={40} color="#FFFFFF" />
          </View>
        </View>
      ) : null}
      {waitingForPhoto && !showPhoto ? (
        <Skeleton width="100%" height={HERO_HEIGHT} radius={0} color="rgba(255,255,255,0.06)" style={StyleSheet.absoluteFill} />
      ) : null}
      {showPhoto ? (
        <>
          {thumbnailUrl ? <Image source={{ uri: thumbnailUrl }} style={[StyleSheet.absoluteFill, styles.thumbUnder]} resizeMode="cover" blurRadius={Platform.OS === 'web' ? 0 : 8} /> : null}
          <Animated.View style={[StyleSheet.absoluteFill, fade]}>
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Photo de ${name}`}
              onLoad={() => {
                opacity.value = withTiming(1, { duration: reduce ? 0 : motion.duration.base, easing: motion.easing.decel });
              }}
              onError={() => setFailed(true)}
            />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

// ─── Key number tile ───────────────────────────────────────────────────────
/** Font size that keeps the value on one line in a half-width tile (web has no adjustsFontSizeToFit). */
function valueSize(text: string): number {
  const n = text.replace(/\s/g, '').length;
  if (n <= 7) return 24;
  if (n <= 9) return 21;
  return 18;
}

export function KeyTile({
  label,
  value,
  format,
  caption,
  zone,
  highlight,
  valueColor,
  icon,
  delay = 0,
  a11y,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  caption?: string;
  zone?: MarginZone;
  highlight?: boolean;
  valueColor?: string;
  icon?: IconName;
  delay?: number;
  a11y: string;
}) {
  const z = zone ? marginColors[zone] : null;
  const tinted = !!(highlight && z);
  const finalText = format(value);
  const size = valueSize(finalText);
  return (
    <View style={[styles.tile, tinted ? { backgroundColor: z!.bg, borderColor: 'transparent' } : null]} accessible accessibilityLabel={a11y}>
      <View style={styles.tileTop}>
        <Text style={[styles.tileLabel, tinted ? { color: z!.fg } : null]} numberOfLines={1}>
          {label}
        </Text>
        {icon ? <Icon name={icon} size={16} color={tinted ? z!.fg : palette.text4} /> : null}
      </View>
      <AnimatedNumber
        value={value}
        format={format}
        delay={delay}
        numberOfLines={1}
        style={[styles.tileValue, { fontSize: size, lineHeight: size + 4 }, { color: valueColor ?? (tinted ? z!.fg : palette.ink) }]}
      />
      {caption ? (
        <Text style={[styles.tileCaption, tinted ? { color: z!.fg, opacity: 0.8 } : null]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Service row ───────────────────────────────────────────────────────────
export interface ServiceFigures {
  key: string;
  label: string;
  icon: IconName;
  priceTTC: number;
  priceHT: number;
  cost: number;
  gain: number;
  gainPerContainer: number;
  perContainer: number;
  margin: number;
  primary: boolean;
}

export function ServiceRow({
  s,
  zone,
  containerNoun,
  onPress,
  last,
}: {
  s: ServiceFigures;
  zone: MarginZone;
  containerNoun: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const c = marginColors[zone];
  const doses = `${formatNumber(s.perContainer, Number.isInteger(s.perContainer) ? 0 : 1)}${NBSP}dose${s.perContainer >= 2 ? 's' : ''} par ${containerNoun}`;
  const a11y = `${s.label}${s.primary ? ', service principal' : ''}. Prix ${formatEuro(s.priceTTC)} TTC, ${formatEuro(s.priceHT)} hors taxes. Coût ${formatEuro(s.cost)}. Gain ${formatEuro(s.gain)} par dose, ${formatEuro(s.gainPerContainer)} par ${containerNoun}. Marge ${formatPercent(s.margin)}, ${c.label}.`;
  const body = (
    <>
      <View style={styles.svcTop}>
        <View style={styles.svcIcon}>
          <Icon name={s.icon} size={20} color={palette.em700} />
        </View>
        <View style={styles.svcTitles}>
          <View style={styles.svcNameRow}>
            <Text style={styles.svcName}>{s.label}</Text>
            {s.primary ? <Text style={styles.svcPrimary}>principal</Text> : null}
          </View>
          <Text style={styles.svcMeta} numberOfLines={1}>
            {doses}
          </Text>
        </View>
        <Badge value={s.margin} zone={zone} />
      </View>
      <View style={styles.strip}>
        <Figure label="Prix TTC" value={formatEuro(s.priceTTC)} caption={`${formatEuro(s.priceHT)} HT`} />
        <View style={styles.stripSep} />
        <Figure label="Coût HT" value={formatEuro(s.cost)} caption="par dose" />
        <View style={styles.stripSep} />
        <Figure label="Gain HT" value={formatEuro(s.gain, { sign: true })} valueColor={c.fg} caption="par dose" />
      </View>
      <View style={styles.svcFoot} pointerEvents="none">
        {onPress ? (
          <View style={styles.svcEdit}>
            <Icon name="create-outline" size={15} color={palette.em700} />
            <Text style={styles.svcEditText}>Changer le prix</Text>
          </View>
        ) : (
          <View />
        )}
        <Text style={styles.svcPer} numberOfLines={1}>
          <Text style={[styles.svcPerValue, { color: c.fg }]}>{formatEuro(s.gainPerContainer, { sign: true })}</Text>
          {` par ${containerNoun}`}
        </Text>
      </View>
    </>
  );
  const style = [styles.svc, !last ? styles.svcDivider : null];
  if (!onPress) {
    return (
      <View style={style} accessible accessibilityLabel={a11y}>
        {body}
      </View>
    );
  }
  return (
    <PressableScale onPress={onPress} scaleTo="card" accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint="Changer le prix de ce service" style={style}>
      {body}
    </PressableScale>
  );
}

function Figure({ label, value, caption, valueColor }: { label: string; value: string; caption?: string; valueColor?: string }) {
  return (
    <View style={styles.fig}>
      <Text style={styles.figLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.figValue, valueColor ? { color: valueColor } : null]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
      {caption ? (
        <Text style={styles.figCaption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Price history ─────────────────────────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = { manual: 'Modification', scan: 'Scan', invoice: 'Facture' };
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${d.getDate()}${NBSP}${MONTHS[d.getMonth()]}${sameYear ? '' : `${NBSP}${d.getFullYear()}`}`;
}

function Sparkline({ values, width, height = 56 }: { values: number[]; width: number; height?: number }) {
  if (values.length < 2 || width <= 0) return null;
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <SvgGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.em600} stopOpacity={0.18} />
          <Stop offset="1" stopColor={palette.em600} stopOpacity={0} />
        </SvgGradient>
      </Defs>
      <Path d={area} fill="url(#spark)" />
      <Path d={line} stroke={palette.em700} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={lx} cy={ly} r={4} fill={palette.surface} stroke={palette.em700} strokeWidth={2} />
    </Svg>
  );
}

export function PriceHistoryCard({ entries }: { entries: PriceHistoryEntry[] }) {
  const [w, setW] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // API order: newest first. Chart oldest → newest.
  const values = useMemo(() => {
    if (!entries.length) return [];
    const chrono = [...entries].reverse();
    return [chrono[0].oldPrice, ...chrono.map((e) => e.newPrice)];
  }, [entries]);
  const shown = expanded ? entries : entries.slice(0, 3);
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  return (
    <Card padding={16}>
      <View style={styles.histHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.histNow}>{formatEuro(last)}</Text>
          <Text style={styles.histSince}>
            {delta === 0 ? 'Stable' : `${formatEuro(delta, { sign: true })} depuis le ${formatShortDate(entries[entries.length - 1].changedAt)}`}
          </Text>
        </View>
        <DeltaPill delta={delta} />
      </View>
      <View style={styles.spark} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Sparkline values={values} width={w} />
      </View>
      {shown.map((e, i) => (
        <View key={e.id} style={[styles.histRow, i < shown.length - 1 || entries.length > 3 ? styles.svcDivider : null]} accessible accessibilityLabel={`${formatShortDate(e.changedAt)}, ${SOURCE_LABEL[e.source] ?? 'Modification'} : de ${formatEuro(e.oldPrice)} à ${formatEuro(e.newPrice)}`}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.histPrices} numberOfLines={1}>
              {formatEuro(e.oldPrice)}
              <Text style={styles.histArrow}>{`${NBSP}→${NBSP}`}</Text>
              {formatEuro(e.newPrice)}
            </Text>
            <Text style={styles.histMeta} numberOfLines={1}>
              {formatShortDate(e.changedAt)} · {SOURCE_LABEL[e.source] ?? 'Modification'}
            </Text>
          </View>
          <DeltaPill delta={e.newPrice - e.oldPrice} small />
        </View>
      ))}
      {entries.length > 3 ? (
        <PressableScale onPress={() => setExpanded((v) => !v)} scaleTo="chip" haptic="select" style={styles.histMore} accessibilityRole="button" accessibilityLabel={expanded ? 'Afficher moins' : `Afficher les ${entries.length} changements`}>
          <Text style={styles.histMoreText}>{expanded ? 'Afficher moins' : `Afficher les ${entries.length} changements`}</Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={palette.em700} />
        </PressableScale>
      ) : null}
    </Card>
  );
}

/** A purchase price going up is bad news for the margin (red); down is good. */
function DeltaPill({ delta, small }: { delta: number; small?: boolean }) {
  const zone: MarginZone | null = delta > 0.004 ? 'red' : delta < -0.004 ? 'green' : null;
  const c = zone ? marginColors[zone] : { fg: palette.text2, bg: palette.surface2 };
  const icon: IconName = zone === 'red' ? 'arrow-up' : zone === 'green' ? 'arrow-down' : 'remove';
  return (
    <View style={[styles.delta, small ? styles.deltaSm : null, { backgroundColor: c.bg }]}>
      <Icon name={icon} size={small ? 12 : 13} color={c.fg} />
      <Text style={[styles.deltaText, { color: c.fg }]}>{formatEuro(Math.abs(delta))}</Text>
    </View>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
export function DetailSkeleton() {
  return (
    <View>
      <Skeleton height={HERO_HEIGHT} radius={radius.xl} />
      <Skeleton height={26} width="62%" radius={8} style={{ marginTop: 20 }} />
      <Skeleton height={14} width="45%" style={{ marginTop: 12 }} />
      <View style={styles.tiles}>
        <View style={styles.tileRow}>
          <SkeletonStatTile style={{ flex: 1 }} />
          <SkeletonStatTile style={{ flex: 1 }} />
        </View>
        <View style={styles.tileRow}>
          <SkeletonStatTile style={{ flex: 1 }} />
          <SkeletonStatTile style={{ flex: 1 }} />
        </View>
      </View>
      <Skeleton height={20} width={120} radius={6} style={{ marginTop: 28 }} />
      <Skeleton height={150} radius={radius.lg} style={{ marginTop: 12 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: HERO_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: palette.em800,
    ...elevation.e2,
  },
  heroCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbUnder: { opacity: 0.9 },

  tiles: { marginTop: 20, gap: 10 },
  tileRow: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 100,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    justifyContent: 'space-between',
    ...elevation.e2,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tileLabel: { ...type.footnoteStrong, color: palette.text3, flexShrink: 1 },
  tileValue: { fontFamily: fontFamily.extrabold, letterSpacing: -0.6, fontVariant: ['tabular-nums'], marginTop: 8 },
  tileCaption: { ...type.footnote, color: palette.text3, marginTop: 2 },

  svc: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, gap: 12 },
  svcDivider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  svcTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  svcIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
  svcTitles: { flex: 1, minWidth: 0 },
  svcNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 },
  svcName: { ...type.headline, color: palette.ink },
  svcPrimary: { ...type.footnoteStrong, color: palette.em700 },
  svcMeta: { ...type.footnote, color: palette.text3, marginTop: 1 },
  strip: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: palette.surface2, borderRadius: radius.sm, paddingVertical: 10 },
  stripSep: { width: 1, backgroundColor: palette.line, marginVertical: 2 },
  fig: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  figLabel: { ...type.footnote, color: palette.text3 },
  figValue: { fontFamily: fontFamily.bold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: palette.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
  figCaption: { ...type.footnote, fontSize: 12, lineHeight: 16, color: palette.text3, marginTop: 1 },
  svcFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: -2, minHeight: 20 },
  svcEdit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  svcPer: { ...type.footnote, color: palette.text3, flexShrink: 1, textAlign: 'right' },
  svcPerValue: { fontFamily: fontFamily.bold },
  svcEditText: { ...type.footnoteStrong, color: palette.em700 },

  histHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  histNow: { ...type.numM, color: palette.ink },
  histSince: { ...type.footnote, color: palette.text3, marginTop: 2 },
  spark: { height: 56, marginTop: 12, marginBottom: 4 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  histPrices: { ...type.calloutStrong, color: palette.ink },
  histArrow: { color: palette.text4 },
  histMeta: { ...type.footnote, color: palette.text3, marginTop: 2 },
  histMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, marginBottom: -8 },
  histMoreText: { ...type.calloutStrong, color: palette.em700 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 13 },
  deltaSm: { height: 24, paddingHorizontal: 8, borderRadius: 12 },
  deltaText: { ...type.footnoteStrong },
});
