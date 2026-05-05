import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alert } from '../../utils/alert';
import * as adminService from '../../services/admin.service';
import type { AdminUser, AdminUsersStats, AdminRevenue, AdminProduct } from '../../services/admin.service';
import { formatPrice, formatPercent } from '@margebar/shared';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

const SUB_BADGE: Record<string, { label: string; color: string }> = {
  active: { label: 'Actif', color: colors.marginGreen },
  trialing: { label: 'Essai', color: colors.accent },
  none: { label: 'Aucun', color: colors.textSecondary },
  canceled: { label: 'Annule', color: colors.marginRed },
  past_due: { label: 'Retard', color: colors.marginOrange },
};

function formatRelative(iso: string | null): string {
  if (!iso) return 'jamais connecte';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'a l\'instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `il y a ${diffD} j`;
  if (diffD < 30) return `il y a ${Math.floor(diffD / 7)} sem.`;
  if (diffD < 365) return `il y a ${Math.floor(diffD / 30)} mois`;
  return `il y a ${Math.floor(diffD / 365)} an${Math.floor(diffD / 365) > 1 ? 's' : ''}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function AdminUsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminUsersStats | null>(null);
  const [revenue, setRevenue] = useState<AdminRevenue | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userProducts, setUserProducts] = useState<AdminProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getAdminUsers();
      setUsers(data.users);
      setStats(data.stats);
      setRevenue(data.revenue);
    } catch {
      alert('Erreur', 'Impossible de charger les utilisateurs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openUserProducts = async (user: AdminUser) => {
    setSelectedUser(user);
    setLoadingProducts(true);
    setUserProducts([]);
    try {
      const products = await adminService.getAdminUserProducts(user.id);
      setUserProducts(products);
    } catch {
      alert('Erreur', 'Impossible de charger les produits de cet utilisateur.');
    } finally {
      setLoadingProducts(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.accent, { backgroundColor: colors.primary }]} />
        <Text style={styles.title}>Utilisateurs</Text>
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark" size={14} color={colors.textLight} />
          <Text style={styles.badgeText}>Admin</Text>
        </View>
        <TouchableOpacity
          style={styles.reloadBtn}
          onPress={load}
          disabled={loading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="refresh" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Stats */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.marginGreen }]}>{stats.active}</Text>
              <Text style={styles.statLabel}>Actifs</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.accent }]}>{stats.trialing}</Text>
              <Text style={styles.statLabel}>Essai</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.textSecondary }]}>
                {stats.none + stats.canceled}
              </Text>
              <Text style={styles.statLabel}>Sans abo.</Text>
            </View>
          </View>
        )}

        {/* Revenue */}
        {revenue && (
          <View style={styles.revenueCard}>
            <View style={styles.revenueHeader}>
              <Ionicons name="wallet-outline" size={16} color={colors.primary} />
              <Text style={styles.revenueTitle}>Revenu (abonnements)</Text>
            </View>
            <Text style={styles.revenueSubscribers}>
              {revenue.paidSubscribers} abonne{revenue.paidSubscribers > 1 ? 's' : ''} payant{revenue.paidSubscribers > 1 ? 's' : ''}
              {revenue.paidSubscribers > 0 && (
                <Text style={styles.revenueBreakdown}>
                  {' '}· {revenue.monthlyCount} mensuel{revenue.monthlyCount > 1 ? 's' : ''}
                  {' '}· {revenue.yearlyCount} annuel{revenue.yearlyCount > 1 ? 's' : ''}
                </Text>
              )}
            </Text>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Mensuel</Text>
              <View style={styles.revenueValues}>
                <Text style={styles.revenueTTC}>{formatPrice(revenue.mrrTTC)} TTC</Text>
                <Text style={styles.revenueHT}>{formatPrice(revenue.mrrHT)} HT</Text>
              </View>
            </View>
            <View style={styles.revenueRow}>
              <Text style={styles.revenueLabel}>Annuel</Text>
              <View style={styles.revenueValues}>
                <Text style={styles.revenueTTC}>{formatPrice(revenue.arrTTC)} TTC</Text>
                <Text style={styles.revenueHT}>{formatPrice(revenue.arrHT)} HT</Text>
              </View>
            </View>
            <Text style={styles.revenueFootnote}>
              TVA {Math.round(revenue.vatRate * 100)}% (taux standard SaaS) — tarifs affiches sur la page d'abonnement
            </Text>
          </View>
        )}

        {/* Users list */}
        {loading && users.length === 0 ? (
          <Text style={styles.emptyText}>Chargement...</Text>
        ) : users.length === 0 ? (
          <Text style={styles.emptyText}>Aucun utilisateur.</Text>
        ) : (
          users.map((u) => {
            const sub = SUB_BADGE[u.subscriptionStatus] || SUB_BADGE.none;
            const isAdmin = u.role === 'admin';
            return (
              <TouchableOpacity key={u.id} style={styles.userRow} onPress={() => openUserProducts(u)} activeOpacity={0.7}>
                <View style={styles.userMain}>
                  <View style={styles.userNameRow}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {u.businessName || u.email}
                    </Text>
                    {isAdmin && (
                      <View style={styles.adminChip}>
                        <Ionicons name="shield-checkmark" size={10} color={colors.textLight} />
                      </View>
                    )}
                  </View>
                  {u.businessName && (
                    <Text style={styles.userEmail} numberOfLines={1}>{u.email}</Text>
                  )}
                  <View style={styles.userMetaRow}>
                    <Ionicons name="calendar-outline" size={11} color={colors.textSecondary} />
                    <Text style={styles.userMeta}>Inscrit le {formatDate(u.createdAt)}</Text>
                  </View>
                  <View style={styles.userMetaRow}>
                    <Ionicons name="time-outline" size={11} color={colors.textSecondary} />
                    <Text
                      style={[
                        styles.userMeta,
                        !u.lastSeenAt && { fontStyle: 'italic' },
                      ]}
                    >
                      {u.lastSeenAt ? `Actif ${formatRelative(u.lastSeenAt)}` : 'Jamais connecte'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.subBadge, { backgroundColor: sub.color }]}>
                  <Text style={styles.subBadgeText}>{sub.label}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* User products modal */}
      <Modal
        visible={!!selectedUser}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.productsOverlay}>
          <View style={styles.productsSheet}>
            <View style={styles.productsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productsTitle}>
                  {selectedUser?.businessName || selectedUser?.email}
                </Text>
                <Text style={styles.productsSubtitle}>
                  {userProducts.length} produit{userProducts.length > 1 ? 's' : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedUser(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.productsContent}>
              {loadingProducts ? (
                <Text style={styles.productsEmpty}>Chargement...</Text>
              ) : userProducts.length === 0 ? (
                <Text style={styles.productsEmpty}>Aucun produit enregistre.</Text>
              ) : (
                userProducts.map((p) => {
                  const marginColor = p.marginPercent >= 70
                    ? colors.marginGreen
                    : p.marginPercent >= 50
                      ? colors.marginOrange
                      : colors.marginRed;
                  return (
                    <View key={p.id} style={styles.productCard}>
                      <View style={styles.productHeader}>
                        <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                        <Text style={[styles.productMargin, { color: marginColor }]}>
                          {formatPercent(p.marginPercent)}
                        </Text>
                      </View>
                      <View style={styles.productMeta}>
                        <Text style={styles.productMetaText}>{p.category}</Text>
                        <Text style={styles.productMetaText}>·</Text>
                        <Text style={styles.productMetaText}>Achat : {formatPrice(p.purchasePriceHT)} HT</Text>
                        <Text style={styles.productMetaText}>·</Text>
                        <Text style={styles.productMetaText}>Vente : {formatPrice(p.sellingPriceTTC)} TTC</Text>
                      </View>
                      <View style={styles.productMeta}>
                        <Text style={styles.productMetaText}>{p.containerVolumeCl} cl</Text>
                        {p.alcoholDegree > 0 && (
                          <>
                            <Text style={styles.productMetaText}>·</Text>
                            <Text style={styles.productMetaText}>{p.alcoholDegree}°</Text>
                          </>
                        )}
                        {p.supplier && (
                          <>
                            <Text style={styles.productMetaText}>·</Text>
                            <Text style={styles.productMetaText}>{p.supplier}</Text>
                          </>
                        )}
                        <Text style={styles.productMetaText}>·</Text>
                        <Text style={styles.productMetaText}>x{p.coefficient.toFixed(1)}</Text>
                      </View>
                      {p.servings.length > 0 && (
                        <View style={styles.servingsRow}>
                          {p.servings.map((s, i) => (
                            <View key={i} style={styles.servingChip}>
                              <Text style={styles.servingChipText}>
                                {s.name} ({s.volumeCl} cl) : {formatPrice(s.sellingPriceTTC)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  accent: {
    width: 4,
    height: 20,
    borderRadius: 2,
  },
  title: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    ...typography.caption,
    color: colors.textLight,
    fontWeight: '700',
  },
  reloadBtn: {
    padding: 4,
    marginLeft: 4,
  },
  body: {
    padding: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    ...typography.h2,
    color: colors.primary,
    fontSize: 22,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  revenueCard: {
    backgroundColor: colors.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  revenueTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  },
  revenueSubscribers: {
    ...typography.bodySmall,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  revenueBreakdown: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  revenueLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  revenueValues: {
    alignItems: 'flex-end',
  },
  revenueTTC: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  },
  revenueHT: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  revenueFootnote: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    fontSize: 10,
    lineHeight: 14,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  userMain: {
    flex: 1,
    marginRight: spacing.sm,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  userName: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  adminChip: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userEmail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  userMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  subBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  subBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.white,
    fontSize: 10,
  },
  productsOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  productsSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '85%',
    ...shadows.lg,
  },
  productsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productsTitle: {
    ...typography.h3,
    color: colors.primary,
  },
  productsSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  productsContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  productsEmpty: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  productCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  productName: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  productMargin: {
    ...typography.h3,
    fontWeight: '800',
  },
  productMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 2,
  },
  productMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
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
  servingChipText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    fontSize: 10,
  },
});
