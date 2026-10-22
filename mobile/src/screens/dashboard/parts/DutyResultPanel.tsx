/**
 * Duties result (spec §4.5, graft 16): the answer leads, the breakdown follows.
 *
 *   emerald panel   « Prix HT avec droits »            [39 % de droits]
 *                   18,15 €  (count-up)                  11,00 + 7,15
 *                   composition bar Achat · Accise · Sécurité sociale
 *   white body      [Prix TTC · TVA 20 %] [Prix au litre HT · 70 cl]
 *                   Droits d’accise · Cotisation sécu. · Total droits
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DroitsResult, Rate } from '@margebar/shared';
import { AnimatedNumber, Badge, Card, CompositionBar, ResultGrid, ResultTile, ValueRow, fiscalRateLabel } from '../../../components/ui';
import { fontFamily, palette, type } from '../../../theme';
import { formatEuro, formatNumber, formatPercent, formatVolumeCl, NBSP } from '../../../utils/format';
import { spoken } from './dashboardData';

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

export const DutyResultPanel = React.memo(function DutyResultPanel({ result, rate, price, volumeCl, seuilSS, tvaRate, instant }: DutyResultPanelProps) {
  const share = result.prixHTAvecDroits > 0 ? (result.totalDroits / result.prixHTAvecDroits) * 100 : 0;
  const hasCotisation = rate.cotisationRate > 0 && !!rate.cotisationCond;
  const cotisationDue = result.cotisationSS > 0;
  const seuil = `${formatNumber(seuilSS)}${NBSP}%${NBSP}vol.`;
  const cotisationQualifier = !hasCotisation ? 'non applicable' : cotisationDue ? `>${NBSP}${seuil}` : `dès${NBSP}${seuil}`;
  const equation = `${formatEuro(price, { bare: true })} + ${formatEuro(result.totalDroits, { bare: true })}`;

  const panel = (
    <View>
      <View style={styles.head}>
        <Text style={styles.label}>Prix HT avec droits</Text>
        <Badge
          variant="onEmerald"
          label={`${formatPercent(share, 0)} de droits`}
          size="sm"
          accessibilityLabel={`Les droits représentent ${spoken(formatPercent(share, 0))} du prix HT`}
        />
      </View>
      <View style={styles.valueRow}>
        <AnimatedNumber
          value={result.prixHTAvecDroits}
          format={(n) => formatEuro(n, { bare: true })}
          suffix={`${NBSP}€`}
          suffixStyle={styles.unit}
          instant={instant}
          style={styles.value}
          accessibilityLabel={`Prix HT avec droits : ${spoken(formatEuro(result.prixHTAvecDroits))}`}
          testID="duty-result-value"
        />
        <Text
          style={styles.equation}
          accessibilityLabel={`${spoken(formatEuro(price))} d’achat plus ${spoken(formatEuro(result.totalDroits))} de droits`}
        >
          {equation}
        </Text>
      </View>
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
      <ResultGrid columns={2}>
        <ResultTile label="Prix TTC" value={formatEuro(result.prixTTC)} caption={`TVA ${formatPercent(tvaRate * 100, 0)}`} />
        <ResultTile label="Prix au litre HT" value={formatEuro(result.prixAuLitreHT)} caption={`avec droits · ${formatVolumeCl(volumeCl)}`} />
      </ResultGrid>
      <View style={styles.rows}>
        <ValueRow label="Droits d’accise" qualifier={fiscalRateLabel(rate)} value={formatEuro(result.accise)} />
        <ValueRow
          label="Cotisation sécu."
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { ...type.callout, color: palette.onEmerald2, flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 2 },
  value: { ...type.numHero, color: palette.onEmerald, flexShrink: 1 },
  unit: { fontFamily: fontFamily.extrabold, fontSize: 26, letterSpacing: -0.4, color: 'rgba(255,255,255,0.8)' },
  equation: { ...type.footnoteStrong, color: palette.onEmerald2, paddingBottom: 8 },
  bar: { marginTop: 14 },
  rows: { marginTop: 6 },
});
