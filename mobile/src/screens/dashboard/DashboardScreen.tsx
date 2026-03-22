import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, useWindowDimensions } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin,
  formatPercent, formatPrice, MARGIN_COLOR_MAP,
  calculateServingMargin, CONTAINER_PRESETS,
} from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { DecorativeCurve } from '../../components/ui/DecorativeCurve';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as productService from '../../services/product.service';
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

const WELCOME_DISMISSED_KEY = 'margebar_welcome_dismissed';

function getContainerLabel(volumeCl: number): string {
  const preset = CONTAINER_PRESETS.find((p) => p.volumeCl === volumeCl);
  if (preset) return preset.label;
  if (volumeCl >= 100) return `${(volumeCl / 100).toFixed(volumeCl % 100 === 0 ? 0 : 1)} L`;
  return `${volumeCl} cl`;
}

const CURVE_HEIGHT = 40;

// Category colors for the bar chart
const CATEGORY_COLORS = [
  '#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2', '#B7E4C7',
];

export function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const chartWidth = width - spacing.md * 4;
  const { data: products = [] } = useOfflineQuery<ProductWithMargin[]>(
    ['products'],
    () => productService.getProducts(),
  );

  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [loadingPref, setLoadingPref] = useState(true);
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

  const navigateToProduct = (productId: string) => {
    navigation.navigate('Produits', {
      screen: 'ProductDetail',
      params: { productId },
    });
  };

  const sorted = useMemo(
    () => [...products].sort((a, b) => b.computed.marginPercent - a.computed.marginPercent),
    [products],
  );

  const avgMargin = useMemo(
    () => products.length > 0
      ? products.reduce((sum, p) => sum + p.computed.marginPercent, 0) / products.length
      : 0,
    [products],
  );

  // Category margin data for bar chart
  const categoryData = useMemo(() => {
    const catMap = new Map<string, { name: string; margins: number[] }>();
    products.forEach((p) => {
      const catName = (p as any).category?.name || 'Autre';
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

  // Top 5 and Bottom 5
  const top5 = sorted.slice(0, 5);
  const flop5 = sorted.length > 5 ? sorted.slice(-5).reverse() : [];

  const renderProductCard = (p: ProductWithMargin) => {
    const servings = p.servings || [];
    const accent = MARGIN_COLOR_MAP[p.computed.colorCode];

    return (
      <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => navigateToProduct(p.id)}>
        <View style={styles.productCard}>
          <View style={styles.productHeader}>
            <View style={[styles.productIndicator, { backgroundColor: accent }]} />
            <View style={styles.productTitleWrap}>
              <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.productSubtitle}>
                Achat : {formatPrice(p.purchasePriceHT)} HT · {getContainerLabel(p.containerVolumeCl)}
              </Text>
            </View>
            <Text style={[styles.productMargin, { color: accent }]}>
              {formatPercent(p.computed.marginPercent)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.tabBarInactive} />
          </View>

          {servings.length > 0 && (
            <View style={styles.servingsTable}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeader, { flex: 2 }]}>SERVICE</Text>
                <Text style={[styles.tableHeader, { flex: 1.2, textAlign: 'right' }]}>PRIX TTC</Text>
                <Text style={[styles.tableHeader, { flex: 1.2, textAlign: 'right' }]}>MARGE</Text>
                <Text style={[styles.tableHeader, { flex: 1, textAlign: 'right' }]}>COEFF</Text>
              </View>
              {servings.map((s) => {
                const margin = calculateServingMargin(
                  p.purchasePriceHT,
                  p.containerVolumeCl,
                  p.tvaRate,
                  s.servingType,
                  s.sellingPriceTTC,
                );
                const rowColor = MARGIN_COLOR_MAP[margin.colorCode];
                return (
                  <View key={s.id} style={styles.tableRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.servingName}>{s.servingType.name}</Text>
                      <Text style={styles.servingVolume}>{s.servingType.volumeCl} cl</Text>
                    </View>
                    <Text style={[styles.tableCell, { flex: 1.2, textAlign: 'right' }]}>
                      {formatPrice(s.sellingPriceTTC)}
                    </Text>
                    <Text style={[styles.tableCellBold, { flex: 1.2, textAlign: 'right', color: rowColor }]}>
                      {formatPercent(margin.marginPercent)}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>
                      x {margin.servingsPerContainer > 0
                        ? (margin.sellingPriceHT / margin.costPerServingHT).toFixed(1)
                        : '-'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Bar chart rendering
  const barChartHeight = 160;
  const barMaxWidth = chartWidth - 80;
  const maxMargin = Math.max(...categoryData.map((c) => c.avgMargin), 1);

  return (
    <ScreenWrapper>
      {/* Hero Header */}
      <View style={styles.heroCard}>
        <View style={styles.heroContent}>
          <Text style={styles.heroGreeting}>
            {user?.businessName?.toUpperCase() || 'MON ÉTABLISSEMENT'}
          </Text>
          <Text style={styles.heroTitle}>Tableau de bord</Text>
        </View>

        {welcomeVisible && !loadingPref && (
          <View style={styles.welcomeSection}>
            <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss}>
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
        <View style={styles.statCard}>
          <Ionicons name="cube-outline" size={20} color={colors.primary} />
          <Text style={styles.statValue}>{products.length}</Text>
          <Text style={styles.statLabel}>Produits</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="trending-up-outline" size={20} color={colors.primary} />
          <Text style={styles.statValue}>{formatPercent(avgMargin)}</Text>
          <Text style={styles.statLabel}>Marge moyenne</Text>
        </View>
      </View>

      {/* Margin by Category Chart */}
      {categoryData.length > 0 && (
        <View style={styles.chartCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIndicator, { backgroundColor: colors.primary }]} />
            <Text style={styles.sectionTitle}>Marge par catégorie</Text>
          </View>
          <View style={{ height: categoryData.length * 40 + 8, marginTop: spacing.sm }}>
            <Svg width={chartWidth} height={categoryData.length * 40 + 8}>
              {categoryData.map((cat, i) => {
                const barW = Math.max((cat.avgMargin / maxMargin) * barMaxWidth, 4);
                const y = i * 40 + 4;
                const colorIdx = i % CATEGORY_COLORS.length;
                return (
                  <React.Fragment key={cat.name}>
                    <SvgText
                      x={0}
                      y={y + 16}
                      fontSize={11}
                      fill={colors.text}
                      fontWeight="600"
                    >
                      {cat.name.length > 12 ? cat.name.slice(0, 11) + '…' : cat.name}
                    </SvgText>
                    <Rect
                      x={80}
                      y={y + 2}
                      width={barW}
                      height={22}
                      rx={6}
                      fill={CATEGORY_COLORS[colorIdx]}
                    />
                    <SvgText
                      x={80 + barW + 6}
                      y={y + 17}
                      fontSize={12}
                      fill={colors.text}
                      fontWeight="700"
                    >
                      {cat.avgMargin.toFixed(1)} %
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          </View>
        </View>
      )}

      {/* Top 5 Rentabilité */}
      {top5.length > 0 && (
        <View style={styles.chartCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIndicator, { backgroundColor: colors.marginGreen }]} />
            <Text style={styles.sectionTitle}>Top rentabilité</Text>
          </View>
          {top5.map((p, i) => {
            const accent = MARGIN_COLOR_MAP[p.computed.colorCode];
            return (
              <TouchableOpacity key={p.id} onPress={() => navigateToProduct(p.id)} activeOpacity={0.7}>
                <View style={styles.rankRow}>
                  <Text style={styles.rankNumber}>{i + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.rankMargin, { color: accent }]}>
                    {formatPercent(p.computed.marginPercent)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Flop 5 Rentabilité */}
      {flop5.length > 0 && (
        <View style={styles.chartCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIndicator, { backgroundColor: colors.marginRed }]} />
            <Text style={styles.sectionTitle}>Flop rentabilité</Text>
          </View>
          {flop5.map((p, i) => {
            const accent = MARGIN_COLOR_MAP[p.computed.colorCode];
            return (
              <TouchableOpacity key={p.id} onPress={() => navigateToProduct(p.id)} activeOpacity={0.7}>
                <View style={styles.rankRow}>
                  <Text style={styles.rankNumber}>{i + 1}</Text>
                  <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.rankMargin, { color: accent }]}>
                    {formatPercent(p.computed.marginPercent)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <DecorativeCurve variant="middle" />

      {/* All products with serving tables */}
      {sorted.map((p) => renderProductCard(p))}

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
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* Chart card */
  chartCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },

  /* Rank rows (top/flop) */
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rankNumber: {
    width: 24,
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  rankName: {
    flex: 1,
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginLeft: spacing.sm,
  },
  rankMargin: {
    ...typography.bodySmall,
    fontWeight: '800',
    marginLeft: spacing.sm,
  },

  /* Product cards with serving table */
  productCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  productIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: spacing.sm + 2,
  },
  productTitleWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  productName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  productSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  productMargin: {
    ...typography.h3,
    fontWeight: '800',
    marginRight: spacing.xs,
  },

  /* Servings table */
  servingsTable: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  tableHeader: {
    ...typography.caption,
    color: colors.tabBarInactive,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  servingName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  servingVolume: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  tableCell: {
    ...typography.bodySmall,
    color: colors.text,
  },
  tableCellBold: {
    ...typography.bodySmall,
    fontWeight: '700',
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
