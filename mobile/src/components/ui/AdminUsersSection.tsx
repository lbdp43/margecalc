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
import * as adminService from '../../services/admin.service';
import type { AdminProduct, AdminUser, AdminUsersResponse } from '../../services/admin.service';
import { isOnline } from '../../services/offline';
import { useAuthStore } from '../../store/auth.store';
import { palette, radius, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { formatNumber, formatVolumeCl, NBSP, plural } from '../../utils/format';
import { Avatar } from './Brand';
import { Badge } from './Badge';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { dialog } from './Dialog';
import { EmptyState } from './EmptyState';
import { ListRow, SectionHeader, ValueRow } from './ListRow';
import { SegmentedControl } from './SegmentedControl';
import { Skeleton } from './Skeleton';
import { FadeIn, SwapFade } from './motion';
import { toast } from './Toast';

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

function errorText(err: any, fallback: string): string {
  if (!err?.response) return isOnline() ? fallback : 'Hors ligne : vérifiez votre connexion puis réessayez.';
  const msg = err.response.data?.error;
  return typeof msg === 'string' && msg.trim() ? msg : fallback;
}

function relative(iso: string | null): string {
  if (!iso) return 'jamais connecté';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'actif à l’instant';
  if (min < 60) return `actif il y a ${min}${NBSP}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `actif il y a ${h}${NBSP}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `actif il y a ${d}${NBSP}j`;
  if (d < 365) return `actif il y a ${Math.floor(d / 30)}${NBSP}mois`;
  return `actif il y a ${Math.floor(d / 365)}${NBSP}an${d >= 730 ? 's' : ''}`;
}

const dateFr = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';

const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
        <Text style={[styles.cardMeta, { marginTop: 12, color: palette.bad }]}>{errorText(q.error, 'Connexions indisponibles.')}</Text>
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
      subtitle={`${user.businessName ? `${user.email} · ` : ''}${relative(user.lastSeenAt)}`}
      subtitleLines={1}
      right={right}
      onPress={() => onPress(user)}
      divider={divider}
      accessibilityLabel={`${user.businessName || user.email}, ${user.email}, ${relative(user.lastSeenAt)}${banned ? ', suspendu' : ''}${isAdmin ? ', administrateur' : ''}`}
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

  useEffect(() => {
    if (visible) {
      setSelectedId(null);
      setQuery('');
      setLimit(PAGE);
      setActionError(null);
    }
  }, [visible]);

  const all = users.data?.users ?? [];
  const filtered = useMemo(() => {
    const q = strip(query.trim());
    if (!q) return all;
    return all.filter((u) => strip(`${u.businessName ?? ''} ${u.email}`).includes(q));
  }, [all, query]);
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
      toast.success(banned ? `${name} est réactivé` : `${name} est suspendu`);
    } catch (err) {
      haptics.warning();
      setActionError(errorText(err, banned ? 'Le compte n’a pas pu être réactivé.' : 'Le compte n’a pas pu être suspendu.'));
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
      toast.success(`Compte de ${name} supprimé`);
      qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (err) {
      haptics.warning();
      setActionError(errorText(err, 'Le compte n’a pas pu être supprimé.'));
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
    <BottomSheet
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
          <UserDetail user={selected} onBack={() => { setSelectedId(null); setActionError(null); }} actionError={actionError} />
        ) : users.isLoading && !users.data ? (
          <View style={{ paddingHorizontal: 12, gap: 14, paddingTop: 8 }}>
            <View style={styles.statsRow}>
              {[0, 1, 2].map((i) => <Skeleton key={i} height={58} radius={16} style={{ flex: 1 }} />)}
            </View>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={44} radius={12} />)}
          </View>
        ) : users.error && !users.data ? (
          <EmptyState surface="surface" icon="cloud-offline-outline" title="Chargement impossible" text={errorText(users.error, 'Les utilisateurs n’ont pas pu être chargés.')} primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => users.refetch() }} />
        ) : (
          <View>
            {!query ? (
              <View style={{ paddingHorizontal: 12, gap: 12, marginBottom: 12 }}>
                <View style={styles.statsRow}>
                  <Mini label="Comptes" value={formatNumber(stats.total)} />
                  <Mini label="Actifs ce mois" value={formatNumber(stats.active)} tone="good" />
                  <Mini label="Suspendus" value={formatNumber(stats.banned)} tone={stats.banned ? 'bad' : undefined} />
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
    </BottomSheet>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <View style={styles.mini} accessible accessibilityLabel={`${label} : ${value}`}>
      <Text style={styles.miniLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.miniValue, tone === 'good' ? { color: palette.good } : tone === 'bad' ? { color: palette.bad } : null]}>{value}</Text>
    </View>
  );
}

function UserDetail({ user, onBack, actionError }: { user: AdminUser; onBack: () => void; actionError: string | null }) {
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
      <View style={styles.backRow}>
        <Button title="Tous les utilisateurs" variant="text" size="sm" icon="chevron-back" onPress={onBack} haptic="select" testID="admin-user-back" />
      </View>
      <View style={styles.profile}>
        <Avatar name={user.businessName || user.email} size={56} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={styles.badges}>
            {user.role === 'admin' ? <Badge variant="brand" icon="shield-checkmark" label="Administrateur" size="sm" /> : <Badge variant="neutral" label="Utilisateur" size="sm" />}
            {user.bannedAt ? <Badge zone="red" label={`Suspendu le ${new Date(user.bannedAt).toLocaleDateString('fr-FR')}`} size="sm" noDot /> : <Badge zone="green" label="Actif" size="sm" />}
          </View>
          <Text style={styles.profileMeta}>Inscrit le {dateFr(user.createdAt)}</Text>
        </View>
      </View>
      {actionError ? (
        <FadeIn offset={4} style={styles.errorBox}>
          <Text style={styles.errorText}>{actionError}</Text>
        </FadeIn>
      ) : null}
      <View style={styles.card}>
        <ValueRow label="Dernière activité" value={user.lastSeenAt ? relative(user.lastSeenAt).replace(/^actif /, '') : 'jamais'} />
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
          <Text style={[styles.profileMeta, { color: palette.bad }]}>{errorText(products.error, 'Les produits n’ont pas pu être chargés.')}</Text>
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
  mini: { flex: 1, minWidth: 0, backgroundColor: palette.surface2, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  miniLabel: { ...type.footnote, color: palette.text3 },
  miniValue: { ...type.numM, color: palette.ink },
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
  backRow: { flexDirection: 'row', marginLeft: -12, marginTop: -4 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  profileMeta: { ...type.footnote, color: palette.text3 },
  errorBox: { backgroundColor: palette.badBg, borderRadius: radius.md, padding: 12 },
  errorText: { ...type.footnoteStrong, color: palette.bad },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  productName: { ...type.headline, color: palette.ink },
});
