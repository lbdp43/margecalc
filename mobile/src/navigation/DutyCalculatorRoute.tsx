/**
 * « Calculateur de droits » screen.
 * - Logged in: pushed in the Tableau de bord stack (the tab bar stays
 *   visible, spec §3.11); « Enregistrer comme produit » opens the product form
 *   prefilled (scanData: category, container, degree, price HT with duties).
 * - Logged out (AuthNavigator, e.g. from the landing): same calculator, no
 *   save; a « Créer un compte gratuit » card instead.
 */
import React, { useCallback } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { Category } from '@margebar/shared';
import { Badge, BrandMark, Button, Card, NavBar, Screen } from '../components/ui';
import { palette, type } from '../theme';
import { useAuthStore } from '../store/auth.store';
import { useSystemParamsStore } from '../store/systemParams.store';
import { useOfflineQuery } from '../hooks/useOfflineQuery';
import * as categoryService from '../services/category.service';
import { openProductForm, ROUTES } from './routes';
import { DutyCalculator, DutyDraft } from '../screens/dashboard/parts/DutyCalculator';
import { FISCAL_TO_PRODUCT_CATEGORY } from '../screens/dashboard/parts/duties';

export function DutyCalculatorRoute() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  const { data: categories } = useOfflineQuery<Category[]>(['categories'], categoryService.getCategories, { enabled: isAuthenticated });

  const saveAsProduct = useCallback(
    (d: DutyDraft) => {
      const slug = FISCAL_TO_PRODUCT_CATEGORY[d.rate.slug];
      const category = (categories ?? []).find((c) => c.slug === slug);
      openProductForm(navigation, {
        // Same shape as the scan prefill the product form already reads.
        scanData: {
          ...(category ? { categoryId: category.id } : null),
          containerVolumeCl: d.volumeCl,
          estimatedPriceHT: d.result.prixHTAvecDroits,
          alcoholDegree: d.degree,
          fiscalCategory: d.rate.slug,
          purchasePriceHorsDroits: d.price,
          source: 'duty-calculator',
        },
      });
    },
    [categories, navigation],
  );

  return (
    <Screen
      header={
        <NavBar
          title="Calculateur de droits"
          trailing={<Badge variant="brand" icon={width >= 380 ? 'shield-checkmark' : undefined} label={`Tarifs ${year}`} size="sm" />}
        />
      }
      testID="duty-calculator-screen"
    >
      <DutyCalculator
        onSaveAsProduct={isAuthenticated ? saveAsProduct : undefined}
        footer={
          isAuthenticated ? null : (
            <SignUpCard onRegister={() => navigation.navigate(ROUTES.register)} onLogin={() => navigation.navigate(ROUTES.login)} />
          )
        }
      />
    </Screen>
  );
}

function SignUpCard({ onRegister, onLogin }: { onRegister: () => void; onLogin: () => void }) {
  return (
    <Card>
      <View style={styles.cta}>
        <BrandMark size={44} />
        <View style={styles.ctaTexts}>
          <Text style={styles.ctaTitle}>Enregistrez vos produits</Text>
          <Text style={styles.ctaText}>Gardez ce calcul, fixez vos prix et suivez vos marges. C’est gratuit.</Text>
        </View>
      </View>
      <Button title="Créer un compte gratuit" trailingIcon="arrow-forward" onPress={onRegister} fullWidth style={styles.ctaBtn} testID="duty-register" />
      <Button title="J’ai déjà un compte" variant="text" onPress={onLogin} fullWidth />
      <Text style={styles.ctaNote}>Sans engagement · sans carte bancaire</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  cta: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ctaTexts: { flex: 1, minWidth: 0 },
  ctaTitle: { ...type.title3, color: palette.ink },
  ctaText: { ...type.callout, color: palette.text2, marginTop: 2 },
  ctaBtn: { marginTop: 16 },
  ctaNote: { ...type.footnote, color: palette.text3, textAlign: 'center', marginTop: 4 },
});
