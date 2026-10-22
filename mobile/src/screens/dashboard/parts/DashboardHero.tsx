/**
 * Tableau de bord hero (spec §3.10 + §3.7 HeroKPI): avatar + greeting +
 * business name + feedback button, then « Marge moyenne » counting up, the
 * gap to the user's objective and the distribution of the products by
 * margin zone (rentables / à surveiller / à revoir).
 *
 * States:
 * - ready: the KPI block.
 * - loading: the same block in skeleton form (same height, nothing jumps).
 * - empty (first run): a welcome block with the one lime CTA, « Scanner une
 *   bouteille », instead of an empty KPI.
 * - error / offline: « Marge moyenne – % » only; the card below the hero
 *   carries the message.
 */
import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AnimatedNumber,
  Avatar,
  Badge,
  Button,
  CompositionBar,
  FadeIn,
  HeroHeader,
  IconButton,
  PressableScale,
  Skeleton,
  dialog,
  zoneRangeLabels,
} from '../../../components/ui';
import { fontFamily, palette, type } from '../../../theme';
import { formatNumber, formatPercent, formatPoints, NBSP, plural } from '../../../utils/format';
import type { MarginThresholds } from '../../../utils/marginThresholds';
import { spoken } from './dashboardData';

export interface HeroKpi {
  avg: number;
  total: number;
  counts: { green: number; orange: number; red: number };
}

export interface DashboardHeroProps {
  greeting: string;
  businessName: string;
  thresholds: MarginThresholds;
  kpi: HeroKpi | null;
  state: 'ready' | 'loading' | 'empty' | 'error';
  onFeedback: () => void;
  /** First run: the welcome block's « Scanner une bouteille ». */
  onScan?: () => void;
  /** Bottom padding (the content below overlaps the hero by 28). */
  paddingBottom?: number;
}

const ZONE_ON_EMERALD = {
  green: palette.goodOnEmerald,
  orange: palette.warnOnEmerald,
  red: palette.badOnEmerald,
} as const;

/** Below this window width the gap pill reads « +3,4 pts vs obj. ». */
const SHORT_PILL_BELOW = 380;
/** Rendered widths of the pill (« +3,4 pts vs objectif » / « … vs obj. »), for its skeleton. */
const PILL_W = { full: 175, short: 148 };

