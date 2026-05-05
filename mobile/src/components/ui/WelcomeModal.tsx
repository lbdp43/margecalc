import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
  {
    icon: 'calculator-outline',
    title: 'Calcul de marges',
    desc: 'Prix de vente, marge cible ou coefficient — visualisez votre rentabilite en temps reel pour chaque boisson.',
  },
  {
    icon: 'wine-outline',
    title: 'Gestion produits & recettes',
    desc: 'Spiritueux, vins, bieres, softs, ingredients, cocktails... avec historique de prix et fournisseurs.',
  },
  {
    icon: 'scan-outline',
    title: 'Scan IA',
    desc: 'Photographiez une bouteille ou une facture, l\'app extrait automatiquement les informations.',
  },
  {
    icon: 'receipt-outline',
    title: 'Droits d\'accise & TVA',
    desc: 'Calcul automatique des droits, de la cotisation securite sociale et de la TVA selon la categorie fiscale.',
  },
  {
    icon: 'bar-chart-outline',
    title: 'Tableau de bord',
    desc: 'Top/flop des marges, repartition par categorie, suivi de la rentabilite globale.',
  },
];

const DATA_POINTS: Array<{ icon: string; text: string }> = [
  {
    icon: 'lock-closed-outline',
    text: 'Vos donnees sont stockees de maniere securisee sur nos serveurs, avec mot de passe hashe (bcrypt).',
  },
  {
    icon: 'shield-checkmark-outline',
    text: 'Aucune donnee n\'est vendue ni partagee avec des tiers. Elles servent uniquement a faire fonctionner l\'application.',
  },
  {
    icon: 'trash-outline',
    text: 'Vous pouvez supprimer vos donnees ou votre compte a tout moment depuis les Reglages.',
  },
  {
    icon: 'sparkles-outline',
    text: 'Le scan IA utilise Claude (Anthropic) uniquement pour extraire les informations de l\'image — les photos ne sont pas conservees.',
  },
];

export const WelcomeModal = React.memo(function WelcomeModal({ visible, onClose }: WelcomeModalProps) {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.betaBadge}>
                <Ionicons name="flask-outline" size={14} color={colors.white} />
                <Text style={styles.betaBadgeText}>BETA</Text>
              </View>
              <Text style={styles.title}>Bienvenue dans MargeBar Pro</Text>
              <Text style={styles.subtitle}>
                Calculateur de marges pour bars, restaurants et hotels
              </Text>
            </View>

            {/* Beta notice */}
            <View style={styles.noticeCard}>
              <View style={styles.noticeHeader}>
                <Ionicons name="information-circle" size={20} color={colors.primary} />
                <Text style={styles.noticeTitle}>Version beta jusqu'a fin avril 2026</Text>
              </View>
              <Text style={styles.noticeText}>
                L'application est actuellement en phase de test. La mise en production officielle est prevue pour debut mai 2026. Vos retours sont precieux pour nous aider a l'ameliorer avant la sortie.
              </Text>
            </View>

            {/* Features */}
            <Text style={styles.sectionTitle}>A quoi sert l'application ?</Text>
            <Text style={styles.sectionIntro}>
              MargeBar Pro vous aide a piloter la rentabilite de votre etablissement, de l'achat au verre servi.
            </Text>
            {FEATURES.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={styles.featureIconBox}>
                  <Ionicons name={f.icon as any} size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}

            {/* Data handling */}
            <Text style={styles.sectionTitle}>Vos donnees</Text>
            <Text style={styles.sectionIntro}>
              Nous prenons la confidentialite au serieux.
            </Text>
            {DATA_POINTS.map((d, i) => (
              <View key={i} style={styles.dataRow}>
                <Ionicons name={d.icon as any} size={18} color={colors.primary} style={styles.dataIcon} />
                <Text style={styles.dataText}>{d.text}</Text>
              </View>
            ))}
          </ScrollView>

          {/* CTA */}
          <View style={styles.ctaContainer}>
            <TouchableOpacity style={styles.ctaBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="checkmark" size={20} color={colors.white} style={{ marginRight: spacing.sm }} />
              <Text style={styles.ctaBtnText}>J'ai compris, commencer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    ...(Platform.OS === 'web' ? { height: '100vh' as any } : {}),
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.lg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  betaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  betaBadgeText: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.white,
    marginLeft: 4,
    letterSpacing: 1,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  noticeCard: {
    backgroundColor: colors.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  noticeTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  noticeText: {
    ...typography.bodySmall,
    color: colors.text,
    lineHeight: 20,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionIntro: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  featureRow: {
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
    marginRight: spacing.sm + 4,
  },
  featureTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  featureDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm + 4,
    paddingRight: spacing.sm,
  },
  dataIcon: {
    marginRight: spacing.sm + 2,
    marginTop: 2,
  },
  dataText: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
    lineHeight: 20,
  },
  ctaContainer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    ...shadows.md,
  },
  ctaBtnText: {
    ...typography.button,
    color: colors.white,
  },
});
