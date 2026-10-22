/**
 * Tableau de bord hero (spec §3.10 + §3.7 HeroKPI): avatar + greeting +
 * business name + feedback button, then « Marge moyenne » counting up, the
 * gap to the user's objective and the distribution of the products by
 * margin zone (rentables / à surveiller / à revoir).
 *
 * `kpi` is null while loading (skeleton blocks) and for an empty or failed
 * account (calm placeholder, same height so nothing jumps).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AnimatedNumber,
  Avatar,
  Badge,
  CompositionBar,
  FadeIn,
  HeroHeader,
  IconButton,
  PressableScale,
  Skeleton,
  dialog,
} from '../../../components/ui';
import { fontFamily, palette, type } from '../../../theme';
import { formatNumber, formatPercent, formatPoints, NBSP, plural } from '../../../utils/format';
import { zoneRangeLabels } from '../../../components/ui';
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
  /** 'loading' shows skeleton blocks; 'empty' / 'error' a calm placeholder. */
  state: 'ready' | 'loading' | 'empty' | 'error';
  onFeedback: () => void;
  /** Bottom padding (tiles overlap the hero by 28). */
  paddingBottom?: number;
}

const ZONE_ON_EMERALD = {
  green: palette.goodOnEmerald,
  orange: palette.warnOnEmerald,
  red: palette.badOnEmerald,
} as const;

export const DashboardHero = React.memo(function DashboardHero({
  greeting,
  businessName,
  thresholds,
  kpi,
  state,
  onFeedback,
  paddingBottom = 48,
}: DashboardHeroProps) {
  const gap = kpi ? kpi.avg - thresholds.good : 0;
  const ranges = zoneRangeLabels(thresholds);

  const explain = () => {
    dialog.alert({
      title: 'Marge moyenne',
      message: kpi
        ? `Moyenne des marges de vos ${plural(kpi.total, 'produit')}, calculées sur le prix de vente HT. Votre objectif est de ${formatPercent(thresholds.good, 0)} (réglable dans Réglages).`
        : `Moyenne des marges de vos produits, calculées sur le prix de vente HT. Votre objectif est de ${formatPercent(thresholds.good, 0)} (réglable dans Réglages).`,
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
            <FadeIn delay={420} offset={4}>
              <Badge
                variant={gap >= 0 ? 'pillDark' : 'onEmerald'}
                icon={gap >= 0 ? 'trending-up' : 'trending-down'}
                label={`${formatPoints(gap)} vs objectif`}
                accessibilityLabel={`${spoken(formatPoints(gap)).replace('pts', 'points')} par rapport à votre objectif de ${spoken(formatPercent(thresholds.good, 0))}`}
              />
            </FadeIn>
          ) : null}
        </View>

        {state === 'loading' ? (
          <View style={styles.skeletonValue} accessibilityLabel="Chargement">
            <Skeleton width={176} height={48} radius={12} color="rgba(255,255,255,0.14)" still />
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
          <Text style={[styles.value, styles.valueEmpty]} accessibilityLabel="Marge moyenne : pas encore de produit">
            –<Text style={[styles.unit, { color: palette.onEmerald3 }]}>{`${NBSP}%`}</Text>
          </Text>
        )}

        <View style={styles.dist}>
          {kpi ? (
            <CompositionBar
              surface="emerald"
              segments={[
                { key: 'good', value: kpi.counts.green, color: ZONE_ON_EMERALD.green, label: `${kpi.counts.green} rentables` },
                { key: 'warn', value: kpi.counts.orange, color: ZONE_ON_EMERALD.orange, label: `${kpi.counts.orange} à surveiller` },
                { key: 'bad', value: kpi.counts.red, color: ZONE_ON_EMERALD.red, label: `${kpi.counts.red} à revoir` },
              ]}
            />
          ) : (
            <View style={styles.track} />
          )}
        </View>

        {kpi ? (
          <View
            style={styles.legend}
            accessible
            accessibilityLabel={`Répartition : ${plural(kpi.counts.green, 'produit rentable', 'produits rentables')} (${ranges.green}), ${kpi.counts.orange} à surveiller (${ranges.orange}), ${kpi.counts.red} à revoir (${ranges.red})`}
          >
            <LegendItem color={ZONE_ON_EMERALD.green} count={kpi.counts.green} label={kpi.counts.green > 1 ? 'rentables' : 'rentable'} />
            <LegendItem color={ZONE_ON_EMERALD.orange} count={kpi.counts.orange} label="à surveiller" />
            <LegendItem color={ZONE_ON_EMERALD.red} count={kpi.counts.red} label="à revoir" />
          </View>
        ) : state === 'loading' ? (
          <View style={styles.legend}>
            <Skeleton width={220} height={12} color="rgba(255,255,255,0.14)" still />
          </View>
        ) : (
          <Text style={styles.placeholder}>
            {state === 'error'
              ? 'Vos chiffres s’afficheront dès que vos produits seront chargés.'
              : 'Ajoutez un produit : votre marge moyenne et sa répartition s’afficheront ici.'}
          </Text>
        )}
      </View>
    </HeroHeader>
  );
});

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
  kpiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 30 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30 },
  kpiLabel: { ...type.callout, color: palette.onEmerald2 },
  value: { ...type.displayXL, color: palette.onEmerald, marginTop: 4 },
  valueEmpty: { color: palette.onEmerald3 },
  unit: { fontFamily: fontFamily.extrabold, fontSize: 30, letterSpacing: -0.6, color: 'rgba(255,255,255,0.82)' },
  skeletonValue: { height: 60, marginTop: 4, justifyContent: 'center' },
  dist: { marginTop: 16 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.16)' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10, minHeight: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { ...type.footnote, color: palette.onEmerald2 },
  legendCount: { fontFamily: fontFamily.bold, color: palette.onEmerald },
  placeholder: { ...type.footnote, color: palette.onEmerald2, marginTop: 10 },
});
