import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { alert } from '../../utils/alert';
import * as adminService from '../../services/admin.service';
import type { AdminProduct } from '../../services/admin.service';
import { formatPrice, formatPercent } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

type Props = NativeStackScreenProps<any, 'AdminProducts'>;

export function AdminProductsScreen({ navigation }: Props) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getAllProducts();
      setProducts(data);
    } catch {
      alert('Erreur', 'Impossible de charger les produits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const users = Array.from(
    new Map(
      products
        .filter((p) => p.user)
        .map((p) => [p.user!.id, p.user!]),
    ).values(),
  );

  const filtered = filter === 'all'
    ? products
    : products.filter((p) => p.user?.id === filter);

  const avgMargin = filtered.length > 0
    ? filtered.reduce((sum, p) => sum + p.marginPercent, 0) / filtered.length
    : 0;

  return (
    <ScreenWrapper>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Tous les produits</Text>
        <TouchableOpacity onPress={load} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{filtered.length}</Text>
          <Text style={styles.statLabel}>Produits</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{users.length}</Text>
          <Text style={styles.statLabel}>Utilisateurs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, {
            color: avgMargin >= 70 ? colors.marginGreen : avgMargin >= 50 ? colors.marginOrange : colors.marginRed,
          }]}>
            {formatPercent(avgMargin)}
          </Text>
          <Text style={styles.statLabel}>Marge moy.</Text>
        </View>
      </View>

      {/* User filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Tous ({products.length})
          </Text>
        </TouchableOpacity>
        {users.map((u) => {
          const count = products.filter((p) => p.user?.id === u.id).length;
          return (
            <TouchableOpacity
              key={u.id}
              style={[styles.filterChip, filter === u.id && styles.filterChipActive]}
              onPress={() => setFilter(u.id)}
            >
              <Text style={[styles.filterText, filter === u.id && styles.filterTextActive]} numberOfLines={1}>
                {u.businessName || u.email.split('@')[0]} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Product list */}
      {loading ? (
        <Text style={styles.emptyText}>Chargement...</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.emptyText}>Aucun produit.</Text>
      ) : (
        filtered.map((p) => {
          const marginColor = p.marginPercent >= 70
            ? colors.marginGreen
            : p.marginPercent >= 50
              ? colors.marginOrange
              : colors.marginRed;
          return (
            <View key={p.id} style={styles.productCard}>
              <View style={styles.productTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.productUser} numberOfLines={1}>
                    {p.user?.businessName || p.user?.email || '—'}
                  </Text>
                </View>
                <View style={styles.marginBadge}>
                  <Text style={[styles.marginValue, { color: marginColor }]}>
                    {formatPercent(p.marginPercent)}
                  </Text>
                </View>
              </View>
              <View style={styles.productDetails}>
                <Text style={styles.detailText}>{p.category}</Text>
                <Text style={styles.detailDot}>·</Text>
                <Text style={styles.detailText}>Achat {formatPrice(p.purchasePriceHT)} HT</Text>
                <Text style={styles.detailDot}>·</Text>
                <Text style={styles.detailText}>Vente {formatPrice(p.sellingPriceTTC)} TTC</Text>
                <Text style={styles.detailDot}>·</Text>
                <Text style={styles.detailText}>x{p.coefficient.toFixed(1)}</Text>
              </View>
              <View style={styles.productDetails}>
                <Text style={styles.detailText}>{p.containerVolumeCl} cl</Text>
                {p.alcoholDegree > 0 && (
                  <>
                    <Text style={styles.detailDot}>·</Text>
                    <Text style={styles.detailText}>{p.alcoholDegree}°</Text>
                  </>
                )}
                {p.supplier && (
                  <>
                    <Text style={styles.detailDot}>·</Text>
                    <Text style={styles.detailText}>{p.supplier}</Text>
                  </>
                )}
              </View>
              {p.servings.length > 0 && (
                <View style={styles.servingsRow}>
                  {p.servings.map((s, i) => (
                    <View key={i} style={styles.servingChip}>
                      <Text style={styles.servingText}>
                        {s.name} {s.volumeCl} cl — {formatPrice(s.sellingPriceTTC)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.primary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    ...typography.h3,
    color: colors.primary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  filterScroll: {
    marginBottom: spacing.md,
    maxHeight: 40,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
    marginRight: spacing.xs,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    maxWidth: 150,
  },
  filterTextActive: {
    color: colors.white,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  productCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    ...shadows.sm,
  },
  productTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  productName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  productUser: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
    marginTop: 2,
  },
  marginBadge: {
    marginLeft: spacing.sm,
    alignItems: 'flex-end',
  },
  marginValue: {
    ...typography.h3,
    fontWeight: '800',
  },
  productDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 2,
  },
  detailText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  detailDot: {
    ...typography.caption,
    color: colors.border,
  },
  servingsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  servingChip: {
    backgroundColor: colors.light,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  servingText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    fontSize: 10,
  },
});
