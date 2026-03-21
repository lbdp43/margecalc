import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin, ServingMarginResult,
  formatPercent, formatPrice, MARGIN_COLOR_MAP,
} from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Card } from '../../components/ui/Card';
import * as productService from '../../services/product.service';
import * as servingService from '../../services/serving.service';
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, borderRadius, typography } from '../../theme';

const WELCOME_DISMISSED_KEY = 'margebar_welcome_dismissed';

export function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<any>();
  const { data: products = [] } = useQuery<ProductWithMargin[]>({
    queryKey: ['products'],
    queryFn: () => productService.getProducts(),
  });

  const [welcomeVisible, setWelcomeVisible] = useState(true);
  const [loadingPref, setLoadingPref] = useState(true);
  const [allServings, setAllServings] = useState<Record<string, ServingMarginResult[]>>({});

  useEffect(() => {
    AsyncStorage.getItem(WELCOME_DISMISSED_KEY).then((val) => {
      if (val === 'true') setWelcomeVisible(false);
      setLoadingPref(false);
    });
  }, []);

  // Load servings for all products
  useEffect(() => {
    if (products.length === 0) return;
    const loadAll = async () => {
      const entries: [string, ServingMarginResult[]][] = await Promise.all(
        products.map(async (p) => {
          try {
            const servings = await servingService.getProductServings(p.id);
            return [p.id, servings] as [string, ServingMarginResult[]];
          } catch {
            return [p.id, []] as [string, ServingMarginResult[]];
          }
        })
      );
      setAllServings(Object.fromEntries(entries));
    };
    loadAll();
  }, [products]);

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

  const sorted = [...products].sort((a, b) => b.computed.marginPercent - a.computed.marginPercent);

  const avgMargin = products.length > 0
    ? products.reduce((sum, p) => sum + p.computed.marginPercent, 0) / products.length
    : 0;

  return (
    <ScreenWrapper>
      <Text style={styles.greeting}>
        {user?.businessName || 'Mon établissement'}
      </Text>
      <Text style={styles.title}>Tableau de bord</Text>

      {welcomeVisible && !loadingPref && (
        <Card style={styles.welcomeCard}>
          <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss}>
            <Ionicons name="close" size={16} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.welcomeTitle}>Bienvenue sur MargeBar</Text>
          <Text style={styles.welcomeText}>
            Calculez vos marges sur chaque produit : spiritueux, vins, bières, softs...
            Ajoutez vos produits, choisissez votre méthode de calcul et visualisez votre rentabilité.
          </Text>
          <Text style={styles.welcomePrivacy}>
            Vos données sont privées et vous appartiennent. Aucun accès administrateur à vos produits ou résultats.
          </Text>
        </Card>
      )}

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Ionicons name="cube-outline" size={20} color={colors.primary} style={styles.statIcon} />
          <Text style={styles.statValue}>{products.length}</Text>
          <Text style={styles.statLabel}>Produits</Text>
        </Card>
        <Card style={styles.statCard}>
          <Ionicons name="trending-up-outline" size={20} color={colors.primary} style={styles.statIcon} />
          <Text style={styles.statValue}>{formatPercent(avgMargin)}</Text>
          <Text style={styles.statLabel}>Marge moyenne</Text>
        </Card>
      </View>

      {sorted.map((p) => {
        const servings = allServings[p.id] || [];

        return (
          <TouchableOpacity
            key={p.id}
            activeOpacity={0.7}
            onPress={() => navigateToProduct(p.id)}
          >
            <Card style={styles.productCard}>
              <View style={styles.productHeader}>
                <View style={[styles.productIndicator, { backgroundColor: MARGIN_COLOR_MAP[p.computed.colorCode] }]} />
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.productPrice}>
                    Achat : {formatPrice(p.purchasePriceHT)} HT
                  </Text>
                </View>
                <View style={styles.productMarginBadge}>
                  <Text style={[styles.productMarginText, { color: MARGIN_COLOR_MAP[p.computed.colorCode] }]}>
                    {formatPercent(p.computed.marginPercent)}
                  </Text>
                  <Text style={styles.productSellingPrice}>
                    {formatPrice(p.computed.sellingPriceTTC)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.grayMedium} />
              </View>

              {servings.length > 0 && (
                <View style={styles.servingsTable}>
                  <View style={styles.servingsHeader}>
                    <Text style={[styles.servingsHeaderCell, styles.servingsNameCell]}>Service</Text>
                    <Text style={styles.servingsHeaderCell}>Prix TTC</Text>
                    <Text style={styles.servingsHeaderCell}>Marge</Text>
                    <Text style={styles.servingsHeaderCell}>Coeff</Text>
                  </View>
                  {servings.map((s) => {
                    const coeff = s.costPerServingHT > 0
                      ? s.sellingPriceHT / s.costPerServingHT
                      : 0;
                    return (
                      <View key={s.servingType.id} style={styles.servingsRow}>
                        <View style={styles.servingsNameCell}>
                          <Text style={styles.servingName}>{s.servingType.name}</Text>
                          <Text style={styles.servingVol}>{s.servingType.volumeCl} cl</Text>
                        </View>
                        <Text style={styles.servingCell}>{formatPrice(s.sellingPriceTTC)}</Text>
                        <Text style={[styles.servingCell, styles.servingCellBold, { color: MARGIN_COLOR_MAP[s.colorCode] }]}>
                          {formatPercent(s.marginPercent)}
                        </Text>
                        <Text style={styles.servingCell}>x{coeff.toFixed(1)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          </TouchableOpacity>
        );
      })}

      {products.length === 0 && !loadingPref && (
        <View style={styles.emptyState}>
          <Ionicons name="analytics-outline" size={48} color={colors.grayMedium} />
          <Text style={styles.emptyText}>Ajoutez des produits pour voir vos statistiques</Text>
        </View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  greeting: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statIcon: {
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: 2,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  // Product cards
  productCard: {
    marginBottom: spacing.sm,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productIndicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  productPrice: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  productMarginBadge: {
    marginRight: spacing.sm,
  },
  productMarginText: {
    ...typography.body,
    fontWeight: '700',
  },
  productSellingPrice: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 1,
  },
  // Servings table
  servingsTable: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  servingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  servingsHeaderCell: {
    ...typography.caption,
    color: colors.grayMedium,
    fontSize: 10,
    textTransform: 'uppercase',
    textAlign: 'center',
    flex: 1,
  },
  servingsNameCell: {
    flex: 1.5,
    textAlign: 'left',
  },
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  servingName: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  servingVol: {
    fontSize: 10,
    color: colors.grayMedium,
  },
  servingCell: {
    ...typography.caption,
    color: colors.text,
    textAlign: 'center',
    flex: 1,
  },
  servingCellBold: {
    fontWeight: '700',
  },
  // Welcome
  welcomeCard: {
    marginBottom: spacing.lg,
    backgroundColor: colors.primary,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  welcomeTitle: {
    ...typography.h3,
    color: colors.white,
    marginBottom: spacing.sm,
    paddingRight: spacing.xl,
  },
  welcomeText: {
    ...typography.bodySmall,
    color: colors.white,
    opacity: 0.9,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  welcomePrivacy: {
    ...typography.caption,
    color: colors.white,
    opacity: 0.7,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.grayMedium,
    textAlign: 'center',
  },
});
