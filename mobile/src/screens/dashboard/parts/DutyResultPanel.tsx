/**
 * Duties result (spec §4.5, graft 16): the answer leads, the breakdown follows.
 *
 *   emerald panel   « Prix HT avec droits »            [39 % de droits]
 *                   18,15 €  (count-up, scaled down to fit large amounts)
 *                   11,00 + 7,15
 *                   composition bar Achat · Accise · Sécurité sociale
 *   white body      [Prix TTC · TVA 20 %] [Prix au litre HT · 70 cl]
 *                   Droits d’accise · Cotisation sécu. · Total droits
 */
import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import type { DroitsResult, Rate } from '@margebar/shared';
import { AnimatedNumber, Badge, Card, CompositionBar, ResultGrid, ResultTile, ValueRow, fiscalRateLabel } from '../../../components/ui';
import { fontFamily, palette, type } from '../../../theme';
import { formatEuro, formatNumber, formatPercent, formatVolumeCl, NBSP } from '../../../utils/format';
import { spoken } from './dashboardData';
import { fitScale } from './fit';

export interface DutyResultPanelProps {
  result: DroitsResult;
  rate: Rate;
  price: number;
  volumeCl: number;
  seuilSS: number;
  tvaRate: number;
  /** Update numbers without tweening (typing). */
  instant?: boolean;
}

const VALUE = { size: type.numHero.fontSize as number, ls: type.numHero.letterSpacing as number };
const UNIT = { size: 26, ls: -0.4 };

/** « 39 % de droits », « 4,2 % de droits », « < 1 % de droits » (never « 0 % » when duties are due). */
export function dutyShareLabel(totalDroits: number, prixHTAvecDroits: number): string {
  const share = prixHTAvecDroits > 0 ? (totalDroits / prixHTAvecDroits) * 100 : 0;
  if (totalDroits > 0 && share < 1) return `<${NBSP}1${NBSP}% de droits`;
  return `${formatPercent(share, share < 10 && share > 0 ? 1 : 0)} de droits`;
}

