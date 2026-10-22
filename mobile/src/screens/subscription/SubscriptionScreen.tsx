/**
 * Former subscription screen. MargeBar Pro is free for everyone: there is no
 * paywall, no plan and no promo code. The route is not registered any more;
 * the file stays so old imports keep compiling, and shows a calm « Gratuit »
 * page if it is ever reached.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Badge, BrandMark, Button, Card, NavBar, Screen } from '../../components/ui';
import { palette, type } from '../../theme';
import { goHome } from '../../navigation/routes';

const POINTS = [
  'Calcul des marges, services et coefficients',
  'Scan de bouteille et de facture',
  'Droits d’accise au barème officiel',
  'Tableau de bord et suivi des produits',
];

export function SubscriptionScreen() {
  const navigation = useNavigation<any>();
  return (
    <Screen header={<NavBar title="MargeBar Pro" />}>
      <View style={styles.hero}>
        <BrandMark size={56} />
        <Text style={styles.title}>Gratuit pour tous</Text>
        <Badge variant="brand" icon="sparkles" label="Sans abonnement" />
        <Text style={styles.lead}>Toutes les fonctions sont incluses, sans carte bancaire et sans engagement.</Text>
      </View>
      <Card>
        {POINTS.map((p, i) => (
          <View key={p} style={[styles.point, i < POINTS.length - 1 && styles.divider]}>
            <View style={styles.dot} />
            <Text style={styles.pointText}>{p}</Text>
          </View>
        ))}
      </Card>
      <Button title="Continuer" trailingIcon="arrow-forward" onPress={() => goHome(navigation)} style={{ marginTop: 24 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  title: { ...type.title1, color: palette.ink, textAlign: 'center' },
  lead: { ...type.body, color: palette.text2, textAlign: 'center', maxWidth: 320 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.em600 },
  pointText: { ...type.callout, color: palette.ink, flex: 1 },
});
