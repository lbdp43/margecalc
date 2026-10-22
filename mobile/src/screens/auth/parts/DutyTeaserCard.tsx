/**
 * Landing teaser of the free duties calculator (spec §4.1, mockup shot-1):
 * a real worked example — Spiritueux, 70 cl, 40 %, 11,00 € HT — computed
 * live with `calculateDroits` and the official rates (rates store, the
 * built-in 2026 barème offline). The whole card opens the calculator,
 * without an account.
 *
 * The result is drawn as the calculator's own emerald panel (same gradient,
 * white count-up, « 39 % de droits », « 11,00 + 7,15 », the on-emerald
 * composition mapping where Sécu. is lime), so the teaser previews exactly
 * the screen it opens.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { calculateDroits, DEFAULT_RATES } from '@margebar/shared';
import { AnimatedNumber, Badge, Card, CompositionBar, compositionColor, ValueRow } from '../../../components/ui';
import { fontFamily, gradients, palette, radius, type } from '../../../theme';
import { formatEuro, formatPercent, formatVolumeCl, NBSP } from '../../../utils/format';
import { useRatesStore } from '../../../store/rates.store';
import { useSystemParamsStore } from '../../../store/systemParams.store';

const EXAMPLE = { slug: 'spiritueux', volumeCl: 70, degree: 40, priceHT: 11, tva: 0.2 };

export interface DutyTeaserCardProps {
  onOpen: () => void;
  /** Delay of the count-up (ms), to follow the page entrance. */
  delay?: number;
}

export const DutyTeaserCard = React.memo(function DutyTeaserCard({ onOpen, delay = 0 }: DutyTeaserCardProps) {
  const rates = useRatesStore((s) => s.rates);
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');

  const rate = useMemo(
    () => rates.find((r) => r.slug === EXAMPLE.slug) ?? DEFAULT_RATES.find((r) => r.slug === EXAMPLE.slug)!,
    [rates],
  );
  const result = useMemo(() => calculateDroits(rate, EXAMPLE.volumeCl, EXAMPLE.degree, EXAMPLE.priceHT, EXAMPLE.tva), [rate]);
  const share = result.prixHTAvecDroits > 0 ? (result.totalDroits / result.prixHTAvecDroits) * 100 : 0;
  const shareLabel = `${formatPercent(share, 0)} de droits`;
  const equation = `${formatEuro(EXAMPLE.priceHT, { bare: true })} + ${formatEuro(result.totalDroits, { bare: true })}`;

  const parts = [
    { key: 'achat', label: 'Achat', value: EXAMPLE.priceHT },
    { key: 'accise', label: 'Accise', value: result.accise },
    { key: 'secu', label: 'Sécu.', value: result.cotisationSS },
  ];

  const a11y =
    `Calculateur de droits, sans compte. Exemple : ${rate.label}, ${formatVolumeCl(EXAMPLE.volumeCl)} à ${formatPercent(EXAMPLE.degree, 0)}, ` +
    `${formatEuro(EXAMPLE.priceHT)} hors taxes, soit ${formatEuro(result.prixHTAvecDroits)} hors taxes avec ${formatEuro(result.totalDroits)} de droits, ` +
    `${formatEuro(result.prixTTC)} TTC. Ouvrir le calculateur.`;

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
        <Param label="Catégorie" value={rate.label} />
        <Param label="Contenant" value={formatVolumeCl(EXAMPLE.volumeCl)} />
        <Param label="Degré" value={formatPercent(EXAMPLE.degree, 0)} />
      </View>

      {/* The calculator's result panel, in miniature. */}
      <View style={styles.panel} testID="landing-teaser-panel">
        <LinearGradient {...gradients.resultCard} style={StyleSheet.absoluteFill} />
        <LinearGradient {...gradients.heroGlint} style={StyleSheet.absoluteFill} />
        <View style={styles.panelHead}>
          <Text style={styles.panelLabel}>Prix HT avec droits</Text>
          <Badge variant="onEmerald" label={shareLabel} size="sm" />
        </View>
        <View style={styles.valueRow}>
          <AnimatedNumber
            value={result.prixHTAvecDroits}
            format={(n) => formatEuro(n, { bare: true })}
            suffix={`${NBSP}€`}
            suffixStyle={styles.bigUnit}
            delay={delay}
            numberOfLines={1}
            style={styles.big}
          />
          <Text style={styles.equation} numberOfLines={1}>
            {equation}
          </Text>
        </View>
        <CompositionBar
          surface="emerald"
          height={8}
          style={styles.bar}
          segments={parts.map((p) => ({ key: p.key, value: p.value, label: p.key === 'secu' ? 'Sécurité sociale' : p.label }))}
        />
        <View style={styles.legend}>
          {parts.map((p) => (
            <View key={p.key} style={styles.legendItem}>
              <View style={styles.legendLabelRow}>
                <View style={[styles.dot, { backgroundColor: compositionColor(p.key, 'emerald') }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {p.label}
                </Text>
              </View>
              <Text style={styles.legendValue} numberOfLines={1}>
                {formatEuro(p.value)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <ValueRow label="Prix TTC" qualifier={`TVA ${formatPercent(EXAMPLE.tva * 100, 0)}`} value={formatEuro(result.prixTTC)} last style={styles.ttc} />

      {/* The whole card is the button: a pressable inside a pressable is a DOM error on web. */}
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Ouvrir le calculateur</Text>
        <Ionicons name="arrow-forward" size={18} color={palette.em700} />
      </View>
    </Card>
  );
});

/** Sized to its content, then the boxes share what is left (no truncation down to 360 px). */
function Param({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.param}>
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
  noAccount: { ...type.footnote, color: palette.text2 },

  params: { flexDirection: 'row', gap: 8, marginTop: 14 },
  param: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    height: 52,
    borderRadius: radius.icon,
    backgroundColor: palette.surface2,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  paramLabel: { ...type.footnote, color: palette.text2 },
  paramValue: { ...type.calloutStrong, color: palette.ink, marginTop: 1 },

  panel: {
    marginTop: 12,
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: palette.em800,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelLabel: { ...type.callout, color: palette.onEmerald2, flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 2 },
  big: { fontFamily: fontFamily.extrabold, fontSize: 38, lineHeight: 44, letterSpacing: -1.2, color: palette.onEmerald, fontVariant: ['tabular-nums'], flexShrink: 1 },
  bigUnit: { fontFamily: fontFamily.extrabold, fontSize: 22, letterSpacing: -0.4, color: palette.onEmerald2 },
  equation: { ...type.footnoteStrong, color: palette.onEmerald, marginBottom: 7 },
  bar: { marginTop: 12 },
  legend: { flexDirection: 'row', gap: 8, marginTop: 10 },
  legendItem: { flex: 1, minWidth: 0 },
  legendLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  // Full white: the legend sits on the lighter end of the gradient.
  legendLabel: { ...type.footnote, color: palette.onEmerald, flexShrink: 1 },
  legendValue: { ...type.numS, color: palette.onEmerald, marginTop: 2 },

  ttc: { marginTop: 4 },

  cta: {
    height: 44,
    marginTop: 8,
    borderRadius: radius.sm,
    backgroundColor: palette.em50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { ...type.buttonSm, color: palette.em700 },
});
