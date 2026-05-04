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

      {/* Features presentation */}
      <View style={styles.featuresCard}>
        <Text style={styles.featuresTitle}>Ce que MargeBar Pro vous permet</Text>
        <Text style={styles.featuresIntro}>
          L'outil de calcul de marges concu pour les professionnels CHR (bars, restaurants, hotels).
        </Text>
        {[
          { icon: 'calculator-outline', title: 'Calcul des droits d\'accise', desc: 'Calculez instantanement le prix HT avec droits pour les 13 categories fiscales francaises (vins, bieres, spiritueux, cidres...)' },
          { icon: 'receipt-outline', title: 'Prix de revient precis', desc: 'Integrez les droits d\'accise, la cotisation securite sociale et la TVA pour connaitre votre vrai cout d\'achat' },
          { icon: 'trending-up-outline', title: 'Calcul de marges', desc: 'Definissez vos prix de vente par type de service (shot, demi, pinte, bouteille) et visualisez vos marges en temps reel' },
          { icon: 'scan-outline', title: 'Scan de produits', desc: 'Photographiez une bouteille ou une facture fournisseur — l\'app reconnait le produit et pre-remplit les informations' },
          { icon: 'bar-chart-outline', title: 'Tableau de bord', desc: 'Suivez la rentabilite de vos produits, identifiez les meilleurs et les moins performants, comparez par categorie' },
          { icon: 'cloud-done-outline', title: 'Donnees sauvegardees', desc: 'Vos produits, recettes et calculs sont synchronises sur le cloud. Accessible depuis n\'importe quel appareil' },
        ].map((f, i) => (
          <View key={i} style={styles.featureItem}>
            <View style={styles.featureIconBox}>
              <Ionicons name={f.icon as any} size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureItemTitle}>{f.title}</Text>
              <Text style={styles.featureItemDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Support */}
      <View style={styles.supportCard}>
        <View style={styles.supportHeader}>
          <Ionicons name="sparkles-outline" size={22} color={colors.primary} />
          <Text style={styles.supportTitle}>Application gratuite et open source</Text>
        </View>
        <Text style={styles.supportDesc}>
          MargeBar Pro est gratuit. Creez un compte pour sauvegarder vos produits et acceder a toutes les fonctionnalites.
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

      {/* Auth buttons */}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => navigation.navigate('Register')}
        activeOpacity={0.8}
      >
        <Ionicons name="person-add-outline" size={20} color={colors.white} style={{ marginRight: spacing.sm }} />
        <Text style={styles.primaryBtnText}>Creer un compte gratuit</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate('Login')}
        activeOpacity={0.7}
      >
        <Ionicons name="log-in-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
        <Text style={styles.secondaryBtnText}>J'ai deja un compte</Text>
      </TouchableOpacity>

      <Text style={styles.skipWarningText}>
        Le calculateur ci-dessus est gratuit et ne necessite pas de compte.
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
  featuresCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  featuresTitle: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  featuresIntro: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  featureIconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  featureItemTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  featureItemDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 17,
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
  promoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
    backgroundColor: colors.cardBackground,
  },
  promoBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.accent,
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
