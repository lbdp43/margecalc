import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform, TextInput } from 'react-native';
import { alert, confirm } from '../../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { useAuthStore } from '../../store/auth.store';
import { useSystemParamsStore } from '../../store/systemParams.store';
import { calculateAlcoholTax, formatPrice, CONTAINER_PRESETS, parseLocaleFloat } from '@margebar/shared';
import * as subscriptionService from '../../services/subscription.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface Props {
  onDismiss?: () => void;
}

export function SubscriptionScreen({ onDismiss }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const token = useAuthStore((s) => s.token);

  // Calculator state
  const [calcPriceHD, setCalcPriceHD] = useState('');
  const [calcContainer, setCalcContainer] = useState('70');
  const [calcDegree, setCalcDegree] = useState('');

  // Get tax rates from system params
  const droitAcciseParam = useSystemParamsStore((s) => s.params.find((x) => x.key === 'droit_accise'));
  const cotisationSecuParam = useSystemParamsStore((s) => s.params.find((x) => x.key === 'cotisation_secu'));
  const droitAccise = droitAcciseParam ? parseFloat(droitAcciseParam.value) || 0 : 0;
  const cotisationSecu = cotisationSecuParam ? parseFloat(cotisationSecuParam.value) || 0 : 0;

  const calcTax = useMemo(() => {
    const price = parseLocaleFloat(calcPriceHD) || 0;
    const vol = parseLocaleFloat(calcContainer) || 0;
    const deg = parseLocaleFloat(calcDegree) || 0;
    const tax = calculateAlcoholTax(vol, deg, droitAccise, cotisationSecu);
    return { price, tax, total: price + tax };
  }, [calcPriceHD, calcContainer, calcDegree, droitAccise, cotisationSecu]);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { url } = await subscriptionService.createCheckoutSession(selectedPlan);
      if (Platform.OS === 'web') {
        (globalThis as any).location.href = url;
      } else {
        await Linking.openURL(url);
      }
    } catch {
      alert('Erreur', 'Impossible de lancer le paiement. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    confirm(
      'Mode découverte',
      'Sans abonnement, vos données ne seront pas sauvegardées. Elles seront supprimées à la prochaine ouverture de l\'application.\n\nVous pourrez vous abonner à tout moment depuis les Réglages.',
      () => {
        if (onDismiss) {
          onDismiss();
        } else if (user && token) {
          setAuth(token, { ...user, subscriptionStatus: 'none' });
        }
      },
      'Continuer quand même',
    );
  };

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
            Maîtrisez vos marges, optimisez votre rentabilité
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

          <Text style={styles.calcLabel}>Contenant (cl)</Text>
          <View style={styles.presetRow}>
            {CONTAINER_PRESETS.slice(0, 4).map((p) => (
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
        </View>

        {/* ===== SUPPORT / SUBSCRIPTION ===== */}
        <View style={styles.supportCard}>
          <View style={styles.supportHeader}>
            <Ionicons name="heart-outline" size={22} color={colors.primary} />
            <Text style={styles.supportTitle}>Soutenez MargeBar Pro</Text>
          </View>
          <Text style={styles.supportDesc}>
            Votre abonnement permet de maintenir l'application, financer les serveurs et continuer à développer de nouvelles fonctionnalités. C'est grâce à votre soutien que MargeBar Pro reste disponible pour tous les professionnels.
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
        </View>

        {/* Plan selection */}
        <View style={styles.plansRow}>
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardActive]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.7}
          >
            <View style={[styles.planRadio, selectedPlan === 'monthly' && styles.planRadioActive]} />
            <Text style={[styles.planLabel, selectedPlan === 'monthly' && styles.planLabelActive]}>Mensuel</Text>
            <Text style={[styles.planPrice, selectedPlan === 'monthly' && styles.planPriceActive]}>2,50 €</Text>
            <Text style={[styles.planPeriod, selectedPlan === 'monthly' && styles.planPeriodActive]}>/mois</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'yearly' && styles.planCardActive]}
            onPress={() => setSelectedPlan('yearly')}
            activeOpacity={0.7}
          >
            <View style={styles.planSaveBadge}>
              <Text style={styles.planSaveText}>-17%</Text>
            </View>
            <View style={[styles.planRadio, selectedPlan === 'yearly' && styles.planRadioActive]} />
            <Text style={[styles.planLabel, selectedPlan === 'yearly' && styles.planLabelActive]}>Annuel</Text>
            <Text style={[styles.planPrice, selectedPlan === 'yearly' && styles.planPriceActive]}>25 €</Text>
            <Text style={[styles.planPeriod, selectedPlan === 'yearly' && styles.planPeriodActive]}>/an</Text>
          </TouchableOpacity>
        </View>

        {/* Subscribe button */}
        <TouchableOpacity
          style={[styles.subscribeBtn, loading && styles.subscribeBtnDisabled]}
          onPress={handleSubscribe}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons name="heart" size={20} color={colors.white} style={{ marginRight: spacing.sm }} />
          <Text style={styles.subscribeBtnText}>
            {loading ? 'Redirection...' : 'Soutenir et s\'abonner'}
          </Text>
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Continuer sans abonnement</Text>
        </TouchableOpacity>
        <View style={styles.skipWarning}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.skipWarningText}>
            Le calculateur ci-dessus reste gratuit. Sans abonnement, vos données ne seront pas conservées.
          </Text>
        </View>

        <Text style={styles.legal}>
          Paiement sécurisé par Stripe. Annulable à tout moment.
        </Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingHorizontal: spacing.lg,
  },

  // Calculator card
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

  // Support card
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

  // Plans
  plansRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  planCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    position: 'relative',
    ...shadows.sm,
  },
  planCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.light,
  },
  planRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  planRadioActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  planLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  planLabelActive: {
    color: colors.primary,
  },
  planPrice: {
    ...typography.h2,
    color: colors.text,
  },
  planPriceActive: {
    color: colors.primary,
  },
  planPeriod: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  planPeriodActive: {
    color: colors.accent,
  },
  planSaveBadge: {
    position: 'absolute',
    top: -10,
    right: -6,
    backgroundColor: colors.marginGreen,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  planSaveText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.white,
    fontSize: 10,
  },

  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    ...shadows.md,
  },
  subscribeBtnDisabled: {
    opacity: 0.7,
  },
  subscribeBtnText: {
    ...typography.button,
    color: colors.white,
  },

  skipBtn: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  skipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  skipWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  skipWarningText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    flex: 1,
    lineHeight: 17,
  },

  legal: {
    ...typography.caption,
    color: colors.tabBarInactive,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
