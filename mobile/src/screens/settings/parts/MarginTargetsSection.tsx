/**
 * « Objectifs de marge » — the user's thresholds (objective = good margin,
 * alert = medium). Persisted by `setMarginThresholds` (AsyncStorage key
 * `margebar_margin_thresholds`), which notifies every Badge, legend and tile.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_MARGIN_THRESHOLDS } from '@margebar/shared';
import {
  BottomSheet,
  Button,
  CompositionBar,
  Divider,
  ListGroup,
  ListRow,
  MarginLegend,
  NumberInput,
  toast,
} from '../../../components/ui';
import { marginColors, palette, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatNumber } from '../../../utils/format';
import { MarginThresholds, setMarginThresholds, useMarginThresholds } from '../../../utils/marginThresholds';
import { formatThreshold } from './helpers';
import { ErrorLine, SettingsSection } from './ui';

function ZoneScale({ thresholds }: { thresholds: MarginThresholds }) {
  const { good, medium } = thresholds;
  return (
    <View>
      <CompositionBar
        height={10}
        segments={[
          { key: 'red', value: Math.max(medium, 0.5), color: marginColors.red.solid, label: `À revoir sous ${formatThreshold(medium)}` },
          { key: 'orange', value: Math.max(good - medium, 0.5), color: marginColors.orange.solid, label: `À surveiller de ${formatThreshold(medium)} à ${formatThreshold(good)}` },
          { key: 'green', value: Math.max(100 - good, 0.5), color: marginColors.green.solid, label: `Bonne marge dès ${formatThreshold(good)}` },
        ]}
      />
      <View style={styles.scaleTicks}>
        <Text style={styles.tick}>0</Text>
        <Text style={[styles.tick, { position: 'absolute', left: `${medium}%`, transform: [{ translateX: -10 }] }]}>{formatNumber(medium, Number.isInteger(medium) ? 0 : 1)}</Text>
        <Text style={[styles.tick, { position: 'absolute', left: `${good}%`, transform: [{ translateX: -10 }] }]}>{formatNumber(good, Number.isInteger(good) ? 0 : 1)}</Text>
        <Text style={styles.tick}>{formatThreshold(100)}</Text>
      </View>
    </View>
  );
}

export function MarginTargetsSection({ index }: { index: number }) {
  const thresholds = useMarginThresholds();
  const [open, setOpen] = useState(false);
  return (
    <SettingsSection
      title="Objectifs de marge"
      index={index}
      footer="Les couleurs des marges, la légende des produits et le repère « Objectif » des curseurs suivent ces seuils."
      testID="settings-margins"
    >
      <ListGroup>
        <View style={styles.scaleBlock}>
          <ZoneScale thresholds={thresholds} />
          <MarginLegend style={{ marginTop: 12 }} />
        </View>
        <Divider style={{ marginHorizontal: 12 }} />
        <ListRow
          icon="flag-outline"
          title="Objectif de marge"
          subtitle="Bonne marge à partir de ce seuil"
          value={formatThreshold(thresholds.good)}
          onPress={() => setOpen(true)}
          testID="settings-threshold-good"
        />
        <ListRow
          icon="alert-circle-outline"
          iconTone="neutral"
          title="Seuil d’alerte"
          subtitle="En dessous, la marge est à revoir"
          value={formatThreshold(thresholds.medium)}
          onPress={() => setOpen(true)}
          testID="settings-threshold-medium"
        />
      </ListGroup>
      <ThresholdsSheet visible={open} onClose={() => setOpen(false)} current={thresholds} />
    </SettingsSection>
  );
}

function ThresholdsSheet({ visible, onClose, current }: { visible: boolean; onClose: () => void; current: MarginThresholds }) {
  const [good, setGood] = useState(current.good);
  const [medium, setMedium] = useState(current.medium);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setGood(current.good);
      setMedium(current.medium);
    }
  }, [visible, current.good, current.medium]);

  const draft = { good, medium };
  const error =
    !(good > 0 && good < 100) || !(medium > 0 && medium < 100)
      ? 'Choisissez des seuils entre 1 % et 99 %.'
      : medium >= good
        ? 'Le seuil d’alerte doit être inférieur à l’objectif de marge.'
        : null;
  const unchanged = good === current.good && medium === current.medium;
  const isDefault = good === DEFAULT_MARGIN_THRESHOLDS.good && medium === DEFAULT_MARGIN_THRESHOLDS.medium;

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
    toast.success(`Objectifs enregistrés · bonne marge dès ${formatThreshold(good)}`);
  };

  const fmt = (n: number) => formatNumber(n, Number.isInteger(n) ? 0 : 1);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Objectifs de marge"
      subline="Les couleurs suivent ces seuils dans toute l’app."
      footer={
        <View style={{ gap: 4 }}>
          <Button title="Enregistrer" icon="checkmark-circle" onPress={save} loading={saving} disabled={!!error || unchanged} testID="thresholds-save" />
          <Button
            title={`Rétablir ${formatThreshold(DEFAULT_MARGIN_THRESHOLDS.good)} et ${formatThreshold(DEFAULT_MARGIN_THRESHOLDS.medium)}`}
            variant="text"
            size="sm"
            disabled={isDefault}
            onPress={() => {
              setGood(DEFAULT_MARGIN_THRESHOLDS.good);
              setMedium(DEFAULT_MARGIN_THRESHOLDS.medium);
            }}
          />
        </View>
      }
      testID="sheet-thresholds"
    >
      <View style={styles.preview}>
        <ZoneScale thresholds={error ? current : draft} />
        <MarginLegend thresholds={error ? current : draft} style={{ marginTop: 12 }} />
      </View>
      <View style={{ gap: 20, marginTop: 20 }}>
        <View>
          <NumberInput
            label="Objectif · bonne marge à partir de"
            value={good}
            onChange={setGood}
            step={1}
            min={1}
            max={99}
            decimals={1}
            format={fmt}
            suffix="%"
            accessibilityLabel="Objectif de marge, en pour cent"
            testID="input-threshold-good"
          />
        </View>
        <View>
          <NumberInput
            label="Seuil d’alerte · à revoir en dessous de"
            value={medium}
            onChange={setMedium}
            step={1}
            min={1}
            max={99}
            decimals={1}
            format={fmt}
            suffix="%"
            accessibilityLabel="Seuil d’alerte, en pour cent"
            testID="input-threshold-medium"
          />
        </View>
      </View>
      <ErrorLine message={error} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scaleBlock: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 14 },
  scaleTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, height: 16 },
  tick: { ...type.footnote, fontSize: 12, lineHeight: 16, color: palette.text3 },
  preview: {
    backgroundColor: palette.surface2,
    borderRadius: 16,
    padding: 14,
  },
});
