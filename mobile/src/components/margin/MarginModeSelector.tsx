import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MarginMode } from '@margebar/shared';
import { colors, spacing, borderRadius, typography } from '../../theme';

const MODES = [
  { value: MarginMode.FIX_SELLING_PRICE, label: 'Prix de vente' },
  { value: MarginMode.FIX_TARGET_MARGIN, label: 'Marge cible' },
  { value: MarginMode.FIX_COEFFICIENT, label: 'Coefficient' },
] as const;

interface MarginModeSelectorProps {
  value: MarginMode;
  onChange: (mode: MarginMode) => void;
}

export function MarginModeSelector({ value, onChange }: MarginModeSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Mode de calcul</Text>
      <View style={styles.segmentContainer}>
        {MODES.map((mode) => (
          <TouchableOpacity
            key={mode.value}
            style={[styles.segment, value === mode.value && styles.segmentActive]}
            onPress={() => onChange(mode.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, value === mode.value && styles.segmentTextActive]}>
              {mode.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderRadius: borderRadius.sm - 2,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textLight,
  },
});
