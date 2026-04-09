import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Linking, Platform } from 'react-native';
import { alert, confirm } from '../../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { DroitsCalculator } from '../../components/ui/DroitsCalculator';
import { useAuthStore } from '../../store/auth.store';
import * as subscriptionService from '../../services/subscription.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface Props {
  onDismiss?: () => void;
}

export function SubscriptionScreen({ onDismiss }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
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
      alert('Erreur', 'Impossible de lancer le paiement. Reessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemCode = async () => {
    if (!accessCode.trim() || codeLoading) return;
    setCodeLoading(true);
    try {
      const result = await subscriptionService.redeemAccessCode(accessCode);
      if (user && token) {
        setAuth(token, {
          ...user,
          subscriptionStatus: result.subscriptionStatus as any,
          subscriptionPlan: result.subscriptionPlan,
          subscriptionEndDate: result.subscriptionEndDate,
        });
      }
      setAccessCode('');
      alert(
        'Code valide',
        `Bienvenue ${result.clientName} ! Vous beneficiez d'un acces gratuit de ${result.durationDays} jours.`,
      );
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Code invalide';
      alert('Erreur', msg);
    } finally {
      setCodeLoading(false);
    }
  };

  const handleSkip = () => {
    confirm(
      'Mode decouverte',
      'Sans abonnement, vos donnees ne seront pas sauvegardees. Elles seront supprimees a la prochaine ouverture de l\'application.\n\nVous pourrez vous abonner a tout moment depuis les Reglages.',
      () => {
        if (onDismiss) {
          onDismiss();
        } else if (user && token) {
          setAuth(token, { ...user, subscriptionStatus: 'none' });
        }
      },
      'Continuer quand meme',
    );
  };

  return (
    <ScreenWrapper decorations={false}>
      <View style={styles.header}>
        <View style={styles.logoBadge}>
          <Ionicons name="bar-chart" size={32} color={colors.white} />
        </View>
        <Text style={styles.title}>MargeBar Pro</Text>
      </View>

      {/* Calculator */}
      <DroitsCalculator />

      {/* Support */}
      <View style={styles.supportCard}>
        <View style={styles.supportHeader}>
          <Ionicons name="heart-outline" size={22} color={colors.primary} />
          <Text style={styles.supportTitle}>Soutenez MargeBar Pro</Text>
        </View>
        <Text style={styles.supportDesc}>
          Votre abonnement permet de maintenir l'application, financer les serveurs et developper de nouvelles fonctionnalites.
        </Text>
        <View style={styles.featuresRow}>
          {[
            { icon: 'save-outline', text: 'Sauvegarde de vos donnees' },
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

      {/* Access code */}
      <View style={styles.codeCard}>
        <View style={styles.codeHeader}>
          <Ionicons name="key-outline" size={18} color={colors.primary} />
          <Text style={styles.codeTitle}>J'ai un code d'acces</Text>
        </View>
        <Text style={styles.codeDesc}>
          Saisissez le code fourni pour beneficier d'un acces gratuit.
        </Text>
        <View style={styles.codeRow}>
          <TextInput
            style={styles.codeInput}
            value={accessCode}
            onChangeText={setAccessCode}
            placeholder="Votre code"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!codeLoading}
            onSubmitEditing={handleRedeemCode}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.codeBtn, (!accessCode.trim() || codeLoading) && styles.codeBtnDisabled]}
            onPress={handleRedeemCode}
            disabled={!accessCode.trim() || codeLoading}
            activeOpacity={0.7}
          >
            <Text style={styles.codeBtnText}>
              {codeLoading ? '...' : 'Valider'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.skipBtn}
        onPress={handleSkip}
        activeOpacity={0.7}
      >
        <Ionicons name="eye-outline" size={18} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
        <Text style={styles.skipBtnText}>Continuer sans abonnement</Text>
      </TouchableOpacity>

      <Text style={styles.skipWarningText}>
        Le calculateur ci-dessus reste gratuit. Sans abonnement, vos donnees ne seront pas conservees.
      </Text>

      <Text style={styles.legal}>
        Paiement securise par Stripe. Annulable a tout moment.
      </Text>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: spacing.lg },
  logoBadge: { width: 56, height: 56, borderRadius: borderRadius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, ...shadows.md },
  title: { ...typography.h1, color: colors.primary },
  supportCard: { backgroundColor: colors.light, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  supportHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  supportTitle: { ...typography.h3, color: colors.primary, marginLeft: spacing.sm },
  supportDesc: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.md },
  featuresRow: { gap: spacing.sm },
  featureMini: { flexDirection: 'row', alignItems: 'center' },
  featureMiniText: { ...typography.bodySmall, color: colors.text, marginLeft: spacing.sm },
  plansRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  planCard: { flex: 1, backgroundColor: colors.cardBackground, borderRadius: borderRadius.lg, padding: spacing.md, alignItems: 'center', borderWidth: 2, borderColor: colors.border, position: 'relative', ...shadows.sm },
  planCardActive: { borderColor: colors.primary, backgroundColor: colors.light },
  planRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, marginBottom: spacing.sm },
  planRadioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  planLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  planLabelActive: { color: colors.primary },
  planPrice: { ...typography.h2, color: colors.text },
  planPriceActive: { color: colors.primary },
  planPeriod: { ...typography.caption, color: colors.textSecondary },
  planPeriodActive: { color: colors.accent },
  planSaveBadge: { position: 'absolute', top: -10, right: -6, backgroundColor: colors.marginGreen, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  planSaveText: { ...typography.caption, fontWeight: '700', color: colors.white, fontSize: 10 },
  subscribeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: spacing.md, ...shadows.md },
  subscribeBtnDisabled: { opacity: 0.7 },
  subscribeBtnText: { ...typography.button, color: colors.white },
  codeCard: { backgroundColor: colors.cardBackground, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  codeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  codeTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.primary, marginLeft: spacing.sm },
  codeDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  codeRow: { flexDirection: 'row', gap: spacing.sm },
  codeInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.body, color: colors.text, backgroundColor: colors.background },
  codeBtn: { paddingHorizontal: spacing.md, justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md },
  codeBtnDisabled: { opacity: 0.5 },
  codeBtnText: { ...typography.button, color: colors.white, fontSize: 14 },
  skipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingVertical: spacing.md - 4, marginTop: spacing.sm, backgroundColor: colors.cardBackground },
  skipBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  skipWarningText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 17, paddingHorizontal: spacing.md },
  legal: { ...typography.caption, color: colors.tabBarInactive, textAlign: 'center', marginTop: spacing.md },
});
