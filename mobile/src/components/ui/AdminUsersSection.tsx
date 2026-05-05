import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alert, confirm } from '../../utils/alert';
import * as adminService from '../../services/admin.service';
import type { AdminUser, AdminUsersStats, AdminRevenue, AdminProduct, LoginSeriesResponse, GlobalLoginSeriesResponse } from '../../services/admin.service';
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
  const [logins, setLogins] = useState<LoginSeriesResponse | null>(null);
  const [loginsLoading, setLoginsLoading] = useState(false);
  const [loginPeriod, setLoginPeriod] = useState<'1m' | '3m' | '12m' | '24m'>('1m');
  const [globalLogins, setGlobalLogins] = useState<GlobalLoginSeriesResponse | null>(null);
  const [globalLoginsLoading, setGlobalLoginsLoading] = useState(false);
  const [globalPeriod, setGlobalPeriod] = useState<'1m' | '3m' | '12m' | '24m'>('1m');

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

  const periodMonths: Record<typeof loginPeriod, number> = { '1m': 1, '3m': 3, '12m': 12, '24m': 24 };

  const computeRange = (period: '1m' | '3m' | '12m' | '24m'): { from: string; to: string } => {
    const now = new Date();
    const toDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (periodMonths[period] - 1), 1));
    const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { from: fmt(fromDate), to: fmt(toDate) };
  };

  const loadLogins = useCallback(async (userId: string, period: '1m' | '3m' | '12m' | '24m') => {
    setLoginsLoading(true);
    try {
      const { from, to } = computeRange(period);
      const data = await adminService.getUserLogins(userId, from, to);
      setLogins(data);
    } catch {
      setLogins(null);
    } finally {
      setLoginsLoading(false);
    }
  }, []);

  const loadGlobalLogins = useCallback(async (period: '1m' | '3m' | '12m' | '24m') => {
    setGlobalLoginsLoading(true);
    try {
      const { from, to } = computeRange(period);
      const data = await adminService.getGlobalLogins(from, to);
      setGlobalLogins(data);
    } catch {
      setGlobalLogins(null);
    } finally {
      setGlobalLoginsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGlobalLogins(globalPeriod);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openUserProducts = async (user: AdminUser) => {
    setSelectedUser(user);
    setLoadingProducts(true);
    setUserProducts([]);
    setLogins(null);
    setLoginPeriod('1m');
    loadLogins(user.id, '1m');
    try {
      const products = await adminService.getAdminUserProducts(user.id);
      setUserProducts(products);
    } catch {
      alert('Erreur', 'Impossible de charger les produits de cet utilisateur.');
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleBanToggle = (user: AdminUser) => {
    const isBanned = !!user.bannedAt;
    const verb = isBanned ? 'débannir' : 'bannir';
    confirm(
      isBanned ? 'Débannir cet utilisateur ?' : 'Bannir cet utilisateur ?',
      isBanned
        ? `${user.businessName || user.email} pourra de nouveau se connecter.`
        : `${user.businessName || user.email} ne pourra plus se connecter. Ses données restent conservées.`,
      async () => {
        try {
          const updated = isBanned
            ? await adminService.unbanUser(user.id)
            : await adminService.banUser(user.id);
          setUsers((prev) =>
            prev.map((u) => (u.id === user.id ? { ...u, bannedAt: updated.bannedAt } : u)),
          );
          if (selectedUser?.id === user.id) {
            setSelectedUser({ ...user, bannedAt: updated.bannedAt });
          }
          alert('Succès', isBanned ? 'Utilisateur débanni.' : 'Utilisateur banni.');
        } catch (err: any) {
          alert('Erreur', err?.response?.data?.error || `Impossible de ${verb} l'utilisateur.`);
        }
      },
      isBanned ? 'Débannir' : 'Bannir',
      !isBanned, // destructive style only when banning
    );
  };

  const handleDelete = (user: AdminUser) => {
    confirm(
      'Supprimer définitivement ce compte ?',
      `Tous les produits, recettes, factures et données de ${user.businessName || user.email} seront supprimés. Cette action est irréversible.`,
      async () => {
        try {
          await adminService.deleteUser(user.id);
          setUsers((prev) => prev.filter((u) => u.id !== user.id));
          if (selectedUser?.id === user.id) setSelectedUser(null);
          alert('Compte supprimé', `${user.email} a été supprimé.`);
        } catch (err: any) {
          alert('Erreur', err?.response?.data?.error || 'Impossible de supprimer l\'utilisateur.');
        }
      },
      'Supprimer définitivement',
      true,
    );
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

        {/* Global logins (all users) */}
        <View style={styles.loginsCard}>
          <View style={styles.loginsHeader}>
            <Ionicons name="log-in-outline" size={16} color={colors.primary} />
            <Text style={styles.loginsTitle}>Connexions (tous utilisateurs)</Text>
            <Text style={styles.loginsTotal}>
              {globalLoginsLoading ? '…' : (globalLogins?.total ?? 0)}
            </Text>
          </View>
          {globalLogins && (
            <Text style={styles.globalLoginsSub}>
              {globalLogins.activeUsers} utilisateur{globalLogins.activeUsers > 1 ? 's' : ''} actif{globalLogins.activeUsers > 1 ? 's' : ''} sur la période
            </Text>
          )}
          <View style={styles.periodRow}>
            {(['1m', '3m', '12m', '24m'] as const).map((p) => {
              const labels = { '1m': 'Ce mois', '3m': 'Trimestre', '12m': 'Année', '24m': '2 ans' };
              const active = globalPeriod === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodChip, active && styles.periodChipActive]}
                  onPress={() => {
                    setGlobalPeriod(p);
                    loadGlobalLogins(p);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
                    {labels[p]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {globalLogins && globalLogins.series.length > 1 && (
            <View style={styles.miniChart}>
              {(() => {
                const max = Math.max(...globalLogins.series.map((s) => s.count), 1);
                return globalLogins.series.map((s, i) => {
                  const pct = (s.count / max) * 100;
                  return (
                    <View key={i} style={styles.miniBarCol}>
                      <Text style={styles.miniBarValue}>{s.count > 0 ? s.count : ''}</Text>
                      <View style={styles.miniBarTrack}>
                        <View style={[styles.miniBar, { height: `${Math.max(pct, 2)}%` }]} />
                      </View>
                      <Text style={styles.miniBarLabel}>{s.month.slice(5)}</Text>
                    </View>
                  );
                });
              })()}
            </View>
          )}
        </View>

        {/* Users list */}
        {loading && users.length === 0 ? (
          <Text style={styles.emptyText}>Chargement...</Text>
        ) : users.length === 0 ? (
          <Text style={styles.emptyText}>Aucun utilisateur.</Text>
        ) : (
          users.map((u) => {
            const sub = SUB_BADGE[u.subscriptionStatus] || SUB_BADGE.none;
            const isAdmin = u.role === 'admin';
            const isBanned = !!u.bannedAt;
            return (
              <TouchableOpacity
                key={u.id}
                style={[styles.userRow, isBanned && styles.userRowBanned]}
                onPress={() => openUserProducts(u)}
                activeOpacity={0.7}
              >
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
                    {isBanned && (
                      <View style={styles.bannedChip}>
                        <Ionicons name="ban-outline" size={10} color={colors.textLight} />
                        <Text style={styles.bannedChipText}>Banni</Text>
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
                  <View style={styles.userMetaRow}>
                    <Ionicons name="log-in-outline" size={11} color={colors.textSecondary} />
                    <Text style={styles.userMeta}>
                      {u.loginsThisMonth} ce mois{u.loginsTotal > u.loginsThisMonth ? ` · ${u.loginsTotal} au total` : ''}
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
                  {selectedUser?.bannedAt && ' · banni'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedUser(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedUser && selectedUser.role !== 'admin' && (
              <View style={styles.adminActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.adminActionBtn,
                    selectedUser.bannedAt ? styles.adminActionBtnUnban : styles.adminActionBtnBan,
                  ]}
                  onPress={() => handleBanToggle(selectedUser)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={selectedUser.bannedAt ? 'lock-open-outline' : 'ban-outline'}
                    size={14}
                    color={colors.textLight}
                  />
                  <Text style={styles.adminActionBtnText}>
                    {selectedUser.bannedAt ? 'Débannir' : 'Bannir'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.adminActionBtn, styles.adminActionBtnDelete]}
                  onPress={() => handleDelete(selectedUser)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={14} color={colors.textLight} />
                  <Text style={styles.adminActionBtnText}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView contentContainerStyle={styles.productsContent}>
              {/* Login stats */}
              <View style={styles.loginsCard}>
                <View style={styles.loginsHeader}>
                  <Ionicons name="log-in-outline" size={16} color={colors.primary} />
                  <Text style={styles.loginsTitle}>Connexions</Text>
                  <Text style={styles.loginsTotal}>
                    {loginsLoading ? '…' : (logins?.total ?? 0)}
                  </Text>
                </View>
                <View style={styles.periodRow}>
                  {(['1m', '3m', '12m', '24m'] as const).map((p) => {
                    const labels = { '1m': 'Ce mois', '3m': 'Trimestre', '12m': 'Année', '24m': '2 ans' };
                    const active = loginPeriod === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.periodChip, active && styles.periodChipActive]}
                        onPress={() => {
                          setLoginPeriod(p);
                          if (selectedUser) loadLogins(selectedUser.id, p);
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
                          {labels[p]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {logins && logins.series.length > 1 && (
                  <View style={styles.miniChart}>
                    {(() => {
                      const max = Math.max(...logins.series.map((s) => s.count), 1);
                      return logins.series.map((s, i) => {
                        const pct = (s.count / max) * 100;
                        return (
                          <View key={i} style={styles.miniBarCol}>
                            <View style={[styles.miniBar, { height: `${Math.max(pct, 2)}%` }]} />
                            <Text style={styles.miniBarLabel}>{s.month.slice(5)}</Text>
                          </View>
                        );
                      });
                    })()}
                  </View>
                )}
              </View>

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
  userRowBanned: {
    opacity: 0.6,
    borderLeftColor: colors.marginRed,
  },
  bannedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.marginRed,
    borderRadius: borderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  bannedChipText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.textLight,
    textTransform: 'uppercase',
  },
  adminActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  adminActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
  },
  adminActionBtnBan: {
    backgroundColor: colors.marginOrange,
  },
  adminActionBtnUnban: {
    backgroundColor: colors.primary,
  },
  adminActionBtnDelete: {
    backgroundColor: colors.marginRed,
  },
  adminActionBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textLight,
    letterSpacing: 0.3,
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
  loginsCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  loginsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  loginsTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
  },
  loginsTotal: {
    ...typography.h3,
    fontWeight: '800',
    color: colors.text,
  },
  globalLoginsSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.sm,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
  },
  periodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodChipTextActive: {
    color: colors.textLight,
    fontWeight: '700',
  },
  miniChart: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 110,
    gap: 4,
    marginTop: spacing.sm,
  },
  miniBarCol: {
    flex: 1,
    alignItems: 'center',
  },
  miniBarValue: {
    fontSize: 10,
    color: colors.text,
    fontWeight: '700',
    height: 14,
    lineHeight: 14,
    textAlign: 'center',
    width: '100%',
  },
  miniBarTrack: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  miniBar: {
    width: '70%',
    backgroundColor: colors.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    minHeight: 2,
  },
  miniBarLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
});
