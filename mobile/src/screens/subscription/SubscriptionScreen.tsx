import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { alert } from '../../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { useAuthStore } from '../../store/auth.store';
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
    if (onDismiss) {
      onDismiss();
    } else if (user && token) {
      setAuth(token, { ...user, subscriptionStatus: 'none' });
    }
  };

  const features = [
    { icon: 'calculator-outline', text: 'Calcul de marges illimité' },
    { icon: 'scan-outline', text: 'Scan de produits & factures' },
    { icon: 'trending-up-outline', text: 'Tableau de bord complet' },
    { icon: 'people-outline', text: 'Types de service personnalisés' },
    { icon: 'shield-checkmark-outline', text: 'Données 100% privées' },
  ];

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

        {/* Features list */}
        <View style={styles.featuresCard}>
          {features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={20} color={colors.accent} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
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
          <Ionicons name="flash" size={20} color={colors.white} style={{ marginRight: spacing.sm }} />
          <Text style={styles.subscribeBtnText}>
            {loading ? 'Redirection...' : 'S\'abonner maintenant'}
          </Text>
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Continuer sans abonnement</Text>
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
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },

  featuresCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm + 2,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  featureText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },

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

  legal: {
    ...typography.caption,
    color: colors.tabBarInactive,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
