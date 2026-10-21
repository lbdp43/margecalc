import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Modal, ScrollView, KeyboardAvoidingView, Platform as RNPlatform } from 'react-native';
import { alert, confirm } from '../../utils/alert';
import type { SaveProductData } from '../../components/ui/DroitsCalculator';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin,
  formatPercent, formatPrice, MARGIN_COLOR_MAP,
  calculateServingMargin,
} from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { DecorativeCurve } from '../../components/ui/DecorativeCurve';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as productService from '../../services/product.service';
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, borderRadius, typography, shadows, fonts } from '../../theme';
import { DroitsCalculator } from '../../components/ui/DroitsCalculator';
import { ProductDashboardCard } from './ProductDashboardCard';
import { CategoryChart } from './CategoryChart';
import { TopFlopSection } from './TopFlopSection';
import { Eyebrow, Display, InkStamp, Script, Num, Scribble } from '../../components/ui/atelier';

const WELCOME_DISMISSED_KEY = 'margebar_welcome_dismissed';
const CURVE_HEIGHT = 40;

export function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { data: products = [], refetch, isFetching } = useOfflineQuery<ProductWithMargin[]>(
    ['products'],
    () => productService.getProducts(),
  );

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [loadingPref, setLoadingPref] = useState(true);

  const [calcVisible, setCalcVisible] = useState(false);
  const [savedCalcs, setSavedCalcs] = useState<(SaveProductData & { id: string })[]>([]);

  // Load saved calculations
  useEffect(() => {
    AsyncStorage.getItem('margebar_saved_calcs').then((val) => {
      if (val) {
        try { setSavedCalcs(JSON.parse(val)); } catch { /* ignore */ }
      }
    });
  }, []);

  const handleSaveCalc = useCallback((data: SaveProductData) => {
    const entry = { ...data, id: Date.now().toString() };
    setSavedCalcs((prev) => {
      const updated = [entry, ...prev];
      AsyncStorage.setItem('margebar_saved_calcs', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
    setCalcVisible(false);
    alert('Enregistre', `${data.name} a ete ajoute a vos calculs`);
  }, []);

  const handleDeleteCalc = useCallback((id: string) => {
    setSavedCalcs((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      AsyncStorage.setItem('margebar_saved_calcs', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(WELCOME_DISMISSED_KEY).then((val) => {
      if (!mounted) return;
      if (val === 'true') setWelcomeVisible(false);
      setLoadingPref(false);
    });
    return () => { mounted = false; };
  }, []);

  const handleDismiss = useCallback(() => {
    setWelcomeVisible(false);
    confirm(
      'Masquer le message de bienvenue',
      'Voulez-vous le masquer définitivement ?',
      () => AsyncStorage.setItem(WELCOME_DISMISSED_KEY, 'true'),
      'Masquer',
    );
  }, []);

  const navigateToProduct = useCallback((productId: string) => {
    navigation.navigate('Produits', {
      screen: 'ProductDetail',
      params: { productId },
    });
  }, [navigation]);

  // Combined sorted + top5 + flop5 in a single memo
  const { sorted, top5, flop5, avgMargin } = useMemo(() => {
    const s = [...products].sort((a, b) => b.computed.marginPercent - a.computed.marginPercent);
    const avg = products.length > 0
      ? products.reduce((sum, p) => sum + p.computed.marginPercent, 0) / products.length
      : 0;
    return {
      sorted: s,
      top5: s.slice(0, 5),
      flop5: s.length > 5 ? s.slice(-5).reverse() : [],
      avgMargin: avg,
    };
  }, [products]);

  // Category margin data for bar chart
  const categoryData = useMemo(() => {
    const catMap = new Map<string, { name: string; margins: number[] }>();
    products.forEach((p) => {
      const catName = p.category?.name || 'Autre';
      if (!catMap.has(catName)) catMap.set(catName, { name: catName, margins: [] });
      catMap.get(catName)!.margins.push(p.computed.marginPercent);
    });
    return Array.from(catMap.values())
      .map((c) => ({
        name: c.name,
        avgMargin: c.margins.reduce((s, m) => s + m, 0) / c.margins.length,
        count: c.margins.length,
      }))
      .sort((a, b) => b.avgMargin - a.avgMargin);
  }, [products]);

  // Pre-compute serving margins for all products
  const productsWithServingMargins = useMemo(() => {
    return sorted.map((p) => ({
      product: p,
      accent: MARGIN_COLOR_MAP[p.computed.colorCode],
      servingMargins: (p.servings || []).map((s) => ({
        serving: s,
        margin: calculateServingMargin(
          p.purchasePriceHT, p.containerVolumeCl, p.tvaRate,
          s.servingType, s.sellingPriceTTC,
        ),
      })),
    }));
  }, [sorted]);

  return (
    <ScreenWrapper onRefresh={handleRefresh} refreshing={isFetching}>
      {/* Hero Header — emerald ink stamp on cream paper */}
      <View style={styles.heroCard}>
        <View style={styles.heroDecor}>
          <Svg width={120} height={120} viewBox="0 0 120 120">
            <Path d="M60 14 a46 46 0 1 1 0 92 a46 46 0 1 1 0 -92" stroke="#FFFFFF22" strokeWidth={1} strokeDasharray="3 3" fill="none" />
            <Path d="M60 28 a32 32 0 1 1 0 64 a32 32 0 1 1 0 -64" stroke="#FFFFFF18" strokeWidth={1} fill="none" />
          </Svg>
        </View>
        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <InkStamp size={36} color={colors.onAccent} rotate={-6} />
            <View style={{ marginLeft: spacing.sm + 2, flex: 1 }}>
              <Eyebrow color="rgba(243,248,236,0.78)" size={9.5} track={1.8}>
                {user?.businessName?.toUpperCase() || 'MON ÉTABLISSEMENT'}
              </Eyebrow>
              <Display size={22} color={colors.onAccent} style={{ marginTop: 2 }}>
                Tableau de bord
              </Display>
            </View>
          </View>

          {welcomeVisible && !loadingPref ? (
            <View style={styles.welcomeSection}>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleDismiss}
                accessibilityRole="button"
                accessibilityLabel="Fermer le message de bienvenue"
              >
                <Ionicons name="close" size={14} color={colors.textLight} />
              </TouchableOpacity>
              <Script size={26} color="#F3FBE6">Bienvenue sur MargeBar Pro.</Script>
              <Text style={styles.welcomeText}>
                Calculez vos marges sur chaque produit : spiritueux, vins, bières, softs.
                Ajoutez vos produits, choisissez votre méthode et visualisez votre rentabilité.
              </Text>
              <Text style={styles.welcomePrivacy}>
                Vos produits et vos marges restent privés vis-à-vis des autres utilisateurs.
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* S-curve bottom edge of hero */}
      <View style={styles.heroCurve}>
        <Svg width={width} height={CURVE_HEIGHT}>
          <Path
            d={`M0,0 L0,${CURVE_HEIGHT} C${width * 0.35},${CURVE_HEIGHT} ${width * 0.35},0 ${width},0 Z`}
            fill={colors.primary}
          />
        </Svg>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard} accessibilityLabel={`${products.length} produits`}>
          <Eyebrow color={colors.textMuted} size={9} track={1.4}>Produits</Eyebrow>
          <Num size={30} color={colors.text} weight="500" style={{ marginTop: 4 }}>
            {products.length}
          </Num>
          <Text style={styles.statSub}>au comptoir</Text>
        </View>
        <View style={styles.statCard} accessibilityLabel={`Marge moyenne ${formatPercent(avgMargin)}`}>
          <Eyebrow color={colors.textMuted} size={9} track={1.4}>Marge moy.</Eyebrow>
          <View style={styles.statValueRow}>
            <Num size={28} color={colors.text} weight="500">
              {avgMargin.toFixed(1).replace('.', ',')}
            </Num>
            <Script size={22} color={colors.accent} style={{ marginLeft: 2 }}>%</Script>
          </View>
          <Text style={styles.statSub}>{products.length > 0 ? 'pas mal du tout' : 'à venir'}</Text>
        </View>
        <TouchableOpacity
          style={styles.calcButton}
          onPress={() => setCalcVisible(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Calculer vos droits d'alcool"
        >
          <Eyebrow color="rgba(243,248,236,0.85)" size={9} track={1.4}>Calcul</Eyebrow>
          <Script size={20} color={colors.onAccent} style={{ marginTop: 6 }}>vos droits</Script>
          <View style={styles.calcButtonRow}>
            <Text style={styles.calcButtonSub}>d'alcool</Text>
            <Ionicons name="add" size={16} color={colors.onAccent} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Alcohol Tax Calculator Modal */}
      {calcVisible && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setCalcVisible(false)}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ backgroundColor: colors.cardBackground, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
                <Display size={22} color={colors.primary}>Calculateur</Display>
                <TouchableOpacity onPress={() => setCalcVisible(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
                <DroitsCalculator compact onSaveProduct={handleSaveCalc} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Saved calculations */}
      {savedCalcs.length > 0 && (
        <View style={styles.savedSection}>
          <View style={styles.savedHeader}>
            <Scribble width={28} color={colors.primary} style={{ marginRight: spacing.sm }} />
            <Text style={styles.savedTitle}>Mes calculs enregistrés</Text>
          </View>
          {savedCalcs.map((c) => (
            <View key={c.id} style={styles.savedCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedName}>{c.name}</Text>
                <Text style={styles.savedDetail}>{c.volumeCl} cl · {c.degree}° · {c.fiscalCategory}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.savedPriceLabel}>HT hors droit</Text>
                <Text style={styles.savedPrice}>{formatPrice(c.prixHTHorsDroit)}</Text>
                <Text style={styles.savedPriceLabel}>HT avec droits</Text>
                <Text style={[styles.savedPriceStrong, { color: colors.primary }]}>{formatPrice(c.prixHTAvecDroits)}</Text>
                <Text style={styles.savedPriceLabel}>TTC (20%)</Text>
                <Text style={styles.savedPrice}>{formatPrice(c.prixTTC)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteCalc(c.id)}
                style={{ paddingLeft: spacing.sm, justifyContent: 'center' }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.marginRed} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Margin by Category Chart */}
      <ErrorBoundary fallbackMessage="Impossible d'afficher le graphique">
        <CategoryChart data={categoryData} />
      </ErrorBoundary>

      {/* Top 5 Rentabilité */}
      <TopFlopSection
        title="Top rentabilité"
        indicatorColor={colors.marginGreen}
        products={top5}
        onPress={navigateToProduct}
      />

      {/* Flop 5 Rentabilité */}
      <TopFlopSection
        title="Flop rentabilité"
        indicatorColor={colors.marginRed}
        products={flop5}
        onPress={navigateToProduct}
      />

      <DecorativeCurve variant="middle" />

      {/* All products with serving tables */}
      <ErrorBoundary fallbackMessage="Impossible d'afficher les produits">
        {productsWithServingMargins.map((item) => (
          <ProductDashboardCard
            key={item.product.id}
            product={item.product}
            accent={item.accent}
            servingMargins={item.servingMargins}
            onPress={navigateToProduct}
          />
        ))}
      </ErrorBoundary>

      {products.length === 0 && !loadingPref && (
        <View style={styles.emptyState}>
          <InkStamp size={64} color={colors.primary} rotate={-6} />
          <Display size={20} style={{ marginTop: spacing.md, textAlign: 'center' }}>
            Le carnet est vide
          </Display>
          <Text style={styles.emptyText}>
            Ajoutez vos premiers produits pour voir vos statistiques.
          </Text>
        </View>
      )}

    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  savedSection: {
    marginBottom: spacing.lg,
  },
  savedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  savedTitle: {
    ...typography.h3,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontWeight: '500',
    color: colors.text,
  },
  savedCard: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
  },
  savedName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  savedDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  savedPriceLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  savedPrice: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  savedPriceStrong: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  heroCard: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  heroDecor: {
    position: 'absolute',
    top: -20,
    right: -20,
    opacity: 0.6,
  },
  heroContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroCurve: {
    marginTop: -1,
    marginBottom: spacing.md,
    height: CURVE_HEIGHT,
  },
  welcomeSection: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  welcomeText: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  welcomePrivacy: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'flex-start',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  statSub: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 11,
    fontWeight: '500',
    color: colors.textFaint,
    marginTop: 4,
  },
  calcButton: {
    flex: 1,
    alignItems: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    ...shadows.paper,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  calcButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
  },
  calcButtonSub: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 260,
    lineHeight: 22,
  },
});
