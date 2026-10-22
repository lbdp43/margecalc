/**
 * « Objectifs de marge » — the user's thresholds (objective = good margin,
 * alert = medium), in whole percents. Persisted on this device by
 * `setMarginThresholds` (AsyncStorage `margebar_margin_thresholds`), which
 * notifies every Badge, legend and tile. They are reset on sign-out
 * (AccountSection) so the next account on the device starts from 65 / 50.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DEFAULT_MARGIN_THRESHOLDS } from '@margebar/shared';
import { Button, CompositionBar, Divider, ListGroup, ListRow, MarginLegend, NumberInput, toast } from '../../../components/ui';
import { marginColors, palette, radius } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatNumber } from '../../../utils/format';
import { MarginThresholds, setMarginThresholds, useMarginThresholds } from '../../../utils/marginThresholds';
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
  const [open, setOpen] = useState(false);

  // Thresholds are whole percents. A value saved with a decimal by an earlier
  // version (55,5) is rounded once, so the rows, the legend and the colours agree.
  useEffect(() => {
    if (!Number.isInteger(thresholds.good) || !Number.isInteger(thresholds.medium)) {
      const good = Math.min(99, Math.max(2, Math.round(thresholds.good)));
      const medium = Math.max(1, Math.min(Math.round(thresholds.medium), good - 1));
      setMarginThresholds({ good, medium });
    }
  }, [thresholds.good, thresholds.medium]);

  return (
    <SettingsSection title="Objectifs de marge" index={index} footer="Enregistrés sur cet appareil. Ils colorent toutes les marges de l’app." testID="settings-margins">
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
      </ListGroup>
      <ThresholdsSheet visible={open} onClose={() => setOpen(false)} current={thresholds} />
    </SettingsSection>
  );
}

const fmt = (n: number) => formatNumber(n, 0);

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
    await setMarginThresholds(draft);
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
      subline="Enregistrés sur cet appareil."
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
