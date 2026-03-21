import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { ProductWithMargin, formatPercent, MARGIN_COLOR_MAP } from '@margebar/shared';
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
  const top5 = sorted.slice(0, 5);
  const bottom5 = sorted.slice(-5).reverse();

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
          <View style={styles.sectionHeader}>
            <Ionicons name="arrow-up-circle-outline" size={18} color={colors.marginGreen} />
            <Text style={styles.sectionTitle}>Top rentabilité</Text>
          </View>
          <Card style={styles.rankCard}>
            {top5.map((p, idx) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.rankItem, idx === top5.length - 1 && styles.rankItemLast]}
                onPress={() => navigateToProduct(p.id)}
                activeOpacity={0.6}
              >
                <View style={[styles.rankDot, { backgroundColor: MARGIN_COLOR_MAP[p.computed.colorCode] }]} />
                <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.rankMargin, { color: MARGIN_COLOR_MAP[p.computed.colorCode] }]}>
                  {formatPercent(p.computed.marginPercent)}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.grayMedium} />
              </TouchableOpacity>
            ))}
          </Card>

          <View style={styles.sectionHeader}>
            <Ionicons name="arrow-down-circle-outline" size={18} color={colors.marginOrange} />
            <Text style={styles.sectionTitle}>Marges les plus faibles</Text>
          </View>
          <Card style={styles.rankCard}>
            {bottom5.map((p, idx) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.rankItem, idx === bottom5.length - 1 && styles.rankItemLast]}
                onPress={() => navigateToProduct(p.id)}
                activeOpacity={0.6}
              >
                <View style={[styles.rankDot, { backgroundColor: MARGIN_COLOR_MAP[p.computed.colorCode] }]} />
                <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.rankMargin, { color: MARGIN_COLOR_MAP[p.computed.colorCode] }]}>
                  {formatPercent(p.computed.marginPercent)}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.grayMedium} />
              </TouchableOpacity>
            ))}
          </Card>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  rankCard: {
    marginBottom: spacing.lg,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rankItemLast: {
    borderBottomWidth: 0,
  },
  rankDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  rankName: {
    ...typography.bodySmall,
    flex: 1,
    color: colors.text,
  },
  rankMargin: {
    ...typography.bodySmall,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
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
