import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alert } from '../../utils/alert';
import * as adminService from '../../services/admin.service';
import type { AdminUser, AdminUsersStats } from '../../services/admin.service';
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
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getAdminUsers();
      setUsers(data.users);
      setStats(data.stats);
    } catch {
      alert('Erreur', 'Impossible de charger les utilisateurs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
              <View key={u.id} style={styles.userRow}>
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
              </View>
            );
          })
        )}
      </View>
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
});
