import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin,
  formatPercent, formatPrice, MARGIN_COLOR_MAP,
} from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Card } from '../../components/ui/Card';
import * as productService from '../../services/product.service';
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
  useEffect(() => {
    AsyncStorage.getItem(WELCOME_DISMISSED_KEY).then((val) => {
      if (val === 'true') setWelcomeVisible(false);
      setLoadingPref(false);
    });
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

      {products.length > 0 && (
        <>
          {/* Top 5 rentabilité */}
          <Text style={styles.sectionTitle}>Top 5 rentabilité</Text>
          {sorted.slice(0, 5).map((p, index) => (
            <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => navigateToProduct(p.id)}>
              <Card style={styles.rankCard}>
                <View style={styles.rankRow}>
                  <View style={[styles.rankBadge, { backgroundColor: colors.marginGreen }]}>
                    <Text style={styles.rankNumber}>{index + 1}</Text>
                  </View>
                  <View style={styles.rankInfo}>
                    <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.rankDetail}>
                      Achat {formatPrice(p.purchasePriceHT)} HT · Vente {formatPrice(p.computed.sellingPriceTTC)} TTC
                    </Text>
                  </View>
                  <View style={styles.rankMargin}>
                    <Text style={[styles.rankMarginText, { color: MARGIN_COLOR_MAP[p.computed.colorCode] }]}>
                      {formatPercent(p.computed.marginPercent)}
                    </Text>
                    <Text style={styles.rankCoeff}>x{p.computed.coefficient.toFixed(1)}</Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))}

          {/* Flop 5 rentabilité */}
          {sorted.length > 1 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Flop 5 rentabilité</Text>
              {[...sorted].reverse().slice(0, Math.min(5, sorted.length)).filter((p) => !sorted.slice(0, 5).find((t) => t.id === p.id)).map((p, index) => (
                <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => navigateToProduct(p.id)}>
                  <Card style={styles.rankCard}>
                    <View style={styles.rankRow}>
                      <View style={[styles.rankBadge, { backgroundColor: colors.marginRed }]}>
                        <Text style={styles.rankNumber}>{index + 1}</Text>
                      </View>
                      <View style={styles.rankInfo}>
                        <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.rankDetail}>
                          Achat {formatPrice(p.purchasePriceHT)} HT · Vente {formatPrice(p.computed.sellingPriceTTC)} TTC
                        </Text>
                      </View>
                      <View style={styles.rankMargin}>
                        <Text style={[styles.rankMarginText, { color: MARGIN_COLOR_MAP[p.computed.colorCode] }]}>
                          {formatPercent(p.computed.marginPercent)}
                        </Text>
                        <Text style={styles.rankCoeff}>x{p.computed.coefficient.toFixed(1)}</Text>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </>
          )}
        </>
      )}

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
  // Top/Flop sections
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  rankCard: {
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  rankNumber: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.white,
  },
  rankInfo: {
    flex: 1,
  },
  rankName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  rankDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rankMargin: {
    alignItems: 'flex-end',
  },
  rankMarginText: {
    ...typography.body,
    fontWeight: '700',
  },
  rankCoeff: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
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
