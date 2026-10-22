/**
 * « Calculateur de droits » screen.
 * - Logged in: pushed in the Tableau de bord stack (the tab bar stays
 *   visible, spec §3.11); « Enregistrer comme produit » opens the product form
 *   prefilled (scanData: category, container, degree, price HT with duties).
 *   Back from the form returns here with the values intact; once the form
 *   saves (it lands on the product in « Produits »), the Tableau de bord stack
 *   returns to its root, so the tab shows the dashboard with the new numbers.
 * - Logged out (AuthNavigator, e.g. from the landing): same calculator, no
 *   save; a « Créer un compte gratuit » card instead. Leaving through it keeps
 *   the calculation on the device (screens/dashboard/parts/savedCalcs): the
 *   empty dashboard and the form's first step offer it after sign-up.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
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
import { rememberCalc } from '../screens/dashboard/parts/savedCalcs';

export function DutyCalculatorRoute() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  const { data: categories } = useOfflineQuery<Category[]>(['categories'], categoryService.getCategories, { enabled: isAuthenticated });
  /** True while the product form opened from here is open. */
  const handedOff = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    // The tab route holding the Tableau de bord stack (Tabs navigator).
    const tab = navigation.getParent?.();
    if (!tab?.addListener) return;
    // Back from the form (nothing saved): this screen is focused again.
    const offFocus = navigation.addListener('focus', () => {
      handedOff.current = false;
    });
    // Saved: the form closes onto another tab (the product in « Produits »).
    // Pop the calculator while its tab is hidden: no animation is seen, and
    // POP_TO_TOP never moves the focus (unlike NAVIGATE).
    const offState = tab.addListener('state', (e: any) => {
      if (!handedOff.current) return;
      const s = e?.data?.state;
      const focusedTab = s?.routes?.[s.index ?? 0]?.name;
      if (!focusedTab || focusedTab === ROUTES.dashboardTab) return;
      handedOff.current = false;
      navigation.dispatch(StackActions.popToTop());
    });
    return () => {
      offFocus();
      offState();
    };
  }, [isAuthenticated, navigation]);

  const saveAsProduct = useCallback(
    (d: DutyDraft) => {
      const slug = FISCAL_TO_PRODUCT_CATEGORY[d.rate.slug];
      const category = (categories ?? []).find((c) => c.slug === slug);
      handedOff.current = true;
      // ProductFormParams.scanData (screens/products/form/model.ts): a price
      // « hors droits » + its fiscal category opens the form in that mode, so
      // the duties stay itemised; prixHTAvecDroits is the fallback.
      openProductForm(navigation, {
        scanData: {
          ...(category ? { categoryId: category.id } : null),
          fiscalCategory: d.rate.slug,
          containerVolumeCl: d.volumeCl,
          alcoholDegree: d.degree,
          prixHTHorsDroit: d.price,
          prixHTAvecDroits: d.result.prixHTAvecDroits,
        },
      });
    },
    [categories, navigation],
  );

  // Logged out: keep the calculation (when the visitor changed something),
  // then go on to Inscription / Connexion. The write is local and quick; the
  // navigation never waits for it.
  const leaveWith = useCallback(
    (d: DutyDraft, route: string) => {
      if (d.edited) rememberCalc(d);
      navigation.navigate(route);
    },
    [navigation],
  );

  return (
    <Screen
      header={
        <NavBar
          title="Calculateur de droits"
          // Narrow phones keep the whole title; the year is also in the « Barème officiel » link.
          trailing={width >= 360 ? <Badge variant="brand" icon={width >= 380 ? 'shield-checkmark' : undefined} label={`Tarifs ${year}`} size="sm" /> : undefined}
        />
      }
      testID="duty-calculator-screen"
    >
      <DutyCalculator
        onSaveAsProduct={isAuthenticated ? saveAsProduct : undefined}
        footer={
          isAuthenticated
            ? null
            : (d: DutyDraft) => <SignUpCard onRegister={() => leaveWith(d, ROUTES.register)} onLogin={() => leaveWith(d, ROUTES.login)} />
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
      <Button title="J’ai déjà un compte" variant="text" onPress={onLogin} fullWidth testID="duty-login" />
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
