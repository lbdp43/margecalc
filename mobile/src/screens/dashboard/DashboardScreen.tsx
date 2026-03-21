import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ProductWithMargin, formatPrice, formatPercent, MARGIN_COLOR_MAP } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Card } from '../../components/ui/Card';
import * as productService from '../../services/product.service';
import { useAuthStore } from '../../store/auth.store';
import { colors, spacing, typography } from '../../theme';

export function DashboardScreen() {
  const user = useAuthStore((s) => s.user);
  const { data: products = [] } = useQuery<ProductWithMargin[]>({
    queryKey: ['products'],
    queryFn: () => productService.getProducts(),
  });

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

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{products.length}</Text>
          <Text style={styles.statLabel}>Produits</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statValue}>{formatPercent(avgMargin)}</Text>
          <Text style={styles.statLabel}>Marge moyenne</Text>
        </Card>
      </View>

      {products.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Top rentabilité</Text>
          {top5.map((p) => (
            <View key={p.id} style={styles.rankItem}>
              <View style={[styles.dot, { backgroundColor: MARGIN_COLOR_MAP[p.computed.colorCode] }]} />
              <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.rankMargin, { color: MARGIN_COLOR_MAP[p.computed.colorCode] }]}>
                {formatPercent(p.computed.marginPercent)}
              </Text>
            </View>
          ))}

          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Marges les plus faibles</Text>
          {bottom5.map((p) => (
            <View key={p.id} style={styles.rankItem}>
              <View style={[styles.dot, { backgroundColor: MARGIN_COLOR_MAP[p.computed.colorCode] }]} />
              <Text style={styles.rankName} numberOfLines={1}>{p.name}</Text>
              <Text style={[styles.rankMargin, { color: MARGIN_COLOR_MAP[p.computed.colorCode] }]}>
                {formatPercent(p.computed.marginPercent)}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  greeting: {
    ...typography.bodySmall,
    color: colors.textSecondary,
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
    paddingVertical: spacing.lg,
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  rankName: {
    ...typography.body,
    flex: 1,
    color: colors.text,
  },
  rankMargin: {
    ...typography.body,
    fontWeight: '700',
  },
});
