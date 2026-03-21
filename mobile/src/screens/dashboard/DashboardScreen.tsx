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
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

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

  const renderRankItem = (p: ProductWithMargin, index: number, badgeColor: string) => (
    <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => navigateToProduct(p.id)}>
      <View style={styles.rankCard}>
        <View style={styles.rankRow}>
          <View style={[styles.rankBadge, { backgroundColor: badgeColor }]}>
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
        {p.servings && p.servings.length > 0 && (
          <View style={styles.rankServings}>
            {p.servings.map((s) => (
              <View key={s.id} style={styles.servingChip}>
                <Text style={styles.servingChipText}>
                  {s.servingType?.icon} {s.servingType?.name} {formatPrice(s.sellingPriceTTC)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenWrapper>
      {/* Hero Header */}
      <View style={styles.heroCard}>
        <View style={styles.heroContent}>
          <Text style={styles.heroGreeting}>Bonjour 👋</Text>
          <Text style={styles.heroTitle}>
            {user?.businessName || 'Mon établissement'}
          </Text>
        </View>

        {welcomeVisible && !loadingPref && (
          <View style={styles.heroDivider} />
        )}

        {welcomeVisible && !loadingPref && (
          <View style={styles.welcomeSection}>
            <TouchableOpacity style={styles.closeBtn} onPress={handleDismiss}>
              <Ionicons name="close" size={14} color={colors.textLight} />
            </TouchableOpacity>
            <View style={styles.welcomeIconRow}>
              <Ionicons name="information-circle-outline" size={18} color="rgba(255,255,255,0.8)" />
              <Text style={styles.welcomeTitle}>Bienvenue sur MargeBar</Text>
            </View>
            <Text style={styles.welcomeText}>
              Calculez vos marges sur chaque produit : spiritueux, vins, bières, softs...
              Ajoutez vos produits, choisissez votre méthode de calcul et visualisez votre rentabilité.
            </Text>
            <Text style={styles.welcomePrivacy}>
              🔒 Vos données sont privées et vous appartiennent.
            </Text>
          </View>
        )}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={styles.statIconContainer}>
            <Ionicons name="cube-outline" size={22} color={colors.accent} />
          </View>
          <Text style={styles.statValue}>{products.length}</Text>
          <Text style={styles.statLabel}>Produits</Text>
        </View>
        <View style={styles.statCard}>
          <View style={styles.statIconContainer}>
            <Ionicons name="trending-up-outline" size={22} color={colors.accent} />
          </View>
          <Text style={styles.statValue}>{formatPercent(avgMargin)}</Text>
          <Text style={styles.statLabel}>Marge moyenne</Text>
        </View>
      </View>

      {products.length > 0 && (
        <>
          {/* Top 5 rentabilité */}
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy-outline" size={18} color={colors.marginGreen} />
            <Text style={styles.sectionTitle}>Top 5 rentabilité</Text>
          </View>
          <View style={styles.sectionCard}>
            {sorted.slice(0, 5).map((p, index) => (
              <React.Fragment key={p.id}>
                {index > 0 && <View style={styles.listDivider} />}
                {renderRankItem(p, index, colors.marginGreen)}
              </React.Fragment>
            ))}
          </View>

          {/* Flop 5 rentabilité */}
          {sorted.length > 1 && (
            <>
              <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
                <Ionicons name="arrow-down-circle-outline" size={18} color={colors.marginRed} />
                <Text style={styles.sectionTitle}>Flop 5 rentabilité</Text>
              </View>
              <View style={styles.sectionCard}>
                {[...sorted].reverse().slice(0, Math.min(5, sorted.length)).filter((p) => !sorted.slice(0, 5).find((t) => t.id === p.id)).map((p, index) => (
                  <React.Fragment key={p.id}>
                    {index > 0 && <View style={styles.listDivider} />}
                    {renderRankItem(p, index, colors.marginRed)}
                  </React.Fragment>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {products.length === 0 && !loadingPref && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="analytics-outline" size={40} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>Aucun produit</Text>
          <Text style={styles.emptyText}>
            Ajoutez des produits pour voir vos statistiques de rentabilité
          </Text>
        </View>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  /* ── Hero Header ────────────────────────────────────────── */
  heroCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadows.lg,
  },
  heroContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  heroGreeting: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: spacing.xs,
  },
  heroTitle: {
    ...typography.h1,
    color: colors.textLight,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: spacing.lg,
  },

  /* ── Welcome (inside hero) ──────────────────────────────── */
  welcomeSection: {
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
  welcomeIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  welcomeTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textLight,
  },
  welcomeText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
    marginBottom: spacing.sm,
    paddingRight: spacing.xl,
  },
  welcomePrivacy: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 16,
  },

  /* ── Stats Row ──────────────────────────────────────────── */
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    ...typography.h1,
    color: colors.accent,
    marginBottom: 2,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* ── Section Headers ────────────────────────────────────── */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },

  /* ── Section Card (wrapping list) ───────────────────────── */
  sectionCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  listDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },

  /* ── Rank Items ─────────────────────────────────────────── */
  rankCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.sm,
  },
  rankNumber: {
    ...typography.bodySmall,
    fontWeight: '800',
    color: colors.textLight,
  },
  rankInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  rankName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  rankDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rankMargin: {
    alignItems: 'flex-end',
  },
  rankMarginText: {
    ...typography.h3,
    fontWeight: '800',
  },
  rankCoeff: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* ── Servings Chips ─────────────────────────────────────── */
  rankServings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginLeft: 32 + spacing.md,
  },
  servingChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  servingChipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  /* ── Empty State ────────────────────────────────────────── */
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
