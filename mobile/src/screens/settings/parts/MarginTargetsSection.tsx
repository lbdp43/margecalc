/**
 * « Objectifs de marge » — the user's thresholds (objective = good margin,
 * alert = medium), in whole percents, and « Arrondi des prix » (0,05 · 0,10 ·
 * 0,50 €, default 0,10 €): the step the suggested prices are rounded UP to
 * (lot 1 n° 1), stored the same way (`savePriceRounding`). Saved on this device for the signed-in
 * account by `saveMarginObjectives` (store/systemParams.store), which
 * notifies every Badge, legend and tile and keeps the account's own copy:
 * they survive a sign-out and come back at the account's next sign-in, while
 * another account on the device starts from 65 / 50.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DEFAULT_MARGIN_THRESHOLDS } from '@margebar/shared';
import { Button, CompositionBar, Divider, ListGroup, ListRow, MarginLegend, NumberInput, toast } from '../../../components/ui';
import { marginColors, palette, radius } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatEuro, formatNumber, NBSP } from '../../../utils/format';
import { saveMarginObjectives, savePriceRounding } from '../../../store/systemParams.store';
import { MarginThresholds, useMarginThresholds } from '../../../utils/marginThresholds';
import { DEFAULT_PRICE_ROUNDING, PRICE_ROUNDINGS, PriceRounding, usePriceRounding } from '../../../utils/priceRounding';
import { roundUpToStep } from '../../../utils/pricing';
import { formatThreshold } from './helpers';
import { ErrorLine, SettingsSection, Sheet } from './ui';

/**
 * Red / orange / green bar, proportional to the thresholds. The ranges are
 * spelled out by the MarginLegend under it (no tick numbers: they collided
 * when two thresholds were close).
 */
function ZoneScale({ thresholds }: { thresholds: MarginThresholds }) {
  const { good, medium } = thresholds;
  return (
    <CompositionBar
      height={10}
      segments={[
        { key: 'red', value: Math.max(medium, 1), color: marginColors.red.solid, label: `À revoir sous ${formatThreshold(medium)}` },
        { key: 'orange', value: Math.max(good - medium, 1), color: marginColors.orange.solid, label: `À surveiller de ${formatThreshold(medium)} à ${formatThreshold(good)}` },
        { key: 'green', value: Math.max(100 - good, 1), color: marginColors.green.solid, label: `Bonne marge dès ${formatThreshold(good)}` },
      ]}
    />
  );
}

export function MarginTargetsSection({ index }: { index: number }) {
  const thresholds = useMarginThresholds();
  const rounding = usePriceRounding();
  const [open, setOpen] = useState(false);
  const [roundingOpen, setRoundingOpen] = useState(false);

  // Thresholds are whole percents. A value saved with a decimal by an earlier
  // version (55,5) is rounded once, so the rows, the legend and the colours agree.
  useEffect(() => {
    if (!Number.isInteger(thresholds.good) || !Number.isInteger(thresholds.medium)) {
      const good = Math.min(99, Math.max(2, Math.round(thresholds.good)));
      const medium = Math.max(1, Math.min(Math.round(thresholds.medium), good - 1));
      saveMarginObjectives({ good, medium });
    }
  }, [thresholds.good, thresholds.medium]);

  return (
    <SettingsSection
      title="Objectifs de marge"
      index={index}
      footer="Enregistrés pour votre compte sur cet appareil. Les objectifs colorent toutes les marges de l’app ; l’arrondi s’applique aux prix conseillés."
      testID="settings-margins"
    >
      <ListGroup>
        <View style={styles.scaleBlock} accessible accessibilityLabel={`Bonne marge dès ${formatThreshold(thresholds.good)}, à revoir sous ${formatThreshold(thresholds.medium)}`}>
          <ZoneScale thresholds={thresholds} />
          <MarginLegend style={{ marginTop: 10 }} />
        </View>
        <Divider style={{ marginHorizontal: 12 }} />
        <ListRow
          icon="flag-outline"
          title="Objectif de marge"
          value={formatThreshold(thresholds.good)}
          onPress={() => setOpen(true)}
          accessibilityLabel={`Objectif de marge : bonne marge dès ${formatThreshold(thresholds.good)}. Modifier`}
          testID="settings-threshold-good"
        />
        <ListRow
          icon="alert-circle-outline"
          iconTone="neutral"
          title="Seuil d’alerte"
          value={formatThreshold(thresholds.medium)}
          onPress={() => setOpen(true)}
          accessibilityLabel={`Seuil d’alerte : marge à revoir sous ${formatThreshold(thresholds.medium)}. Modifier`}
          testID="settings-threshold-medium"
        />
        <ListRow
          icon="pricetags-outline"
          iconTone="neutral"
          title="Arrondi des prix"
          subtitle="Pour les prix conseillés"
          value={formatEuro(rounding)}
          onPress={() => setRoundingOpen(true)}
          accessibilityLabel={`Arrondi des prix conseillés : ${formatEuro(rounding).replace('€', 'euros')}. Modifier`}
          testID="settings-rounding"
        />
      </ListGroup>
      <ThresholdsSheet visible={open} onClose={() => setOpen(false)} current={thresholds} />
      <RoundingSheet visible={roundingOpen} onClose={() => setRoundingOpen(false)} current={rounding} />
    </SettingsSection>
  );
}

