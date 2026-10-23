/**
 * Building blocks of the product detail (D1 tokens, kit components only):
 *   PhotoHero         the product photo, whole (contain) over a blurred backdrop of its thumbnail
 *   DetailIdentity    name · category · meta; without a photo, an icon tile + « Ajouter une photo »
 *   KeyTile           key number with count-up (marge, coeff, gain/dose, gain par contenant)
 *   ServiceRow        one service: name, margin badge, Prix TTC / HT · Coût · Gain strip
 *   PriceHistoryCard  purchase-price history: latest change, sparkline, range, changes
 *   DetailSkeleton    mirrors the layout while nothing is cached
 */
import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { PriceHistoryEntry } from '../../../services/product.service';
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  Icon,
  IconName,
  keepUnits,
  PressableScale,
  Skeleton,
  SkeletonStatTile,
  useReduceMotion,
} from '../../../components/ui';
import { elevation, fontFamily, marginColors, MarginZone, motion, palette, radius, type } from '../../../theme';
import { formatEuro, formatNumber, formatPercent, NBSP } from '../../../utils/format';
import { formatServings } from '../form/pricing';

/** Photo frame height: a portrait bottle shows whole (contain) at every phone width. */
export const PHOTO_HEIGHT = 240;

/** « ≈ 23 doses », « 14 doses », « 1,5 dose »: whole servings, as the form counts them (formatServings). */
export function dosesLabel(n: number): string {
  return `${formatServings(n)}${NBSP}${n >= 2 ? 'doses' : 'dose'}`;
}

// ─── Photo hero ────────────────────────────────────────────────────────────
/**
 * The full photo (GET /api/products/:id) fades in over a blurred, veiled copy of
 * the list thumbnail, which is already cached when the detail opens: no emerald
 * flash, no crop of a portrait bottle (contain).
 */
