/**
 * Landing teaser of the free duties calculator (spec §4.1, mockup shot-1):
 * a real worked example — Spiritueux, 70 cl, 40 %, 11,00 € HT — computed
 * live with `calculateDroits` and the official rates (rates store, the
 * built-in 2026 barème offline). The whole card opens the calculator,
 * without an account.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calculateDroits, DEFAULT_RATES } from '@margebar/shared';
import { AnimatedNumber, Badge, Card, CompositionBar, compositionColor } from '../../../components/ui';
import { fontFamily, palette, radius, type } from '../../../theme';
import { formatEuro, formatPercent, formatVolumeCl } from '../../../utils/format';
import { useRatesStore } from '../../../store/rates.store';
import { useSystemParamsStore } from '../../../store/systemParams.store';

const EXAMPLE = { slug: 'spiritueux', volumeCl: 70, degree: 40, priceHT: 11 };

export interface DutyTeaserCardProps {
  onOpen: () => void;
  /** Delay of the count-up (ms), to follow the page entrance. */
  delay?: number;
}

export const DutyTeaserCard = React.memo(function DutyTeaserCard({ onOpen, delay = 0 }: DutyTeaserCardProps) {
  const rates = useRatesStore((s) => s.rates);
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  const { width } = useWindowDimensions();
  const twoByTwo = width < 380;

  const rate = useMemo(
    () => rates.find((r) => r.slug === EXAMPLE.slug) ?? DEFAULT_RATES.find((r) => r.slug === EXAMPLE.slug)!,
    [rates],
  );
  const result = useMemo(() => calculateDroits(rate, EXAMPLE.volumeCl, EXAMPLE.degree, EXAMPLE.priceHT), [rate]);

  const legend = [
    { key: 'achat', label: 'Achat HT', value: EXAMPLE.priceHT, dot: compositionColor('achat') },
    { key: 'accise', label: 'Accise', value: result.accise, dot: compositionColor('accise') },
    { key: 'secu', label: 'Sécu.', value: result.cotisationSS, dot: compositionColor('secu') },
    { key: 'ttc', label: 'Prix TTC', value: result.prixTTC, dot: null as string | null },
  ];

  const a11y =
    `Calculateur de droits, sans compte. Exemple : ${rate.label}, ${formatVolumeCl(EXAMPLE.volumeCl)} à ${formatPercent(EXAMPLE.degree, 0)}, ` +
    `${formatEuro(EXAMPLE.priceHT)} hors taxes, soit ${formatEuro(result.prixHTAvecDroits)} hors taxes avec ${formatEuro(result.totalDroits)} de droits. ` +
    'Ouvrir le calculateur.';

  return (
    <Card onPress={onOpen} accessibilityLabel={a11y} testID="landing-teaser">
      <View style={styles.head}>
        <View style={styles.iconTile}>
          <Ionicons name="calculator" size={22} color={palette.em700} />
        </View>
        <View style={styles.headTexts}>
          <Text style={styles.title}>Calculateur de droits</Text>
          <View style={styles.badges}>
            <Badge variant="brand" icon="shield-checkmark" label={`Tarifs ${year}`} size="sm" />
            <Text style={styles.noAccount}>Sans compte</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={palette.text4} />
      </View>

      <View style={styles.params}>
        <Param label="Catégorie" value={rate.label} compact={twoByTwo} />
        <Param label="Contenant" value={formatVolumeCl(EXAMPLE.volumeCl)} compact={twoByTwo} />
        <Param label="Degré" value={formatPercent(EXAMPLE.degree, 0)} compact={twoByTwo} />
      </View>

      <View style={styles.result}>
        <View style={styles.resultLeft}>
          <Text style={styles.resultLabel}>Prix HT avec droits</Text>
          <AnimatedNumber
            value={result.prixHTAvecDroits}
            format={(n) => formatEuro(n, { bare: true })}
            suffix={' €'}
            suffixStyle={styles.bigUnit}
            delay={delay}
            style={styles.big}
          />
        </View>
        <Badge variant="brand" label={`${formatEuro(result.totalDroits, { sign: true })} de droits`} style={styles.dutyBadge} />
      </View>

      <CompositionBar
        height={10}
        style={styles.bar}
        segments={[
          { key: 'achat', value: EXAMPLE.priceHT, label: 'Achat HT' },
          { key: 'accise', value: result.accise },
          { key: 'secu', value: result.cotisationSS, label: 'Sécurité sociale' },
        ]}
      />
      <View style={[styles.legend, twoByTwo && styles.legendWrap]}>
        {legend.map((l) => (
          <View key={l.key} style={[styles.legendItem, twoByTwo && styles.legendItemHalf]}>
            <View style={styles.legendLabelRow}>
              {l.dot ? <View style={[styles.dot, { backgroundColor: l.dot }]} /> : null}
              <Text style={styles.legendLabel} numberOfLines={1}>
                {l.label}
              </Text>
            </View>
            <Text style={styles.legendValue}>{formatEuro(l.value)}</Text>
          </View>
        ))}
      </View>

      {/* The whole card is the button: a pressable inside a pressable is a DOM error on web. */}
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Ouvrir le calculateur</Text>
        <Ionicons name="arrow-forward" size={18} color={palette.em700} />
      </View>
    </Card>
  );
});

/** Sized to its content, then the boxes share what is left (no truncation down to 360 px). */
function Param({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <View style={[styles.param, compact && styles.paramCompact]}>
      <Text style={styles.paramLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.paramValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.icon,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTexts: { flex: 1, minWidth: 0 },
  title: { ...type.headline, color: palette.ink },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  noAccount: { ...type.footnote, color: palette.text3 },

  params: { flexDirection: 'row', gap: 8, marginTop: 14 },
  param: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    height: 56,
    borderRadius: radius.icon,
    backgroundColor: palette.surface2,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  paramCompact: { paddingHorizontal: 10 },
  paramLabel: { ...type.footnote, color: palette.text3 },
  paramValue: { ...type.calloutStrong, color: palette.ink, marginTop: 1 },

  result: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 18 },
  resultLeft: { flexShrink: 1 },
  resultLabel: { ...type.footnoteStrong, color: palette.text3 },
  big: { fontFamily: fontFamily.extrabold, fontSize: 36, lineHeight: 42, letterSpacing: -1.2, color: palette.ink, fontVariant: ['tabular-nums'], marginTop: 2 },
  bigUnit: { fontFamily: fontFamily.bold, fontSize: 22, letterSpacing: -0.4, color: palette.text2 },
  dutyBadge: { marginBottom: 8 },

  bar: { marginTop: 14 },
  legend: { flexDirection: 'row', gap: 8, marginTop: 12 },
  legendWrap: { flexWrap: 'wrap', rowGap: 10 },
  legendItem: { flex: 1, minWidth: 0 },
  legendItemHalf: { flexBasis: '45%', flexGrow: 1 },
  legendLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...type.footnote, color: palette.text3, flexShrink: 1 },
  legendValue: { ...type.numS, color: palette.ink, marginTop: 2 },

  cta: {
    height: 44,
    marginTop: 16,
    borderRadius: radius.sm,
    backgroundColor: palette.em50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { ...type.buttonSm, color: palette.em700 },
});
