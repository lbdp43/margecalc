import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calculateDroits, formatPrice, CONTAINER_PRESETS, parseLocaleFloat, Rate } from '@margebar/shared';
import { useRatesStore } from '../../store/rates.store';
import { useSystemParamsStore } from '../../store/systemParams.store';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface SaveProductData {
  name: string;
  fiscalCategory: string;
  prixHTHorsDroit: number;
  volumeCl: number;
  degree: number;
  prixHTAvecDroits: number;
}

interface DroitsCalculatorProps {
  compact?: boolean;
  onSaveProduct?: (data: SaveProductData) => void;
}

export function DroitsCalculator({ compact = false, onSaveProduct }: DroitsCalculatorProps) {
  const rates = useRatesStore((s) => s.rates);
  const tarifAnnee = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  const lienReference = useSystemParamsStore((s) => s.params.find((p) => p.key === 'lien_reference')?.value || '');
  const seuilSS = useSystemParamsStore((s) => {
    const p = s.params.find((x) => x.key === 'seuil_cotisation_ss');
    return p ? parseFloat(p.value) || 18 : 18;
  });

  const [selectedSlug, setSelectedSlug] = useState('spiritueux');
  const [prixHD, setPrixHD] = useState('');
  const [container, setContainer] = useState('70');
  const [degree, setDegree] = useState('');
  const [productName, setProductName] = useState('');

  const selectedRate = useMemo(
    () => rates.find((r) => r.slug === selectedSlug),
    [rates, selectedSlug],
  );

  const result = useMemo(() => {
    if (!selectedRate) return null;
    const prix = parseLocaleFloat(prixHD) || 0;
    const vol = parseLocaleFloat(container) || 0;
    const deg = parseLocaleFloat(degree) || 0;
    if (prix <= 0 || vol <= 0) return null;
    return calculateDroits(selectedRate, vol, deg, prix, 0.20, seuilSS);
  }, [selectedRate, prixHD, container, degree, seuilSS]);

  const isTypeA = selectedRate?.calcType === 'A';

  const handleOpenReference = () => {
    if (lienReference) {
      if (Platform.OS === 'web') {
        window.open(lienReference, '_blank');
      } else {
        Linking.openURL(lienReference);
      }
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="calculator-outline" size={20} color={colors.accent} />
        <Text style={styles.title}>Calculateur de droits</Text>
        <Text style={styles.yearBadge}>Tarifs {tarifAnnee}</Text>
      </View>

      {/* Category selector */}
      <Text style={styles.label}>Categorie fiscale</Text>
      <View style={styles.categoryGrid}>
        {rates.map((r) => (
          <TouchableOpacity
            key={r.slug}
            style={[styles.categoryChip, selectedSlug === r.slug && styles.categoryChipActive]}
            onPress={() => setSelectedSlug(r.slug)}
          >
            <Text style={[styles.categoryChipText, selectedSlug === r.slug && styles.categoryChipTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {selectedRate?.examples && (
        <Text style={styles.examples}>{selectedRate.examples}</Text>
      )}

      {/* Price input */}
      <Text style={styles.label}>Prix d'achat HT hors droit</Text>
      <TextInput
        style={styles.input}
        value={prixHD}
        onChangeText={setPrixHD}
        placeholder="Ex : 10,50"
        keyboardType="decimal-pad"
        placeholderTextColor={colors.tabBarInactive}
      />

      {/* Container */}
      <Text style={styles.label}>Contenant</Text>
      <View style={styles.presetRow}>
        {CONTAINER_PRESETS.map((p) => (
          <TouchableOpacity
            key={p.volumeCl}
            style={[styles.presetChip, container === String(p.volumeCl) && styles.presetChipActive]}
            onPress={() => setContainer(String(p.volumeCl))}
          >
            <Text style={[styles.presetChipText, container === String(p.volumeCl) && styles.presetChipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Degree */}
      <Text style={styles.label}>Degre d'alcool (% vol.)</Text>
      <TextInput
        style={styles.input}
        value={degree}
        onChangeText={setDegree}
        placeholder="Ex : 40"
        keyboardType="decimal-pad"
        placeholderTextColor={colors.tabBarInactive}
      />
      {isTypeA && (
        <Text style={styles.hint}>Le degre n'impacte pas l'accise pour cette categorie</Text>
      )}

      {/* Results */}
      {result && result.totalDroits >= 0 && parseLocaleFloat(prixHD) > 0 && (
        <View style={styles.result}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Prix HT hors droit</Text>
            <Text style={styles.resultValue}>{formatPrice(parseLocaleFloat(prixHD) || 0)}</Text>
          </View>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Droits d'accise</Text>
            <Text style={styles.resultValue}>{formatPrice(result.accise)}</Text>
          </View>
          {result.cotisationSS > 0 ? (
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Cotisation secu. sociale</Text>
              <Text style={styles.resultValue}>{formatPrice(result.cotisationSS)}</Text>
            </View>
          ) : (
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Cotisation secu. sociale</Text>
              <Text style={[styles.resultValue, { color: colors.textSecondary }]}>Non applicable</Text>
            </View>
          )}
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Total droits</Text>
            <Text style={[styles.resultValue, { fontWeight: '700' }]}>{formatPrice(result.totalDroits)}</Text>
          </View>
          <View style={[styles.resultRow, styles.resultTotal]}>
            <Text style={styles.resultTotalLabel}>Prix HT (avec droits)</Text>
            <Text style={styles.resultTotalValue}>{formatPrice(result.prixHTAvecDroits)}</Text>
          </View>
          {!compact && (
            <>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Prix TTC (20%)</Text>
                <Text style={styles.resultValue}>{formatPrice(result.prixTTC)}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Prix au litre HT</Text>
                <Text style={styles.resultValue}>{formatPrice(result.prixAuLitreHT)}</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Save as product (only in dashboard context) */}
      {onSaveProduct && result && parseLocaleFloat(prixHD) > 0 && (
        <View style={styles.saveSection}>
          <Text style={styles.label}>Nom du produit</Text>
          <TextInput
            style={styles.input}
            value={productName}
            onChangeText={setProductName}
            placeholder="Ex : Whisky Jameson 70cl"
            placeholderTextColor={colors.tabBarInactive}
          />
          <TouchableOpacity
            style={[styles.saveBtn, !productName.trim() && styles.saveBtnDisabled]}
            onPress={() => {
              if (!productName.trim()) return;
              onSaveProduct({
                name: productName.trim(),
                fiscalCategory: selectedSlug,
                prixHTHorsDroit: parseLocaleFloat(prixHD) || 0,
                volumeCl: parseLocaleFloat(container) || 0,
                degree: parseLocaleFloat(degree) || 0,
                prixHTAvecDroits: result.prixHTAvecDroits,
              });
              setProductName('');
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="save-outline" size={18} color={colors.textLight} style={{ marginRight: spacing.xs }} />
            <Text style={styles.saveBtnText}>Enregistrer comme produit</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reference link */}
      {lienReference ? (
        <TouchableOpacity style={styles.refLink} onPress={handleOpenReference}>
          <Ionicons name="open-outline" size={14} color={colors.accent} />
          <Text style={styles.refLinkText}>Source : Service Public - Taxation des boissons</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.accent,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    marginLeft: spacing.sm,
    flex: 1,
  },
  yearBadge: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    backgroundColor: colors.light,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    ...typography.caption,
    color: colors.tabBarInactive,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  examples: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },

  // Category selector
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 11,
  },
  categoryChipTextActive: {
    color: colors.textLight,
  },

  // Container presets
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  presetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
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
    fontSize: 11,
  },
  presetChipTextActive: {
    color: colors.textLight,
  },

  // Results
  result: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  resultLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  resultValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  resultTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
  },
  resultTotalLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '700',
  },
  resultTotalValue: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: '800',
  },

  // Save product
  saveSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textLight,
  },

  // Reference link
  refLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  refLinkText: {
    ...typography.caption,
    color: colors.accent,
    marginLeft: spacing.xs,
    textDecorationLine: 'underline',
  },
});