const fmt = (n: number) => formatNumber(n, 0);

/** The example price of the rounding sheet (« 13,03 € » is the objective price of the audit's Nikka). */
const EXAMPLE_PRICE = 13.03;
const ROUNDING_HINT: Record<PriceRounding, string> = {
  0.05: 'Au plus près',
  0.1: 'Par défaut',
  0.5: 'Prix ronds',
};

function RoundingSheet({ visible, onClose, current }: { visible: boolean; onClose: () => void; current: PriceRounding }) {
  const pick = (r: PriceRounding) => {
    if (r !== current) {
      savePriceRounding(r);
      toast.success(`Arrondi des prix : ${formatEuro(r)}`);
    }
    setTimeout(onClose, 120);
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Arrondi des prix"
      subline="Toujours vers le haut : jamais sous l’objectif."
      contentPadding={8}
      testID="sheet-rounding"
    >
      {PRICE_ROUNDINGS.map((r) => (
        <ListRow
          key={r}
          title={formatEuro(r)}
          subtitle={`${ROUNDING_HINT[r]} · ${formatEuro(EXAMPLE_PRICE)}${NBSP}→${NBSP}${formatEuro(roundUpToStep(EXAMPLE_PRICE, r))}`}
          right="radio"
          selected={r === current}
          onPress={() => pick(r)}
          accessibilityLabel={`${formatEuro(r).replace('€', 'euros')}${r === DEFAULT_PRICE_ROUNDING ? ', par défaut' : ''}. ${ROUNDING_HINT[r]}`}
          testID={`rounding-${r}`}
        />
      ))}
    </Sheet>
  );
}

function ThresholdsSheet({ visible, onClose, current }: { visible: boolean; onClose: () => void; current: MarginThresholds }) {
  const [good, setGood] = useState(current.good);
  const [medium, setMedium] = useState(current.medium);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setGood(Math.round(current.good));
      setMedium(Math.round(current.medium));
    }
  }, [visible, current.good, current.medium]);

  const draft = { good: Math.round(good), medium: Math.round(medium) };
  const error =
    !(draft.good >= 1 && draft.good <= 99) || !(draft.medium >= 1 && draft.medium <= 99)
      ? 'Choisissez des seuils entre 1 % et 99 %.'
      : draft.medium >= draft.good
        ? 'Le seuil d’alerte doit être inférieur à l’objectif de marge.'
        : null;
  const unchanged = draft.good === current.good && draft.medium === current.medium;
  const isDefault = draft.good === DEFAULT_MARGIN_THRESHOLDS.good && draft.medium === DEFAULT_MARGIN_THRESHOLDS.medium;

  const save = async () => {
    if (error) {
      haptics.warning();
      return;
    }
    setSaving(true);
    await saveMarginObjectives(draft);
    setSaving(false);
    haptics.success();
    onClose();
    toast.success(`Objectifs enregistrés · bonne marge dès ${formatThreshold(draft.good)}`);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Objectifs de marge"
      subline="Enregistrés pour votre compte sur cet appareil."
      footer={
        <View style={{ gap: 4 }}>
          <Button title="Enregistrer" icon="checkmark-circle" onPress={save} loading={saving} disabled={!!error || unchanged} testID="thresholds-save" />
          <Button
            title={`Rétablir ${formatThreshold(DEFAULT_MARGIN_THRESHOLDS.good)} et ${formatThreshold(DEFAULT_MARGIN_THRESHOLDS.medium)}`}
            variant="text"
            size="sm"
            icon="refresh-outline"
            disabled={isDefault}
            onPress={() => {
              setGood(DEFAULT_MARGIN_THRESHOLDS.good);
              setMedium(DEFAULT_MARGIN_THRESHOLDS.medium);
            }}
            testID="thresholds-reset"
          />
        </View>
      }
      testID="sheet-thresholds"
    >
      <View style={styles.preview}>
        <ZoneScale thresholds={error ? current : draft} />
        <MarginLegend thresholds={error ? current : draft} style={{ marginTop: 10 }} />
      </View>
      <View style={{ gap: 18, marginTop: 20 }}>
        <NumberInput
          size="large"
          label="Objectif · bonne marge à partir de"
          value={good}
          onChange={setGood}
          step={1}
          min={1}
          max={99}
          decimals={0}
          format={fmt}
          suffix="%"
          accessibilityLabel="Objectif de marge, en pour cent"
          testID="input-threshold-good"
        />
        <NumberInput
          size="large"
          label="Seuil d’alerte · à revoir en dessous de"
          value={medium}
          onChange={setMedium}
          step={1}
          min={1}
          max={99}
          decimals={0}
          format={fmt}
          suffix="%"
          accessibilityLabel="Seuil d’alerte, en pour cent"
          testID="input-threshold-medium"
        />
      </View>
      <ErrorLine message={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scaleBlock: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12 },
  preview: {
    backgroundColor: palette.surface2,
    borderRadius: radius.md,
    padding: 14,
  },
});