export function PhotoHero({
  imageUrl,
  thumbnailUrl,
  name,
  pending,
}: {
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  name: string;
  /** The full photo is on its way (blur-up); false offline or after a failed load. */
  pending: boolean;
}) {
  const reduce = useReduceMotion();
  const opacity = useSharedValue(0);
  const [failed, setFailed] = useState(false);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const full = imageUrl && !failed ? imageUrl : null;
  // No full photo coming (offline copy, unreadable image): the square thumbnail stands in, whole.
  const standIn = !full && (failed || !pending) && thumbnailUrl ? thumbnailUrl : null;

  return (
    <View style={styles.photo} accessible accessibilityRole="image" accessibilityLabel={`Photo de ${name}`}>
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.backdrop} resizeMode="cover" blurRadius={18} accessibilityIgnoresInvertColors />
      ) : (
        <Skeleton width="100%" height={PHOTO_HEIGHT} radius={0} style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.veil} />
      {standIn ? <Image source={{ uri: standIn }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityIgnoresInvertColors /> : null}
      {full ? (
        <Animated.View style={[StyleSheet.absoluteFill, fade]}>
          <Image
            source={{ uri: full }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            onLoad={() => {
              opacity.value = withTiming(1, { duration: reduce ? 0 : motion.duration.base, easing: motion.easing.decel });
            }}
            onError={() => setFailed(true)}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

// ─── Identity ──────────────────────────────────────────────────────────────
export function DetailIdentity({
  name,
  categoryName,
  icon,
  meta,
  withTile,
  onAddPhoto,
  priceToReview,
  onReview,
}: {
  name: string;
  categoryName?: string | null;
  icon: IconName;
  meta: string;
  /** No photo: an icon tile leads, and « Ajouter une photo » follows the meta. */
  withTile: boolean;
  onAddPhoto?: () => void;
  /** « Prix à vérifier » (a price an invoice computed ×4): the badge, tappable when `onReview` is set. */
  priceToReview?: boolean;
  onReview?: () => void;
}) {
  // Beside the tile the column is ~270 px: past a short name, title2 keeps it to two lines.
  const long = withTile ? name.length > 16 : name.length > 42;
  const titles = (
    <>
      <Text style={[styles.name, long ? styles.nameLong : null]} accessibilityRole="header">
        {keepUnits(name)}
      </Text>
      <View style={styles.metaRow}>
        {categoryName ? <Badge variant="brand" icon={icon} label={categoryName} size="sm" /> : null}
        {priceToReview ? (
          onReview ? (
            <PressableScale
              onPress={onReview}
              scaleTo="chip"
              haptic="select"
              hitSlop={{ top: 11, bottom: 11, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Prix à vérifier : prix de vente calculé à partir du prix d’achat. Vérifier le prix"
              testID="detail-price-review"
            >
              <Badge zone="orange" icon="alert-circle-outline" label="Prix à vérifier" size="sm" noDot />
            </PressableScale>
          ) : (
            <Badge zone="orange" icon="alert-circle-outline" label="Prix à vérifier" size="sm" noDot />
          )
        ) : null}
        {meta ? (
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (!withTile) return <View>{titles}</View>;
  return (
    <View style={styles.identityRow}>
      <View style={styles.tileIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={icon} size={32} color={palette.em700} />
      </View>
      <View style={styles.identityText}>
        {titles}
        {onAddPhoto ? (
          <Button
            title="Ajouter une photo"
            icon="camera-outline"
            variant="tonal"
            size="sm"
            onPress={onAddPhoto}
            style={styles.addPhoto}
            testID="detail-add-photo"
          />
        ) : null}
      </View>
    </View>
  );
}

// ─── Editable fact row (lot 2 n° 8) ─────────────────────────────────────────
/**
 * A ValueRow that opens an editor: « Prix d’achat HT  par bouteille   32,50 € ✎ ».
 * Same metrics as the kit ValueRow (44 min, callout label, valueRow value), the
 * value in em700 with a pencil, so it reads as tappable.
 */
export function EditableValueRow({
  label,
  qualifier,
  value,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  qualifier?: string;
  value: string;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo="card"
      haptic="select"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}${qualifier ? ` ${qualifier}` : ''} : ${value}. Modifier`}
      style={[styles.editRow, styles.editRowDivider]}
      testID={testID}
    >
      <Text style={styles.editLabel} numberOfLines={2}>
        {label}
        {qualifier ? <Text style={styles.editQualifier}>{`  ${qualifier}`}</Text> : null}
      </Text>
      <View style={styles.editValueBox}>
        <Text style={styles.editValue}>{value}</Text>
        <Icon name="create-outline" size={18} color={palette.em700} />
      </View>
    </PressableScale>
  );
}

// ─── Key number tile ───────────────────────────────────────────────────────
/**
 * Width of a line of Plus Jakarta Sans (600–800) in px, from measured advance
 * widths: tabular figures 0.70 em, the rest per glyph (letters ≈ 0.62 em).
 * Slightly generous, so a value that « fits » never clips (web has no
 * adjustsFontSizeToFit).
 */
const GLYPH_EM: Record<string, number> = {
  ',': 0.39, '.': 0.39, ' ': 0.18, ' ': 0.18, ' ': 0.15, '€': 0.77, '+': 0.68, '−': 0.68, '-': 0.63, '%': 1.07, '×': 0.68, '/': 0.45, '÷': 0.68,
};
export function textWidth(text: string, size: number, letterSpacing = 0): number {
  let em = 0;
  for (const ch of text) em += ch >= '0' && ch <= '9' ? 0.7 : GLYPH_EM[ch] ?? 0.62;
  return em * size + letterSpacing * text.length;
}

/**
 * One value size for the whole tile grid: the largest (24 down to 16) at which
 * every formatted value fits a tile, so the four numbers always match.
 */
export function keyValueSize(values: string[], available: number): number {
  for (let size = 24; size > 16; size--) {
    if (values.every((v) => textWidth(v, size, TILE_TRACKING) <= available)) return size;
  }
  return 16;
}
const TILE_TRACKING = -0.6;

export function KeyTile({
  label,
  value,
  format,
  size,
  caption,
  zone,
  highlight,
  valueColor,
  icon,
  delay = 0,
  a11y,
}: {
  label: string;
  /** null: no meaningful value (shown as « — »). */
  value: number | null;
  format: (n: number) => string;
  /** From keyValueSize(): the same for every tile of the grid. */
  size: number;
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
  const valueStyle = [styles.tileValue, { fontSize: size, lineHeight: size + 4 }, { color: valueColor ?? (tinted ? z!.fg : palette.ink) }];
  return (
    <View style={[styles.tile, tinted ? { backgroundColor: z!.bg, borderColor: 'transparent' } : null]} accessible accessibilityLabel={a11y}>
      <View style={styles.tileTop}>
        <Text style={[styles.tileLabel, tinted ? { color: z!.fg } : null]} numberOfLines={1}>
          {label}
        </Text>
        {icon ? <Icon name={icon} size={16} color={tinted ? z!.fg : palette.text3} /> : null}
      </View>
      {value === null ? (
        <Text style={valueStyle} numberOfLines={1}>
          —
        </Text>
      ) : (
        <AnimatedNumber value={value} format={format} delay={delay} numberOfLines={1} style={valueStyle} />
      )}
      {caption ? (
        <Text style={[styles.tileCaption, tinted ? { color: z!.fg } : null]} numberOfLines={2}>
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
  /** Replaces « 14 doses par bouteille » (a product sold whole: « 1 bouteille de 33 cl »). */
  meta?: string;
}

export function ServiceRow({
  s,
  zone,
  containerNoun,
  contentWidth,
  onPress,
  last,
}: {
  s: ServiceFigures;
  zone: MarginZone;
  containerNoun: string;
  /** Width of the screen's content column: decides whether the three figures fit side by side. */
  contentWidth: number;
  onPress?: () => void;
  last?: boolean;
}) {
  const c = marginColors[zone];
  const figures = [
    { label: 'Prix TTC', value: formatEuro(s.priceTTC), caption: `${formatEuro(s.priceHT)} HT` },
    { label: 'Coût HT', value: formatEuro(s.cost), caption: 'par dose' },
    { label: 'Gain HT', value: formatEuro(s.gain, { sign: true }), caption: 'par dose', color: c.fg },
  ];
  // Card border 1 + row padding 14, 2 separators, figure padding 10: four-digit prices
  // (a 1 250 € cognac) would clip in three columns on a narrow phone, so they stack.
  const figWidth = (contentWidth - 2 - 28 - 2) / 3 - 20;
  const stacked = figures.some((f) => textWidth(f.value, 16, -0.2) > figWidth || textWidth(f.caption, 13) > figWidth);
  const doses = s.meta ?? `${dosesLabel(s.perContainer)} par ${containerNoun}`;
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
      <View style={[styles.strip, stacked ? styles.stripStacked : null]}>
        {figures.map((f, i) => (
          <React.Fragment key={f.label}>
            {i ? <View style={stacked ? styles.stripSepH : styles.stripSep} /> : null}
            <Figure label={f.label} value={f.value} caption={f.caption} valueColor={f.color} stacked={stacked} />
          </React.Fragment>
        ))}
      </View>
      <View style={styles.svcFoot}>
        {onPress ? (
          <View style={styles.svcEdit}>
            <Icon name="create-outline" size={15} color={palette.em700} />
            <Text style={styles.svcEditText}>Changer le prix</Text>
          </View>
        ) : (
          <View />
        )}
        <Text style={styles.svcPer} numberOfLines={2}>
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

function Figure({ label, value, caption, valueColor, stacked }: { label: string; value: string; caption?: string; valueColor?: string; stacked?: boolean }) {
  if (stacked) {
    return (
      <View style={styles.figRow}>
        <View style={styles.figRowText}>
          <Text style={styles.figLabel}>{label}</Text>
          {caption ? <Text style={styles.figCaption}>{caption}</Text> : null}
        </View>
        <Text style={[styles.figValue, styles.figRowValue, valueColor ? { color: valueColor } : null]} maxFontSizeMultiplier={1.3}>
          {value}
        </Text>
      </View>
    );
  }
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
    <Svg width={width} height={height}>
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

/** « +1,30 € », « −0,70 € » or « 0,00 € », as a pill: a purchase price going up is bad news for the margin. */
function DeltaBadge({ delta, size = 'md' }: { delta: number; size?: 'md' | 'sm' }) {
  const label = formatEuro(Math.abs(delta));
  if (delta > 0.004) return <Badge zone="red" icon="arrow-up" label={label} size={size} accessibilityLabel={`hausse de ${label}`} />;
  if (delta < -0.004) return <Badge zone="green" icon="arrow-down" label={label} size={size} accessibilityLabel={`baisse de ${label}`} />;
  return <Badge variant="neutral" icon="remove" label={label} size={size} accessibilityLabel="inchangé" />;
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
  if (!entries.length) return null;
  const shown = expanded ? entries : entries.slice(0, 3);
  const latest = entries[0];
  const now = latest.newPrice;
  // Headline the latest change (the pill), never a first-vs-last delta: a round
  // trip over several changes is not « stable ».
  const delta = latest.newPrice - latest.oldPrice;
  const since = `Depuis le ${formatShortDate(latest.changedAt)}`;
  const change = delta > 0.004 ? `en hausse de ${formatEuro(delta)}` : delta < -0.004 ? `en baisse de ${formatEuro(-delta)}` : 'inchangé';
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <Card padding={16}>
      <View style={styles.histHead} accessible accessibilityLabel={`Prix d’achat actuel ${formatEuro(now)}, ${change}, ${since.toLowerCase()}`}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.histNow}>{formatEuro(now)}</Text>
          <Text style={styles.histSince}>{since}</Text>
        </View>
        <DeltaBadge delta={delta} />
      </View>
      <View
        style={styles.spark}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Sparkline values={values} width={w} />
      </View>
      {max - min > 0.004 ? (
        <View style={styles.range} accessible accessibilityLabel={`Plus bas ${formatEuro(min)}, plus haut ${formatEuro(max)}`}>
          <Text style={styles.rangeText}>
            Plus bas <Text style={styles.rangeValue}>{formatEuro(min)}</Text>
          </Text>
          <Text style={styles.rangeText}>
            Plus haut <Text style={styles.rangeValue}>{formatEuro(max)}</Text>
          </Text>
        </View>
      ) : null}
      {shown.map((e, i) => (
        <View
          key={e.id}
          style={[styles.histRow, i < shown.length - 1 || entries.length > 3 ? styles.svcDivider : null]}
          accessible
          accessibilityLabel={`${formatShortDate(e.changedAt)}, ${SOURCE_LABEL[e.source] ?? 'Modification'} : de ${formatEuro(e.oldPrice)} à ${formatEuro(e.newPrice)}`}
        >
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
          <DeltaBadge delta={e.newPrice - e.oldPrice} size="sm" />
        </View>
      ))}
      {entries.length > 3 ? (
        <PressableScale
          onPress={() => setExpanded((v) => !v)}
          scaleTo="chip"
          haptic="select"
          style={styles.histMore}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Afficher moins' : `Afficher les ${entries.length} changements`}
        >
          <Text style={styles.histMoreText}>{expanded ? 'Afficher moins' : `Afficher les ${entries.length} changements`}</Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={palette.em700} />
        </PressableScale>
      ) : null}
    </Card>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────
/** Mirrors the no-photo layout (most products): icon tile + identity, then the four tiles and a section. */
export function DetailSkeleton() {
  return (
    <View>
      <View style={styles.identityRow}>
        <Skeleton width={72} height={72} radius={radius.lg} />
        <View style={[styles.identityText, { paddingTop: 4 }]}>
          <Skeleton height={26} width="78%" radius={8} />
          <Skeleton height={14} width="55%" style={{ marginTop: 14 }} />
          <Skeleton height={44} width={190} radius={22} style={{ marginTop: 14 }} />
        </View>
      </View>
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
  editRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10 },
  editRowDivider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  editLabel: { ...type.callout, color: palette.text2, flexShrink: 0, maxWidth: '60%' },
  editQualifier: { ...type.footnote, color: palette.text3 },
  editValueBox: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  editValue: { ...type.valueRow, color: palette.em700, textAlign: 'right' },
  photo: {
    height: PHOTO_HEIGHT,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: palette.surface2,
    borderWidth: 1,
    borderColor: palette.line,
    ...elevation.e2,
  },
  // Scaled up so the blur's soft edges stay outside the frame.
  backdrop: { ...StyleSheet.absoluteFillObject, transform: [{ scale: 1.25 }] },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.surface, opacity: 0.35 },

  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  identityText: { flex: 1, minWidth: 0 },
  tileIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: palette.em50,
    borderWidth: 1,
    borderColor: palette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...type.title1, color: palette.ink },
  nameLong: { ...type.title2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  meta: { ...type.footnote, color: palette.text3, flexShrink: 1 },
  addPhoto: { alignSelf: 'flex-start', marginTop: 14 },

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
    // Top-aligned: a caption wrapping in one tile never lowers its neighbour's value.
    justifyContent: 'flex-start',
    ...elevation.e2,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tileLabel: { ...type.footnoteStrong, color: palette.text3, flexShrink: 1 },
  tileValue: { fontFamily: fontFamily.extrabold, letterSpacing: TILE_TRACKING, fontVariant: ['tabular-nums'], marginTop: 8 },
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
  stripStacked: { flexDirection: 'column', paddingVertical: 2 },
  stripSepH: { height: 1, backgroundColor: palette.line, marginHorizontal: 12 },
  figRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  figRowText: { flexShrink: 1 },
  figRowValue: { marginTop: 0, textAlign: 'right', flexShrink: 0 },
  fig: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  // text2 on the sunken strip (text3 would be 4.4:1 there).
  figLabel: { ...type.footnote, color: palette.text2 },
  figValue: { fontFamily: fontFamily.bold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: palette.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
  figCaption: { ...type.footnote, color: palette.text2, marginTop: 1 },
  svcFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: -2, minHeight: 20, pointerEvents: 'none' },
  svcEdit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  svcPer: { ...type.footnote, color: palette.text3, flexShrink: 1, textAlign: 'right' },
  svcPerValue: { fontFamily: fontFamily.bold },
  svcEditText: { ...type.footnoteStrong, color: palette.em700 },

  histHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  histNow: { ...type.numM, color: palette.ink },
  histSince: { ...type.footnote, color: palette.text3, marginTop: 2 },
  spark: { height: 56, marginTop: 12 },
  range: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 6, marginBottom: 4 },
  rangeText: { ...type.footnote, color: palette.text3 },
  rangeValue: { ...type.footnoteStrong, color: palette.text2 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  histPrices: { ...type.calloutStrong, color: palette.ink },
  histArrow: { color: palette.text3 },
  histMeta: { ...type.footnote, color: palette.text3, marginTop: 2 },
  histMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, marginBottom: -8 },
  histMoreText: { ...type.calloutStrong, color: palette.em700 },
});
