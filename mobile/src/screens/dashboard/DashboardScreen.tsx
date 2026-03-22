import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, useWindowDimensions } from 'react-native';
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
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';
import { useCalculator } from './useCalculator';
import { CalculatorModal } from './CalculatorModal';
import { ProductDashboardCard } from './ProductDashboardCard';
import { CategoryChart } from './CategoryChart';
import { TopFlopSection } from './TopFlopSection';

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

  const calc = useCalculator();

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
    Alert.alert(
      'Masquer le message de bienvenue',
      'Voulez-vous le masquer définitivement ?',
      [
        { text: 'Revoir plus tard', style: 'cancel' },
        {
          text: 'Masquer',
          onPress: () => AsyncStorage.setItem(WELCOME_DISMISSED_KEY, 'true'),
        },
      ],
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
      {/* Hero Header */}
      <View style={styles.heroCard}>
        <View style={styles.heroContent}>
          <Text style={styles.heroGreeting} accessibilityRole="header">
            {user?.businessName?.toUpperCase() || 'MON ÉTABLISSEMENT'}
          </Text>
          <Text style={styles.heroTitle}>Tableau de bord</Text>
        </View>

        {welcomeVisible && !loadingPref && (
          <View style={styles.welcomeSection}>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleDismiss}
              accessibilityRole="button"
              accessibilityLabel="Fermer le message de bienvenue"
            >
              <Ionicons name="close" size={14} color={colors.textLight} />
            </TouchableOpacity>
            <Text style={styles.welcomeTitle}>Bienvenue sur MargeBar</Text>
            <Text style={styles.welcomeText}>
              Calculez vos marges sur chaque produit : spiritueux, vins, bières, softs...
              Ajoutez vos produits, choisissez votre méthode de calcul et visualisez votre rentabilité.
            </Text>
            <Text style={styles.welcomePrivacy}>
              Vos données sont privées et vous appartiennent. Aucun accès administrateur à vos produits ou résultats.
            </Text>
          </View>
        )}
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
          <Ionicons name="cube-outline" size={20} color={colors.primary} />
          <Text style={styles.statValue}>{products.length}</Text>
          <Text style={styles.statLabel}>Produits</Text>
        </View>
        <View style={styles.statCard} accessibilityLabel={`Marge moyenne ${formatPercent(avgMargin)}`}>
          <Ionicons name="trending-up-outline" size={20} color={colors.primary} />
          <Text style={styles.statValue}>{formatPercent(avgMargin)}</Text>
          <Text style={styles.statLabel}>Marge moyenne</Text>
        </View>
        <TouchableOpacity
          style={styles.calcButton}
          onPress={calc.openCalc}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le calculateur de prix HT"
        >
          <Ionicons name="calculator-outline" size={20} color={colors.textLight} />
          <Text style={styles.calcButtonLabel}>Calcul du prix HT</Text>
          <Text style={styles.calcButtonSub}>par le prix HT hors droit</Text>
        </TouchableOpacity>
      </View>

      {/* Alcohol Tax Calculator Modal */}
      <CalculatorModal
        visible={calc.calcVisible}
        onClose={calc.closeCalc}
        calcPriceHD={calc.calcPriceHD}
        onChangePriceHD={calc.setCalcPriceHD}
        calcContainer={calc.calcContainer}
        onChangeContainer={calc.setCalcContainer}
        calcDegree={calc.calcDegree}
        onChangeDegree={calc.setCalcDegree}
        calcTax={calc.calcTax}
      />

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
          <Ionicons name="analytics-outline" size={48} color={colors.tabBarInactive} />
          <Text style={styles.emptyText}>Ajoutez des produits pour voir vos statistiques</Text>
        </View>
      )}

    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: borderRadius.xxl,
    borderTopRightRadius: borderRadius.xxl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
    overflow: 'visible',
    ...shadows.lg,
  },
  heroCurve: {
    marginTop: -1,
    marginBottom: spacing.md,
    height: CURVE_HEIGHT,
  },
  heroContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  heroGreeting: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.h1,
    color: colors.textLight,
  },
  welcomeSection: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
  welcomeTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textLight,
    marginBottom: spacing.sm,
    paddingRight: spacing.xl,
  },
  welcomeText: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  welcomePrivacy: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    ...shadows.sm,
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  calcButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    ...shadows.sm,
  },
  calcButtonLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textLight,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  calcButtonSub: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
    textAlign: 'center',
    fontSize: 10,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.tabBarInactive,
    textAlign: 'center',
  },
});
