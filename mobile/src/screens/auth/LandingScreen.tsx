import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DroitsCalculator } from '../../components/ui/DroitsCalculator';
import { colors, spacing, borderRadius, typography, shadows, fonts } from '../../theme';
import { Eyebrow, Display, Script, InkStamp, Scribble } from '../../components/ui/atelier';

type Props = NativeStackScreenProps<any, 'Landing'>;

export function LandingScreen({ navigation }: Props) {
  const inner = (
    <View style={styles.inner}>
      {/* Header */}
      <View style={styles.header}>
        <InkStamp size={64} color={colors.primary} rotate={-6} />
        <Eyebrow color={colors.textMuted} style={{ marginTop: spacing.md }}>
          Pour les pros du comptoir
        </Eyebrow>
        <Display size={36} style={{ marginTop: spacing.xs, textAlign: 'center' }}>
          MargeBar Pro
        </Display>
        <Scribble width={70} color={colors.primary} style={{ marginTop: spacing.xs }} />
        <Text style={styles.subtitle}>
          Calculez vos marges,{' '}
          <Script size={18} color={colors.primary}>sans prise de tête.</Script>
        </Text>
      </View>

      {/* Auth buttons (top) */}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => navigation.navigate('Register')}
        activeOpacity={0.8}
      >
        <Ionicons name="person-add-outline" size={20} color={colors.white} style={{ marginRight: spacing.sm }} />
        <Text style={styles.primaryBtnText}>Créer un compte gratuit</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => navigation.navigate('Login')}
        activeOpacity={0.7}
      >
        <Ionicons name="log-in-outline" size={20} color={colors.primary} style={{ marginRight: spacing.sm }} />
        <Text style={styles.secondaryBtnText}>J'ai déjà un compte</Text>
      </TouchableOpacity>

      <Text style={styles.skipWarningText}>
        Le calculateur ci-dessous ne nécessite pas de compte mais vous ne pouvez pas sauvegarder.
      </Text>

      {/* Calculator */}
      <DroitsCalculator />

      {/* Features presentation */}
      <View style={styles.featuresCard}>
        <Text style={styles.featuresTitle}>Ce que MargeBar Pro vous permet</Text>
        <Text style={styles.featuresIntro}>
          L'outil de calcul de marges conçu pour les professionnels CHR (bars, restaurants, hôtels).
        </Text>
        {[
          { icon: 'calculator-outline', title: 'Calcul des droits d\'accise', desc: 'Calculez instantanément le prix HT avec droits pour les 13 catégories fiscales françaises (vins, bières, spiritueux, cidres…)' },
          { icon: 'receipt-outline', title: 'Prix de revient précis', desc: 'Intégrez les droits d\'accise, la cotisation sécurité sociale et la TVA pour connaître votre vrai coût d\'achat' },
          { icon: 'trending-up-outline', title: 'Calcul de marges', desc: 'Définissez vos prix de vente par type de service (shot, demi, pinte, bouteille) et visualisez vos marges en temps réel' },
          { icon: 'scan-outline', title: 'Scan de produits', desc: 'Photographiez une bouteille ou une facture fournisseur — l\'app reconnaît le produit et pré-remplit les informations' },
          { icon: 'bar-chart-outline', title: 'Tableau de bord', desc: 'Suivez la rentabilité de vos produits, identifiez les meilleurs et les moins performants, comparez par catégorie' },
          { icon: 'cloud-done-outline', title: 'Données sauvegardées', desc: 'Vos produits, recettes et calculs sont synchronisés sur le cloud. Accessible depuis n\'importe quel appareil' },
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
          <Text style={styles.supportTitle}>Application gratuite</Text>
        </View>
        <Text style={styles.supportDesc}>
          Créez un compte gratuit pour profiter de toutes les fonctionnalités. Vos données sont protégées : vous seul pouvez y accéder.
        </Text>
        <View style={styles.featuresRow}>
          {[
            { icon: 'lock-closed-outline', text: 'Données protégées et privées' },
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

      <View style={styles.aboutCard}>
        <Text style={styles.aboutTitle}>
          Application crée par{' '}
          <Text
            style={styles.aboutTitleLink}
            onPress={() => Linking.openURL('https://labrasseriedesplantes.fr/')}
          >
            La Brasserie des Plantes
          </Text>
        </Text>
        <Text style={styles.aboutDesc}>
          Si vous êtes intéressés par nos produits ou si vous avez des questions, n'hésitez pas à nous contacter.
        </Text>
        <TouchableOpacity style={styles.aboutRow} onPress={() => Linking.openURL('tel:0684444044')}>
          <Ionicons name="call-outline" size={16} color={colors.primary} />
          <Text style={styles.aboutLink}>06 84 44 40 44</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.aboutRow} onPress={() => Linking.openURL('mailto:labrasseriedesplantes@gmail.com')}>
          <Ionicons name="mail-outline" size={16} color={colors.primary} />
          <Text style={styles.aboutLink}>labrasseriedesplantes@gmail.com</Text>
        </TouchableOpacity>
      </View>
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
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  featuresCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
  },
  featuresTitle: {
    ...typography.h2,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontWeight: '500',
    color: colors.text,
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
  aboutCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  aboutTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  aboutTitleLink: {
    textDecorationLine: 'underline',
  },
  aboutDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: spacing.md,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  aboutLink: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
});
