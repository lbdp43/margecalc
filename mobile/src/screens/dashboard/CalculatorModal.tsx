import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { formatPrice, CONTAINER_PRESETS } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

const CALC_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

interface CalcTaxResult {
  price: number;
  tax: number;
  total: number;
}

interface CalculatorModalProps {
  visible: boolean;
  onClose: () => void;
  calcPriceHD: string;
  onChangePriceHD: (v: string) => void;
  calcContainer: string;
  onChangeContainer: (v: string) => void;
  calcDegree: string;
  onChangeDegree: (v: string) => void;
  calcTax: CalcTaxResult;
}

export const CalculatorModal = React.memo(function CalculatorModal({
  visible,
  onClose,
  calcPriceHD,
  onChangePriceHD,
  calcContainer,
  onChangeContainer,
  calcDegree,
  onChangeDegree,
  calcTax,
}: CalculatorModalProps) {
  const { width } = useWindowDimensions();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalSheet}>
          {/* Green header with decorative curves */}
          <View style={styles.modalHeaderBg}>
            <View style={styles.modalHeaderContent}>
              <View>
                <Text style={styles.modalTitle} accessibilityRole="header">Calculateur</Text>
                <Text style={styles.modalSubtitle}>Prix HT avec droits</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={CALC_HIT_SLOP}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Fermer le calculateur"
              >
                <Ionicons name="close" size={18} color={colors.textLight} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalCurves} pointerEvents="none">
              <Svg width={width} height={80} viewBox={`0 0 ${width} 80`}>
                <Path
                  d={`M-10,50 C${width * 0.15},10 ${width * 0.35},70 ${width * 0.55},30 S${width * 0.85},60 ${width + 10},20`}
                  fill="none"
                  stroke={colors.textLight}
                  strokeWidth={2}
                  opacity={0.12}
                />
                <Path
                  d={`M-10,62 C${width * 0.2},25 ${width * 0.4},75 ${width * 0.58},38 S${width * 0.88},65 ${width + 10},35`}
                  fill="none"
                  stroke={colors.textLight}
                  strokeWidth={1.2}
                  opacity={0.07}
                />
              </Svg>
            </View>
          </View>
          {/* S-curve transition */}
          <View style={styles.modalCurveTransition}>
            <Svg width={width} height={32}>
              <Path
                d={`M0,0 L0,32 C${width * 0.35},32 ${width * 0.35},0 ${width},0 Z`}
                fill={colors.primary}
              />
            </Svg>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled" bounces={false}>
            <Text style={styles.calcLabel}>Prix d'achat HT hors droit</Text>
            <TextInput
              style={styles.calcInput}
              value={calcPriceHD}
              onChangeText={onChangePriceHD}
              placeholder="Ex : 10,50"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.tabBarInactive}
              accessibilityLabel="Prix d'achat HT hors droit"
            />

            <Text style={styles.calcLabel}>Contenant (cl)</Text>
            <View style={styles.presetRow}>
              {CONTAINER_PRESETS.slice(0, 4).map((p) => (
                <TouchableOpacity
                  key={p.volumeCl}
                  style={[styles.presetChip, calcContainer === String(p.volumeCl) && styles.presetChipActive]}
                  onPress={() => onChangeContainer(String(p.volumeCl))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: calcContainer === String(p.volumeCl) }}
                  accessibilityLabel={`Contenant ${p.label}`}
                >
                  <Text style={[styles.presetChipText, calcContainer === String(p.volumeCl) && styles.presetChipTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.calcInput}
              value={calcContainer}
              onChangeText={onChangeContainer}
              placeholder="Volume en cl"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.tabBarInactive}
              accessibilityLabel="Volume du contenant en centilitres"
            />

            <Text style={styles.calcLabel}>Degré d'alcool (%)</Text>
            <TextInput
              style={styles.calcInput}
              value={calcDegree}
              onChangeText={onChangeDegree}
              placeholder="Ex : 40"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.tabBarInactive}
              accessibilityLabel="Degré d'alcool en pourcentage"
            />

            <Text style={styles.calcHint}>Applicable aux alcools de plus de 15°</Text>

            {calcTax.price > 0 && (
              <View style={styles.calcResult} accessibilityLabel={`Prix HT avec droits : ${calcTax.total.toFixed(2)} euros`}>
                <View style={styles.calcResultRow}>
                  <Text style={styles.calcResultLabel}>Prix HT hors droit</Text>
                  <Text style={styles.calcResultValue}>{formatPrice(calcTax.price)}</Text>
                </View>
                {calcTax.tax > 0 && (
                  <View style={styles.calcResultRow}>
                    <Text style={styles.calcResultLabel}>Droits d'accise + Sécu</Text>
                    <Text style={styles.calcResultValue}>{formatPrice(calcTax.tax)}</Text>
                  </View>
                )}
                <View style={[styles.calcResultRow, styles.calcResultTotal]}>
                  <Text style={styles.calcResultTotalLabel}>Prix HT (avec droits)</Text>
                  <Text style={styles.calcResultTotalValue}>{formatPrice(calcTax.total)}</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bottom decorative curves */}
          <View style={styles.modalBottomCurves} pointerEvents="none">
            <Svg width={width} height={100} viewBox={`0 0 ${width} 100`}>
              <Path
                d={`M-10,30 C${width * 0.1},80 ${width * 0.3},5 ${width * 0.5},60 S${width * 0.75},10 ${width + 10},70`}
                fill="none"
                stroke={colors.primary}
                strokeWidth={2.5}
                opacity={0.06}
              />
              <Path
                d={`M-10,42 C${width * 0.12},88 ${width * 0.32},15 ${width * 0.52},68 S${width * 0.78},18 ${width + 10},80`}
                fill="none"
                stroke={colors.primary}
                strokeWidth={1.2}
                opacity={0.04}
              />
            </Svg>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    ...shadows.lg,
  },
  modalHeaderBg: {
    backgroundColor: colors.primary,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  modalHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 1,
  },
  modalCurves: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  modalCurveTransition: {
    marginTop: -1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    ...typography.h2,
    color: colors.textLight,
  },
  modalSubtitle: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    marginBottom: spacing.md,
  },
  modalBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalBottomCurves: {
    height: 100,
    overflow: 'hidden',
  },
  calcLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  calcInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: colors.textLight,
  },
  calcHint: {
    ...typography.caption,
    color: colors.tabBarInactive,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  calcResult: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  calcResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  calcResultLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  calcResultValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  calcResultTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  calcResultTotalLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  calcResultTotalValue: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: '800',
  },
});