export const DutyResultPanel = React.memo(function DutyResultPanel({ result, rate, price, volumeCl, seuilSS, tvaRate, instant }: DutyResultPanelProps) {
  const [avail, setAvail] = useState(0);
  const hasCotisation = rate.cotisationRate > 0 && !!rate.cotisationCond;
  const cotisationDue = result.cotisationSS > 0;
  const seuil = `${formatNumber(seuilSS)}${NBSP}%${NBSP}vol.`;
  const cotisationQualifier = !hasCotisation ? 'non applicable' : cotisationDue ? `>${NBSP}${seuil}` : `au-delà de ${seuil}`;
  const equation = `${formatEuro(price, { bare: true })} + ${formatEuro(result.totalDroits, { bare: true })}`;
  const shareLabel = dutyShareLabel(result.totalDroits, result.prixHTAvecDroits);
  const shareSpoken = shareLabel.replace(/^< /, 'moins de ').replace(' de droits', '');

  // Large totals (« 100 232,32 € ») shrink to the panel width instead of overflowing.
  const scale = fitScale(
    [
      [formatEuro(result.prixHTAvecDroits, { bare: true }), VALUE.size, VALUE.ls],
      [`${NBSP}€`, UNIT.size, UNIT.ls],
    ],
    avail - 2,
    0.55,
  );
  const valueSize = Math.floor(VALUE.size * scale);
  const unitSize = Math.floor(UNIT.size * scale);

  // White body (16 px padding, 4 px wider than the panel's 20): two tiles
  // side by side unless a value or caption would be cut; short row labels
  // when « Droits d’accise  1 932,42 €/hl AP  6,70 € » does not fit.
  const body = avail > 0 ? avail + 8 : 0;
  const ttc = formatEuro(result.prixTTC);
  const perLitre = formatEuro(result.prixAuLitreHT);
  const tileInner = (body - 8) / 2 - 26;
  const twoTiles = body === 0 || (fitScale([[ttc, 19, -0.4]], tileInner) === 1 && fitScale([[perLitre, 19, -0.4]], tileInner) === 1);
  const fullCaption = `avec droits · ${formatVolumeCl(volumeCl)}`;
  // The volume is also in the Contenant row: dropped first when space is short.
  const perLitreCaption = !twoTiles || body === 0 || fitScale([[fullCaption, 12]], tileInner) === 1 ? fullCaption : 'avec droits';
  const rateLabel = fiscalRateLabel(rate);
  const rowFits = (label: string, qualifier: string, value: string) =>
    body === 0 || fitScale([[label, 15], [`  ${qualifier}`, 13], [value, 16]], body - 12 - 2) === 1;
  const acciseLabel = rowFits('Droits d’accise', rateLabel, formatEuro(result.accise)) ? 'Droits d’accise' : 'Accise';
  const cotisationLabel = rowFits('Cotisation sécu.', cotisationQualifier, formatEuro(result.cotisationSS)) ? 'Cotisation sécu.' : 'Cotisation';

  const panel = (
    <View onLayout={(e: LayoutChangeEvent) => setAvail(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <Text style={styles.label}>Prix HT avec droits</Text>
        <Badge
          variant="onEmerald"
          label={shareLabel}
          size="sm"
          accessibilityLabel={`Les droits représentent ${spoken(shareSpoken)} du prix HT`}
        />
      </View>
      <AnimatedNumber
        value={result.prixHTAvecDroits}
        format={(n) => formatEuro(n, { bare: true })}
        suffix={`${NBSP}€`}
        suffixStyle={[styles.unit, scale < 1 ? { fontSize: unitSize } : null]}
        instant={instant}
        numberOfLines={1}
        // The line box keeps its 48 px, so the panel does not jump while typing.
        style={[styles.value, scale < 1 ? { fontSize: valueSize, letterSpacing: VALUE.ls * scale } : null]}
        accessibilityLabel={`Prix HT avec droits : ${spoken(formatEuro(result.prixHTAvecDroits))}`}
        testID="duty-result-value"
      />
      <Text
        style={styles.equation}
        numberOfLines={1}
        accessibilityLabel={`${spoken(formatEuro(price))} d’achat plus ${spoken(formatEuro(result.totalDroits))} de droits`}
        testID="duty-result-equation"
      >
        {equation}
      </Text>
      <CompositionBar
        surface="emerald"
        legend="labels"
        style={styles.bar}
        segments={[
          { key: 'achat', value: price, label: 'Achat' },
          { key: 'accise', value: result.accise, label: 'Accise' },
          { key: 'secu', value: result.cotisationSS, label: 'Sécurité sociale' },
        ].filter((s) => s.value > 0)}
      />
    </View>
  );

  return (
    <Card variant="emeraldPanel" panel={panel} panelStyle={styles.panel} testID="duty-result">
      <ResultGrid columns={twoTiles ? 2 : 1}>
        <ResultTile label="Prix TTC" value={ttc} caption={`TVA ${formatPercent(tvaRate * 100, 0)}`} />
        <ResultTile label="Prix au litre HT" value={perLitre} caption={perLitreCaption} />
      </ResultGrid>
      <View style={styles.rows}>
        <ValueRow label={acciseLabel} qualifier={rateLabel} value={formatEuro(result.accise)} />
        <ValueRow
          label={cotisationLabel}
          qualifier={cotisationQualifier}
          value={formatEuro(result.cotisationSS)}
          valueColor={cotisationDue ? undefined : palette.text3}
        />
        <ValueRow label="Total droits" value={formatEuro(result.totalDroits)} strong last />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  panel: { paddingTop: 16, paddingBottom: 16 },
  // On narrow panels the badge drops under the label rather than splitting it.
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 6 },
  label: { ...type.callout, color: palette.onEmerald2 },
  value: { ...type.numHero, color: palette.onEmerald, marginTop: 2 },
  unit: { fontFamily: fontFamily.extrabold, fontSize: UNIT.size, lineHeight: 30, letterSpacing: UNIT.ls, color: palette.onEmerald2 },
  equation: { ...type.footnoteStrong, color: palette.onEmerald2, marginTop: 2 },
  bar: { marginTop: 14 },
  rows: { marginTop: 6 },
});
