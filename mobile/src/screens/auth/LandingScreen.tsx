import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DroitsCalculator } from '../../components/ui/DroitsCalculator';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

type Props = NativeStackScreenProps<any, 'Landing'>;

export function LandingScreen({ navigation }: Props) {
  const inner = (
    <View style={styles.inner}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoBadge}>
          <Ionicons name="bar-chart" size={32} color={colors.white} />
        </View>
        <Text style={styles.title}>MargeBar Pro</Text>
        <Text style={styles.subtitle}>
          Calculez vos marges, optimisez votre rentabilite
        </Text>
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

      {/* Auth buttons */}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => navigation.navigate('Register')}
        activeOpacity={0.8}
      >
        <Ionicons name="heart" size={20} color={colors.white} style={{ marginRight: spacing.sm }} />
        <Text style={styles.primaryBtnText}>Creer un compte et soutenir</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate('Login')}
        activeOpacity={0.7}
      >
        <Ionicons name="log-in-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
        <Text style={styles.secondaryBtnText}>J'ai deja un compte</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipBtn}
        onPress={() => navigation.navigate('Register')}
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
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        backgroundColor: colors.background,
        WebkitOverflowScrolling: 'touch',
      }}>
        {inner}
      </div>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {inner}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inner: {
    padding: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
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
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md - 4,
    marginTop: spacing.sm,
    backgroundColor: colors.cardBackground,
  },
  skipBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  skipWarningText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 17,
    paddingHorizontal: spacing.md,
  },
  legal: {
    ...typography.caption,
    color: colors.tabBarInactive,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
