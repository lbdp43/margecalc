/**
 * « Contenant & achat »: container chips (the user's containers + « Autre »),
 * then one card with the purchase price, the degree, the optional « prix hors
 * droits » entry (duties added from the official rates) and the TVA.
 */
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import type { CustomContainer, DroitsResult, Rate } from '@margebar/shared';
import { CONTAINER_PRESETS } from '@margebar/shared';
import {
  Card,
  ChipRow,
  ChipItem,
  ListRow,
  NumberInput,
  SegmentedControl,
  ValueRow,
  fiscalRateLabel,
} from '../../../components/ui';
import { palette, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatEuro, formatNumber, formatVolumeCl } from '../../../utils/format';
import { ControlRow, FieldError, FieldLabel } from './FieldBits';
import type { FieldErrors } from './errors';
import type { FormValues } from './model';
import { containerLabel, containerNoun, round2 } from './pricing';

const OTHER = 'other';

interface PurchaseSectionProps {
  values: FormValues;
  patch: (p: Partial<FormValues>) => void;
  errors: FieldErrors;
  containers: CustomContainer[] | undefined;
  rates: Rate[];
  duties: DroitsResult | null;
  autoEntrepreneur: boolean;
  onOpenFiscal: () => void;
}

const TVA_CHOICES = [0.2, 0.1, 0.055];

const tvaText = (t: number) => `${formatNumber(round2(t * 100), Number.isInteger(round2(t * 100)) ? 0 : 1)}${' '}%`;