export const DashboardHero = React.memo(function DashboardHero({
  greeting,
  businessName,
  thresholds,
  kpi,
  state,
  onFeedback,
  onScan,
  paddingBottom = 48,
}: DashboardHeroProps) {
  const { width } = useWindowDimensions();
  const gap = kpi ? kpi.avg - thresholds.good : 0;
  const ranges = zoneRangeLabels(thresholds);
  const objective = formatPercent(thresholds.good, 0);

  const explain = () => {
    dialog.alert({
      title: 'Marge moyenne',
      message: `Moyenne des marges de vos ${kpi ? plural(kpi.total, 'produit') : 'produits'}, calculées sur le prix de vente HT. Votre objectif est de ${objective} (réglable dans Réglages).`,
      icon: 'information-circle-outline',
    });
  };

  return (
    <HeroHeader paddingBottom={paddingBottom}>
      <View style={styles.topRow}>
        <Avatar name={businessName} variant="onEmerald" />
        <View style={styles.who}>
          <Text style={styles.hello}>{greeting}</Text>
          <Text style={styles.biz} numberOfLines={1} accessibilityRole="header">
            {businessName}
          </Text>
        </View>
        <IconButton icon="chatbubble-ellipses-outline" variant="light" onPress={onFeedback} accessibilityLabel="Aide & retours" />
      </View>

      {state === 'empty' ? (
        <FadeIn delay={60} style={styles.welcome} testID="dashboard-welcome">
          <Text style={styles.welcomeTitle} accessibilityRole="header">
            Ajoutez votre premier produit
          </Text>
          <Text style={styles.welcomeText}>Scannez une bouteille : votre marge moyenne s’affichera ici.</Text>
          <Button
            title="Scanner une bouteille"
            icon="scan"
            variant="lime"
            onPress={onScan}
            fullWidth
            style={styles.welcomeBtn}
            testID="dashboard-scan-first"
          />
        </FadeIn>
      ) : (
        <View style={styles.kpi}>
          <View style={styles.kpiHead}>
            <PressableScale
              onPress={explain}
              scaleTo="chip"
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Marge moyenne : en savoir plus"
              style={styles.kpiLabelRow}
            >
              <Text style={styles.kpiLabel}>Marge moyenne</Text>
              <Ionicons name="information-circle-outline" size={17} color={palette.onEmerald3} />
            </PressableScale>
            {kpi ? (
              <FadeIn delay={420} offset={4} style={styles.pillWrap}>
                <Badge
                  variant={gap >= 0 ? 'pillDark' : 'onEmerald'}
                  icon={gap >= 0 ? 'trending-up' : 'trending-down'}
                  label={`${formatPoints(gap)} ${width < SHORT_PILL_BELOW ? 'vs obj.' : 'vs objectif'}`}
                  accessibilityLabel={`${spoken(formatPoints(gap)).replace('pts', 'points')} par rapport à votre objectif de ${spoken(objective)}`}
                  style={styles.pill}
                />
              </FadeIn>
            ) : state === 'loading' ? (
              // Same footprint as the pill, so it wraps (or not) exactly like it.
              <OnEmeraldSkeleton width={width < SHORT_PILL_BELOW ? PILL_W.short : PILL_W.full} height={30} radius={15} />
            ) : null}
          </View>

          {state === 'loading' ? (
            <View style={styles.skeletonValue} accessibilityLabel="Chargement">
              <OnEmeraldSkeleton width={176} height={48} radius={12} />
            </View>
          ) : kpi ? (
            <AnimatedNumber
              value={kpi.avg}
              format={(n) => formatNumber(n, 1)}
              suffix={`${NBSP}%`}
              suffixStyle={styles.unit}
              style={styles.value}
              accessibilityLabel={`Marge moyenne ${spoken(formatPercent(kpi.avg))}`}
            />
          ) : (
            <Text style={[styles.value, styles.valueEmpty]} accessibilityLabel="Marge moyenne : indisponible pour le moment">
              –<Text style={[styles.unit, styles.unitEmpty]}>{`${NBSP}%`}</Text>
            </Text>
          )}

          {kpi ? (
            <>
              <View style={styles.dist}>
                <CompositionBar
                  surface="emerald"
                  segments={[
                    { key: 'good', value: kpi.counts.green, color: ZONE_ON_EMERALD.green, label: `${kpi.counts.green} rentables` },
                    { key: 'warn', value: kpi.counts.orange, color: ZONE_ON_EMERALD.orange, label: `${kpi.counts.orange} à surveiller` },
                    { key: 'bad', value: kpi.counts.red, color: ZONE_ON_EMERALD.red, label: `${kpi.counts.red} à revoir` },
                  ]}
                />
              </View>
              <View
                style={styles.legend}
                accessible
                accessibilityLabel={`Répartition : ${plural(kpi.counts.green, 'produit rentable', 'produits rentables')} (${spoken(ranges.green)}), ${kpi.counts.orange} à surveiller (${spoken(ranges.orange)}), ${kpi.counts.red} à revoir (${spoken(ranges.red)})`}
              >
                <LegendItem color={ZONE_ON_EMERALD.green} count={kpi.counts.green} label={kpi.counts.green > 1 ? 'rentables' : 'rentable'} />
                <LegendItem color={ZONE_ON_EMERALD.orange} count={kpi.counts.orange} label="à surveiller" />
                <LegendItem color={ZONE_ON_EMERALD.red} count={kpi.counts.red} label="à revoir" />
              </View>
            </>
          ) : state === 'loading' ? (
            <>
              <View style={styles.dist}>
                <View style={styles.track} />
              </View>
              <View style={styles.legend}>
                <OnEmeraldSkeleton width={220} height={12} />
              </View>
            </>
          ) : null}
        </View>
      )}
    </HeroHeader>
  );
});

/** A still skeleton block on the emerald hero (white at low opacity). */
function OnEmeraldSkeleton({ width, height, radius = 6 }: { width: number; height: number; radius?: number }) {
  return (
    <View style={styles.onEmeraldSkeleton}>
      <Skeleton width={width} height={height} radius={radius} color={palette.onEmerald} still />
    </View>
  );
}

function LegendItem({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>
        <Text style={styles.legendCount}>{formatNumber(count)}</Text>
        {`${NBSP}${label}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  who: { flex: 1, minWidth: 0 },
  hello: { ...type.footnote, color: palette.onEmerald2 },
  biz: { ...type.title2, color: palette.onEmerald },
  kpi: { marginTop: 20 },
  // Wraps: on narrow screens the gap pill drops under the label instead of
  // running past the gutter.
  kpiHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 8, minHeight: 30 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30 },
  kpiLabel: { ...type.callout, color: palette.onEmerald2 },
  pillWrap: { maxWidth: '100%' },
  pill: { maxWidth: '100%' },
  value: { ...type.displayXL, color: palette.onEmerald, marginTop: 4 },
  valueEmpty: { color: palette.onEmerald3 },
  // A line height under the parent's keeps the mixed-size line at exactly 60
  // (otherwise the baseline shift makes it 71 and the skeleton would not match).
  unit: { fontFamily: fontFamily.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: palette.onEmerald2 },
  unitEmpty: { color: palette.onEmerald3 },
  skeletonValue: { height: 60, marginTop: 4, justifyContent: 'center' },
  onEmeraldSkeleton: { opacity: 0.14 },
  dist: { marginTop: 16 },
  track: { height: 8, borderRadius: 4, backgroundColor: palette.onEmerald, opacity: 0.16 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10, minHeight: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.footnote, color: palette.onEmerald2 },
  legendCount: { fontFamily: fontFamily.bold, color: palette.onEmerald },
  welcome: { marginTop: 20 },
  welcomeTitle: { ...type.title2, color: palette.onEmerald },
  welcomeText: { ...type.callout, color: palette.onEmerald2, marginTop: 6 },
  welcomeBtn: { marginTop: 20 },
});
