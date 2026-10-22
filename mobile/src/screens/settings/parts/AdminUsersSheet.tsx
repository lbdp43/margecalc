/**
 * Administration › Utilisateurs (admins only), opened from Réglages.
 *
 *   const users = useAdminUsers(isAdmin);         // { data, isLoading, error, refetch }
 *   <AdminUsersSheet visible={open} onClose={() => setOpen(false)} />
 *
 * One full-height BottomSheet with two views (sheets never stack):
 * - list: search, account stats, monthly logins chart, user rows;
 * - detail: profile, activity, logins per period, products, and the
 *   « Suspendre / Réactiver » and « Supprimer » actions (confirm dialogs).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as adminService from '../../../services/admin.service';
import type { AdminProduct, AdminUser, AdminUsersResponse } from '../../../services/admin.service';
import { useAuthStore } from '../../../store/auth.store';
import { Avatar, Badge, Button, EmptyState, ListRow, SectionHeader, SegmentedControl, Skeleton, SwapFade, ValueRow, dialog } from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatNumber, formatVolumeCl, plural } from '../../../utils/format';
import { formatDate, formatLongDate, formatRelative, matches, readableError } from './helpers';
import { ErrorLine, MiniStat, Sheet, SheetBack, SheetFlash, SheetFlashValue, useSheetFlash } from './ui';

type Period = '1m' | '3m' | '12m' | '24m';
const PERIODS: { key: Period; label: string; months: number }[] = [
  { key: '1m', label: 'Ce mois', months: 1 },
  { key: '3m', label: '3 mois', months: 3 },
  { key: '12m', label: '12 mois', months: 12 },
  { key: '24m', label: '24 mois', months: 24 },
];
const PAGE = 40;
const USERS_KEY = ['admin', 'users'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function rangeOf(period: Period): { from: string; to: string } {
  const months = PERIODS.find((p) => p.key === period)?.months ?? 1;
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return { from: fmt(from), to: fmt(to) };
}

/** « Actif il y a 3 j », « Jamais connecté » */
const activity = (iso: string | null) => (iso ? `Actif ${formatRelative(iso)}` : 'Jamais connecté');

