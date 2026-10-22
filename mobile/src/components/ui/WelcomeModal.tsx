/**
 * WelcomeModal — shown once after the first sign-in (RootNavigator, global
 * chrome owned by the foundation). A BottomSheet: what the app does, how the
 * data is handled, one primary « Commencer ».
 *
 *   <WelcomeModal visible={welcomeVisible} onClose={handleCloseWelcome} />
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { palette, radius, type } from '../../theme';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon, IconName } from './Icon';
import { SectionHeader } from './ListRow';

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

const FEATURES: Array<{ icon: IconName; title: string; desc: string }> = [
  {
    icon: 'calculator-outline',
    title: 'Calcul de marges',
    desc: 'Prix de vente, marge cible ou coefficient : votre rentabilité par verre, en temps réel.',
  },
  {
    icon: 'wine-outline',
    title: 'Produits et services',
    desc: 'Spiritueux, vins, bières, softs : chaque bouteille avec ses services (verre, shot, pinte…).',
  },
  {
    icon: 'scan-outline',
    title: 'Scan de bouteille et de facture',
    desc: 'Photographiez une étiquette ou une facture : l’app lit le texte et pré-remplit la fiche.',
  },
  {
    icon: 'receipt-outline',
    title: 'Droits d’accise et TVA',
    desc: 'Droits, cotisation sécurité sociale et TVA calculés selon la catégorie fiscale, au barème officiel.',
  },
  {
    icon: 'stats-chart-outline',
    title: 'Tableau de bord',
    desc: 'Top et flop des marges, répartition par catégorie et rentabilité globale.',
  },
];

const DATA_POINTS: Array<{ icon: IconName; text: string }> = [
  { icon: 'lock-closed-outline', text: 'Vos produits, vos prix et vos marges ne sont visibles que par vous.' },
  { icon: 'shield-checkmark-outline', text: 'Vos données ne sont jamais partagées ni revendues.' },
  {
    icon: 'eye-off-outline',
    text: 'Le scan lit la photo sur nos serveurs, sans aucun service tiers, et ne la conserve pas. Les photos de produits que vous enregistrez sont stockées dans votre compte et supprimées avec lui.',
  },
  { icon: 'chatbubble-ellipses-outline', text: 'Pour supprimer votre compte, écrivez-nous depuis Réglages › Aide & retours.' },
];

export const WelcomeModal = React.memo(function WelcomeModal({ visible, onClose }: WelcomeModalProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      snap="full"
      title="Bienvenue dans MargeBar Pro"
      subline="Gratuit et sans engagement. Voici l’essentiel."
      footer={<Button title="Commencer" trailingIcon="arrow-forward" onPress={onClose} />}
      accessibilityLabel="Bienvenue dans MargeBar Pro"
      testID="welcome-sheet"
    >
      <SectionHeader variant="caps" title="Ce que fait l’application" style={styles.firstHeader} />
      {FEATURES.map((f) => (
        <View key={f.title} style={styles.featureRow}>
          <View style={styles.iconTile}>
            <Icon name={f.icon} size={22} color={palette.em700} />
          </View>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureDesc}>{f.desc}</Text>
          </View>
        </View>
      ))}

      <SectionHeader variant="caps" title="Vos données restent privées" style={styles.header} />
      <View style={styles.dataCard}>
        {DATA_POINTS.map((d, i) => (
          <View key={d.icon} style={[styles.dataRow, i > 0 && styles.dataRowGap]}>
            <Icon name={d.icon} size={20} color={palette.em700} style={styles.dataIcon} />
            <Text style={styles.dataText}>{d.text}</Text>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  firstHeader: { marginTop: 4 },
  header: { marginTop: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 8 },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.icon,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, minWidth: 0, paddingTop: 1 },
  featureTitle: { ...type.headline, color: palette.ink },
  featureDesc: { ...type.callout, color: palette.text2, marginTop: 2 },
  dataCard: {
    backgroundColor: palette.surface2,
    borderRadius: radius.md,
    padding: 16,
  },
  dataRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dataRowGap: { marginTop: 12 },
  dataIcon: { marginTop: 1 },
  dataText: { ...type.callout, color: palette.ink, flex: 1, minWidth: 0 },
});