export function PurchaseSection({ values, patch, errors, containers, rates, duties, autoEntrepreneur, onOpenFiscal }: PurchaseSectionProps) {
  const list = useMemo(() => {
    const src = containers && containers.length ? containers.map((c) => ({ name: c.name, volumeCl: c.volumeCl })) : CONTAINER_PRESETS.map((c) => ({ name: c.label, volumeCl: c.volumeCl }));
    const seen = new Set<number>();
    return src
      .filter((c) => c.volumeCl > 0 && !seen.has(c.volumeCl) && seen.add(c.volumeCl))
      .sort((a, b) => a.volumeCl - b.volumeCl);
  }, [containers]);

  const cl = values.containerCl ?? 0;
  const match = list.find((c) => Math.abs(c.volumeCl - cl) < 0.001);
  const showOther = values.containerOther || (!match && cl > 0);
  const selectedKey = showOther ? OTHER : match ? String(match.volumeCl) : null;

  const items: ChipItem[] = useMemo(
    () => [
      ...list.map((c) => ({ key: String(c.volumeCl), label: containerLabel(c.name, c.volumeCl) })),
      { key: OTHER, label: 'Autre', icon: 'create-outline' as const },
    ],
    [list],
  );

  const rate = rates.find((r) => r.slug === values.fiscalSlug);
  const noun = containerNoun(cl || 70);

  const tvaOptions = useMemo(() => {
    const opts = TVA_CHOICES.slice();
    if (!opts.some((t) => Math.abs(t - values.tvaRate) < 1e-6)) opts.push(values.tvaRate);
    return opts.map((t) => ({ key: String(t), label: tvaText(t), accessibilityLabel: `TVA ${tvaText(t)}` }));
  }, [values.tvaRate]);

  return (
    <View>
      <FieldLabel label="Contenant" meta={cl > 0 ? `${noun} de ${formatVolumeCl(cl)}` : null} error={!!errors.container} />
      <ChipRow
        items={items}
        selectedKey={selectedKey}
        onSelect={(k) => {
          if (k === OTHER) patch({ containerOther: true });
          else patch({ containerOther: false, containerCl: Number(k) });
        }}
        accessibilityLabel="Contenant"
      />
      {showOther ? (
        <Card variant="flat" noPadding style={styles.otherCard}>
          <ControlRow title="Contenance" caption="en centilitres" divider={false}>
            <NumberInput
              value={values.containerCl}
              onChange={(n) => patch({ containerCl: n })}
              step={1}
              min={1}
              max={100000}
              decimals={1}
              format={(n) => formatVolumeCl(n)}
              suffix="cl"
              placeholder="70"
              accessibilityLabel="Contenance en centilitres"
              testID="field-container"
            />
          </ControlRow>
        </Card>
      ) : null}
      <FieldError message={errors.container} />

      <Card noPadding style={styles.card}>
        <ControlRow
          title="Prix d’achat HT"
          caption={values.horsDroits ? `hors droits · par ${noun}` : `droits inclus · par ${noun}`}
          error={errors.purchase}
          testID="row-purchase"
        >
          <NumberInput
            value={values.purchase}
            onChange={(n) => patch({ purchase: n })}
            step={0.1}
            min={0}
            max={100000}
            decimals={2}
            format={(n) => formatEuro(n)}
            suffix="€"
            placeholder="0,00 €"
            accessibilityLabel="Prix d’achat HT"
            testID="field-purchase"
          />
        </ControlRow>

        <ControlRow title="Degré d’alcool" caption="% vol. · facultatif" error={errors.degree} testID="row-degree">
          <NumberInput
            value={values.degree}
            onChange={(n) => patch({ degree: n })}
            step={0.5}
            min={0}
            max={100}
            decimals={1}
            format={(n) => `${formatNumber(n, Number.isInteger(n) ? 0 : 1)}${' '}%`}
            suffix="%"
            placeholder="0 %"
            accessibilityLabel="Degré d’alcool"
            testID="field-degree"
          />
        </ControlRow>

        <View style={[styles.switchRow, styles.divider]}>
          <View style={styles.flex}>
            <Text style={styles.rowTitle}>Prix hors droits</Text>
            <Text style={styles.rowCaption}>Ajouter l’accise et la sécurité sociale</Text>
          </View>
          <Switch
            value={values.horsDroits}
            onValueChange={(v) => {
              haptics.select();
              patch({ horsDroits: v });
            }}
            trackColor={{ false: palette.surface3, true: palette.em600 }}
            thumbColor="#FFFFFF"
            {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as any) : null)}
            accessibilityLabel="Prix d’achat hors droits"
            testID="switch-hors-droits"
          />
        </View>

        {values.horsDroits ? (
          <View style={[styles.duties, styles.divider]}>
            <ListRow
              icon="shield-checkmark-outline"
              title={rate?.label ?? 'Catégorie fiscale'}
              subtitle={rate ? `Catégorie fiscale · ${fiscalRateLabel(rate)}` : 'Choisissez la catégorie fiscale'}
              subtitleLines={2}
              onPress={onOpenFiscal}
              style={styles.fiscalRow}
              accessibilityLabel={`Catégorie fiscale : ${rate?.label ?? 'à choisir'}`}
            />
            {duties ? (
              <View style={styles.dutyValues}>
                <ValueRow label="Droits (accise + sécu.)" value={`+${formatEuro(duties.totalDroits)}`} />
                <ValueRow label="Prix d’achat avec droits" value={formatEuro(duties.prixHTAvecDroits)} strong last />
              </View>
            ) : null}
          </View>
        ) : null}

        {autoEntrepreneur ? (
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>TVA</Text>
              <Text style={styles.rowCaption}>Auto-entrepreneur : prix sans TVA</Text>
            </View>
          </View>
        ) : (
          <View style={styles.tvaRow}>
            <View style={styles.tvaTexts}>
              <Text style={styles.rowTitle}>TVA</Text>
              <Text style={styles.rowCaption}>sur la vente</Text>
            </View>
            <SegmentedControl
              options={tvaOptions}
              value={String(values.tvaRate)}
              onChange={(k) => patch({ tvaRate: Number(k) })}
              accessibilityLabel="Taux de TVA"
              style={styles.tvaSeg}
            />
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { marginTop: 16 },
  otherCard: { marginTop: 10, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 20 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 60 },
  rowTitle: { ...type.calloutStrong, color: palette.ink },
  rowCaption: { ...type.footnote, color: palette.text3, marginTop: 1 },
  duties: { paddingHorizontal: 4, paddingBottom: 6 },
  fiscalRow: { paddingHorizontal: 12 },
  dutyValues: { paddingHorizontal: 12 },
  tvaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  tvaTexts: { flexGrow: 1, flexBasis: 80 },
  tvaSeg: { flexGrow: 1, flexBasis: 190, maxWidth: 240 },
});