/** The admin users query (shared by the Réglages row and the sheet). */
export function useAdminUsers(enabled: boolean) {
  return useQuery<AdminUsersResponse>({
    queryKey: USERS_KEY,
    queryFn: adminService.getAdminUsers,
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}

/** « 59 comptes · 12 actifs ce mois » */
export function usersSummary(data?: AdminUsersResponse): string | undefined {
  if (!data) return undefined;
  const active = data.users.filter((u) => u.loginsThisMonth > 0).length;
  return `${plural(data.users.length, 'compte')} · ${plural(active, 'actif', 'actifs')} ce mois`;
}

// ─── Logins chart ──────────────────────────────────────────────────────────
function LoginsChart({ series }: { series: { month: string; count: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  const showEvery = series.length > 12 ? 3 : series.length > 6 ? 2 : 1;
  return (
    <View style={styles.chart} accessibilityRole="image" accessibilityLabel={series.map((s) => `${s.month} : ${s.count}`).join(', ')}>
      {series.map((s, i) => {
        const h = Math.max(3, Math.round((s.count / max) * 72));
        const month = Number(s.month.slice(5, 7)) - 1;
        return (
          <View key={s.month} style={styles.barCol}>
            <Text style={styles.barValue} numberOfLines={1}>
              {s.count > 0 && series.length <= 12 ? formatNumber(s.count) : ''}
            </Text>
            <View style={[styles.bar, { height: h, backgroundColor: s.count ? palette.em600 : palette.surface3 }]} />
            <Text style={styles.barLabel} numberOfLines={1}>
              {i % showEvery === 0 ? MONTHS[month] ?? '' : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function LoginsCard({ title, userId }: { title: string; userId?: string }) {
  const [period, setPeriod] = useState<Period>('3m');
  const q = useQuery({
    queryKey: ['admin', 'logins', userId ?? 'all', period],
    queryFn: () => {
      const { from, to } = rangeOf(period);
      return userId ? adminService.getUserLogins(userId, from, to) : adminService.getGlobalLogins(from, to);
    },
    staleTime: 60_000,
    retry: 1,
  });
  const data = q.data as (adminService.LoginSeriesResponse & { activeUsers?: number }) | undefined;
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        {data ? <Text style={styles.cardValue}>{formatNumber(data.total)}</Text> : <Skeleton width={36} height={18} />}
      </View>
      {data && data.activeUsers !== undefined ? (
        <Text style={styles.cardMeta}>{plural(data.activeUsers, 'compte actif', 'comptes actifs')} sur la période</Text>
      ) : null}
      <SegmentedControl
        options={PERIODS.map((p) => ({ key: p.key, label: p.label }))}
        value={period}
        onChange={(k) => setPeriod(k as Period)}
        height={36}
        accessibilityLabel="Période"
        style={{ marginTop: 12 }}
      />
      {q.error && !data ? (
        <Text style={[styles.cardMeta, { marginTop: 12, color: palette.bad }]}>{readableError(q.error, 'Connexions indisponibles.').message}</Text>
      ) : data && data.total === 0 ? (
        <Text style={[styles.cardMeta, { marginTop: 12 }]}>Aucune connexion sur la période.</Text>
      ) : data && data.series.length > 1 ? (
        <LoginsChart series={data.series} />
      ) : null}
    </View>
  );
}

// ─── Rows ──────────────────────────────────────────────────────────────────
const UserRow = React.memo(function UserRow({ user, onPress, divider }: { user: AdminUser; onPress: (u: AdminUser) => void; divider: boolean }) {
  const isAdmin = user.role === 'admin';
  const banned = !!user.bannedAt;
  const right = (
    <View style={styles.rowRight}>
      {banned ? <Badge zone="red" label="Suspendu" size="sm" noDot /> : isAdmin ? <Badge variant="brand" icon="shield-checkmark" label="Admin" size="sm" /> : null}
    </View>
  );
  return (
    <ListRow
      leading={<Avatar name={user.businessName || user.email} size={40} />}
      title={user.businessName || user.email}
      subtitle={`${user.businessName ? `${user.email}\n` : ''}${activity(user.lastSeenAt)}`}
      subtitleLines={2}
      right={right}
      onPress={() => onPress(user)}
      divider={divider}
      accessibilityLabel={`${user.businessName || user.email}, ${user.email}, ${activity(user.lastSeenAt).toLowerCase()}${banned ? ', suspendu' : ''}${isAdmin ? ', administrateur' : ''}`}
      testID="admin-user-row"
    />
  );
});

// ─── Sheet ─────────────────────────────────────────────────────────────────
export function AdminUsersSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const users = useAdminUsers(visible);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'ban' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, showFlash, clearFlash] = useSheetFlash();

  useEffect(() => {
    if (visible) {
      setSelectedId(null);
      setQuery('');
      setLimit(PAGE);
      setActionError(null);
      clearFlash();
    }
  }, [visible, clearFlash]);

  const all = users.data?.users ?? [];
  const filtered = useMemo(() => (query.trim() ? all.filter((u) => matches([u.businessName, u.email], query)) : all), [all, query]);
  const selected = selectedId ? all.find((u) => u.id === selectedId) ?? null : null;

  const stats = useMemo(
    () => ({
      total: all.length,
      active: all.filter((u) => u.loginsThisMonth > 0).length,
      banned: all.filter((u) => !!u.bannedAt).length,
    }),
    [all],
  );

  const patchUser = (id: string, patch: Partial<AdminUser> | null) => {
    qc.setQueryData<AdminUsersResponse>(USERS_KEY, (prev) =>
      prev
        ? {
            ...prev,
            users: patch === null ? prev.users.filter((u) => u.id !== id) : prev.users.map((u) => (u.id === id ? { ...u, ...patch } : u)),
          }
        : prev,
    );
  };

  const toggleBan = async (user: AdminUser) => {
    const banned = !!user.bannedAt;
    const name = user.businessName || user.email;
    const ok = await dialog.confirm(
      banned
        ? { title: 'Réactiver ce compte ?', message: `${name} pourra de nouveau se connecter.`, confirmLabel: 'Réactiver', icon: 'lock-open-outline' }
        : {
            title: 'Suspendre ce compte ?',
            message: `${name} ne pourra plus se connecter. Ses données sont conservées et vous pourrez réactiver le compte à tout moment.`,
            confirmLabel: 'Suspendre',
            destructive: true,
            icon: 'ban-outline',
          },
    );
    if (!ok) return;
    setBusy('ban');
    setActionError(null);
    try {
      const res = banned ? await adminService.unbanUser(user.id) : await adminService.banUser(user.id);
      patchUser(user.id, { bannedAt: res.bannedAt });
      haptics.success();
      showFlash(banned ? `Compte réactivé : ${name} peut de nouveau se connecter.` : `Compte suspendu : ${name} ne peut plus se connecter.`);
    } catch (err) {
      haptics.warning();
      setActionError(readableError(err, banned ? 'Le compte n’a pas pu être réactivé.' : 'Le compte n’a pas pu être suspendu.').message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (user: AdminUser) => {
    const name = user.businessName || user.email;
    const ok = await dialog.confirm({
      title: 'Supprimer définitivement ce compte ?',
      message: `Le compte ${user.email} et toutes ses données (produits, services, demandes) seront supprimés. Cette action est irréversible.`,
      confirmLabel: 'Supprimer le compte',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    setActionError(null);
    try {
      await adminService.deleteUser(user.id);
      haptics.success();
      setSelectedId(null);
      patchUser(user.id, null);
      showFlash(`Compte de ${name} supprimé`);
      qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      haptics.warning();
      setActionError(readableError(err, 'Le compte n’a pas pu être supprimé.').message);
    } finally {
      setBusy(null);
    }
  };

  const canAct = !!selected && selected.role !== 'admin' && selected.id !== me?.id;
  const footer = selected
    ? canAct
      ? (
          <View style={styles.footerRow}>
            <Button
              title={selected.bannedAt ? 'Réactiver' : 'Suspendre'}
              variant="secondary"
              icon={selected.bannedAt ? 'lock-open-outline' : 'ban-outline'}
              onPress={() => toggleBan(selected)}
              loading={busy === 'ban'}
              disabled={busy === 'delete'}
              style={{ flex: 1 }}
              testID="admin-user-ban"
            />
            <Button
              title="Supprimer"
              variant="destructive"
              icon="trash-outline"
              onPress={() => remove(selected)}
              loading={busy === 'delete'}
              disabled={busy === 'ban'}
              style={{ flex: 1 }}
              testID="admin-user-delete"
            />
          </View>
        )
      : undefined
    : undefined;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={selected ? selected.businessName || selected.email : 'Utilisateurs'}
      subline={selected ? selected.email : usersSummary(users.data) ?? 'Comptes MargeBar Pro'}
      snap="full"
      search={selected ? undefined : { value: query, onChangeText: (t) => { setQuery(t); setLimit(PAGE); }, placeholder: 'Nom ou e-mail…' }}
      contentPadding={selected ? 20 : 8}
      footer={footer}
      testID="sheet-admin-users"
    >
      <SwapFade value={selected ? `u-${selected.id}` : 'list'}>
        {selected ? (
          <UserDetail user={selected} onBack={() => { setSelectedId(null); setActionError(null); clearFlash(); }} actionError={actionError} flash={flash} />
        ) : users.isLoading && !users.data ? (
          <View style={{ paddingHorizontal: 12, gap: 14, paddingTop: 8 }}>
            <View style={styles.statsRow}>
              {[0, 1, 2].map((i) => <Skeleton key={i} height={58} radius={16} style={{ flex: 1 }} />)}
            </View>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={44} radius={12} />)}
          </View>
        ) : users.error && !users.data ? (
          <EmptyState surface="surface" icon="cloud-offline-outline" title="Chargement impossible" text={readableError(users.error, 'Les utilisateurs n’ont pas pu être chargés.').message} primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => users.refetch() }} />
        ) : (
          <View>
            <SheetFlash flash={flash} style={{ marginHorizontal: 12, marginBottom: 12 }} />
            {!query ? (
              <View style={{ paddingHorizontal: 12, gap: 12, marginBottom: 12 }}>
                <View style={styles.statsRow}>
                  <MiniStat label="Comptes" value={formatNumber(stats.total)} />
                  <MiniStat label="Actifs" value={formatNumber(stats.active)} tone="good" />
                  <MiniStat label="Suspendus" value={formatNumber(stats.banned)} tone={stats.banned ? 'bad' : undefined} />
                </View>
                <LoginsCard title="Connexions · tous les comptes" />
              </View>
            ) : null}
            <SectionHeader
              variant="caps"
              title={query ? `${plural(filtered.length, 'résultat')}` : 'Comptes · activité récente d’abord'}
              style={{ paddingHorizontal: 12 }}
            />
            {filtered.length === 0 ? (
              <EmptyState variant="noResults" surface="surface" query={query} primary={{ label: 'Effacer la recherche', onPress: () => setQuery('') }} />
            ) : (
              filtered.slice(0, limit).map((u, i, arr) => (
                <UserRow key={u.id} user={u} onPress={(x) => { setActionError(null); setSelectedId(x.id); }} divider={i < arr.length - 1} />
              ))
            )}
            {filtered.length > limit ? (
              <Button
                title={`Afficher ${Math.min(PAGE, filtered.length - limit)} de plus`}
                variant="text"
                size="sm"
                onPress={() => setLimit((l) => l + PAGE)}
                style={{ marginTop: 8 }}
              />
            ) : null}
          </View>
        )}
      </SwapFade>
    </Sheet>
  );
}

function UserDetail({ user, onBack, actionError, flash }: { user: AdminUser; onBack: () => void; actionError: string | null; flash: SheetFlashValue | null }) {
  const products = useQuery<AdminProduct[]>({
    queryKey: ['admin', 'userProducts', user.id],
    queryFn: () => adminService.getAdminUserProducts(user.id),
    staleTime: 60_000,
    retry: 1,
  });
  const list = products.data ?? [];
  const shown = list.slice(0, 30);
  return (
    <View style={{ gap: 16 }}>
      <SheetBack label="Tous les utilisateurs" onPress={onBack} testID="admin-user-back" />
      <View style={styles.profile}>
        <Avatar name={user.businessName || user.email} size={56} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={styles.badges}>
            {user.role === 'admin' ? <Badge variant="brand" icon="shield-checkmark" label="Administrateur" size="sm" /> : <Badge variant="neutral" label="Utilisateur" size="sm" />}
            {user.bannedAt ? <Badge zone="red" label={`Suspendu le ${formatDate(user.bannedAt)}`} size="sm" noDot /> : <Badge zone="green" label="Actif" size="sm" />}
          </View>
          <Text style={styles.profileMeta}>Inscrit le {formatLongDate(user.createdAt)}</Text>
        </View>
      </View>
      <SheetFlash flash={flash} />
      <ErrorLine message={actionError} style={{ marginTop: 0 }} />
      <View style={styles.card}>
        <ValueRow label="Dernière activité" value={formatRelative(user.lastSeenAt)} />
        <ValueRow label="Connexions ce mois" value={formatNumber(user.loginsThisMonth)} />
        <ValueRow label="Connexions au total" value={formatNumber(user.loginsTotal)} />
        <ValueRow label="Produits" value={products.data ? formatNumber(list.length) : '…'} last />
      </View>
      <LoginsCard title="Connexions" userId={user.id} />
      <View>
        <SectionHeader title="Produits" meta={products.data ? plural(list.length, 'produit') : undefined} />
        {products.isLoading && !products.data ? (
          <View style={{ gap: 8 }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} height={52} radius={12} />)}
          </View>
        ) : products.error && !products.data ? (
          <ErrorLine message={readableError(products.error, 'Les produits n’ont pas pu être chargés.').message} style={{ marginTop: 0 }} />
        ) : list.length === 0 ? (
          <Text style={styles.profileMeta}>Aucun produit enregistré.</Text>
        ) : (
          <View style={styles.card}>
            {shown.map((p, i) => (
              <View key={p.id} style={[styles.productRow, i < shown.length - 1 && styles.divider]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.profileMeta} numberOfLines={1}>
                    {[p.category, formatVolumeCl(p.containerVolumeCl), p.servings.length ? plural(p.servings.length, 'service') : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Badge value={p.marginPercent} size="sm" />
              </View>
            ))}
            {list.length > shown.length ? <Text style={[styles.profileMeta, { paddingTop: 10 }]}>et {plural(list.length - shown.length, 'autre produit', 'autres produits')}</Text> : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', gap: 10 },
  statsRow: { flexDirection: 'row', gap: 8 },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, paddingHorizontal: 14, paddingVertical: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { ...type.headline, color: palette.ink, flexShrink: 1 },
  cardValue: { ...type.numM, color: palette.ink },
  cardMeta: { ...type.footnote, color: palette.text3, marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 112, gap: 4, marginTop: 14 },
  barCol: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '72%', maxWidth: 28, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barValue: { ...type.footnote, fontSize: 11, lineHeight: 14, color: palette.text2, marginBottom: 2 },
  barLabel: { ...type.footnote, fontSize: 11, lineHeight: 14, color: palette.text3, marginTop: 4 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  profileMeta: { ...type.footnote, color: palette.text3 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  productName: { ...type.headline, color: palette.ink },
});
