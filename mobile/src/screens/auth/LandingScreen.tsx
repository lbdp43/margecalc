import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { useSystemParamsStore } from '../../store/systemParams.store';
import { calculateAlcoholTax, formatPrice, CONTAINER_PRESETS, parseLocaleFloat } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

type Props = NativeStackScreenProps<any, 'Landing'>;

export function LandingScreen({ navigation }: Props) {
  // Calculator state
  const [calcPriceHD, setCalcPriceHD] = useState('');
  const [calcContainer, setCalcContainer] = useState('70');
  const [calcDegree, setCalcDegree] = useState('');

  // Get tax rates from system params (may be empty if not loaded yet — that's ok)
  const droitAcciseParam = useSystemParamsStore((s) => s.params.find((x) => x.key === 'droit_accise'));
  const cotisationSecuParam = useSystemParamsStore((s) => s.params.find((x) => x.key === 'cotisation_secu'));
  const droitAccise = droitAcciseParam ? parseFloat(droitAcciseParam.value) || 0 : 1837.44;
  const cotisationSecu = cotisationSecuParam ? parseFloat(cotisationSecuParam.value) || 0 : 597.41;

  const calcTax = useMemo(() => {
    const price = parseLocaleFloat(calcPriceHD) || 0;
    const vol = parseLocaleFloat(calcContainer) || 0;
    const deg = parseLocaleFloat(calcDegree) || 0;
    const tax = calculateAlcoholTax(vol, deg, droitAccise, cotisationSecu);
    return { price, tax, total: price + tax };
  }, [calcPriceHD, calcContainer, calcDegree, droitAccise, cotisationSecu]);

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="bar-chart" size={32} color={colors.white} />
          </View>
          <Text style={styles.title}>MargeBar Pro</Text>
          <Text style={styles.subtitle}>
            Calculez vos marges, optimisez votre rentabilité
          </Text>
        </View>

        {/* ===== FREE CALCULATOR ===== */}
        <View style={styles.calcCard}>
          <View style={styles.calcHeader}>
            <Ionicons name="calculator-outline" size={20} color={colors.accent} />
            <Text style={styles.calcTitle}>Calculateur gratuit</Text>
          </View>
          <Text style={styles.calcDesc}>
            Calculez le prix HT avec droits d'accise et cotisation sécurité sociale
          </Text>

          <Text style={styles.calcLabel}>Prix d'achat HT hors droit</Text>
          <TextInput
            style={styles.calcInput}
            value={calcPriceHD}
            onChangeText={setCalcPriceHD}
            placeholder="Ex : 10,50"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.tabBarInactive}
          />

          <Text style={styles.calcLabel}>Contenant</Text>
          <View style={styles.presetRow}>
            {CONTAINER_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.volumeCl}
                style={[styles.presetChip, calcContainer === String(p.volumeCl) && styles.presetChipActive]}
                onPress={() => setCalcContainer(String(p.volumeCl))}
              >
                <Text style={[styles.presetChipText, calcContainer === String(p.volumeCl) && styles.presetChipTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.calcLabel}>Degré d'alcool (%)</Text>
          <TextInput
            style={styles.calcInput}
            value={calcDegree}
            onChangeText={setCalcDegree}
            placeholder="Ex : 40"
            keyboardType="decimal-pad"
            placeholderTextColor={colors.tabBarInactive}
          />

          {calcTax.price > 0 && (
            <View style={styles.calcResult}>
              <View style={styles.calcResultRow}>
                <Text style={styles.calcResultLabel}>Prix HT hors droit</Text>
                <Text style={styles.calcResultValue}>{formatPrice(calcTax.price)}</Text>
              </View>
              {calcTax.tax > 0 && (
                <View style={styles.calcResultRow}>
                  <Text style={styles.calcResultLabel}>Droits d'accise{calcTax.tax > 0 && parseLocaleFloat(calcDegree) >= 18 ? ' + Sécu' : ''}</Text>
                  <Text style={styles.calcResultValue}>{formatPrice(calcTax.tax)}</Text>
                </View>
              )}
              <View style={[styles.calcResultRow, styles.calcResultTotal]}>
                <Text style={styles.calcResultTotalLabel}>Prix HT (avec droits)</Text>
                <Text style={styles.calcResultTotalValue}>{formatPrice(calcTax.total)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ===== SUPPORT / SUBSCRIPTION ===== */}
        <View style={styles.supportCard}>
          <View style={styles.supportHeader}>
            <Ionicons name="heart-outline" size={22} color={colors.primary} />
            <Text style={styles.supportTitle}>Soutenez MargeBar Pro</Text>
          </View>
          <Text style={styles.supportDesc}>
            Votre abonnement permet de maintenir l'application, financer les serveurs et développer de nouvelles fonctionnalités. C'est grâce à votre soutien que MargeBar Pro reste disponible.
          </Text>
          <View style={styles.featuresRow}>
            {[
              { icon: 'save-outline', text: 'Sauvegarde de vos données' },
              { icon: 'scan-outline', text: 'Scan produits & factures' },
              { icon: 'trending-up-outline', text: 'Tableau de bord complet' },
            ].map((f, i) => (
              <View key={i} style={styles.featureMini}>
                <Ionicons name={f.icon as any} size={16} color={colors.accent} />
                <Text style={styles.featureMiniText}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* Plans */}
          <View style={styles.plansRow}>
            <View style={styles.planMini}>
              <Text style={styles.planMiniPrice}>2,50 €<Text style={styles.planMiniPeriod}>/mois</Text></Text>
            </View>
            <Text style={styles.planOr}>ou</Text>
            <View style={styles.planMini}>
              <Text style={styles.planMiniPrice}>25 €<Text style={styles.planMiniPeriod}>/an</Text></Text>
              <View style={styles.planSaveBadge}>
                <Text style={styles.planSaveText}>-17%</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ===== AUTH BUTTONS ===== */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Register')}
          activeOpacity={0.8}
        >
          <Ionicons name="heart" size={20} color={colors.white} style={{ marginRight: spacing.sm }} />
          <Text style={styles.primaryBtnText}>Créer un compte et soutenir</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.7}
        >
          <Ionicons name="log-in-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
          <Text style={styles.secondaryBtnText}>J'ai déjà un compte</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Paiement sécurisé par Stripe. Annulable à tout moment.
        </Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Calculator
  calcCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.accent,
    ...shadows.sm,
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  calcTitle: {
    ...typography.h3,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  calcDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  calcLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  calcInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  presetChip: {
    paddingHorizontal: spacing.sm + 2,
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
  },
  presetChipTextActive: {
    color: colors.textLight,
  },
  calcResult: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  calcResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  calcResultLabel: {
    ...typography.caption,
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

  // Support
  supportCard: {
    backgroundColor: colors.light,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  supportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  supportTitle: {
    ...typography.h3,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  supportDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  featuresRow: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  featureMini: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureMiniText: {
    ...typography.bodySmall,
    color: colors.text,
    marginLeft: spacing.sm,
  },
  plansRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  planMini: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    position: 'relative',
    ...shadows.sm,
  },
  planMiniPrice: {
    ...typography.h3,
    color: colors.primary,
    fontWeight: '800',
  },
  planMiniPeriod: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  planOr: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  planSaveBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.marginGreen,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  planSaveText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.white,
  },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  primaryBtnText: {
    ...typography.button,
    color: colors.white,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md - 2,
    backgroundColor: colors.cardBackground,
  },
  secondaryBtnText: {
    ...typography.button,
    color: colors.primary,
  },

  legal: {
    ...typography.caption,
    color: colors.tabBarInactive,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
