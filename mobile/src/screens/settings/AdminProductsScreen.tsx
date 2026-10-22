/**
 * Réglages › Administration › Tous les produits (admins only).
 * Every account's catalogue: stats, search, filter by account, margin legend,
 * then a FlatList of product cards (owner, category, services, margin).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  Badge,
  Card,
  ChipRow,
  EmptyState,
  FadeIn,
  MarginLegend,
  NavBar,
  PriceTag,
  Screen,
  ScreenList,
  servingLabel,
  SkeletonList,
  StatTile,
  TextField,
  useDelayedLoading,
} from '../../components/ui';
import * as adminService from '../../services/admin.service';
import type { AdminProduct } from '../../services/admin.service';
import { isOnline } from '../../services/offline';
import { palette, type } from '../../theme';
import { formatEuro, formatDegree, formatPercent, formatVolumeCl } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';

const strip = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function errorText(err: any): string {
  if (!err?.response) return isOnline() ? 'Le serveur ne répond pas. Réessayez.' : 'Hors ligne : vérifiez votre connexion puis réessayez.';
  const msg = err.response.data?.error;
  return typeof msg === 'string' && msg.trim() ? msg : 'Les produits n’ont pas pu être chargés.';
}

const ProductRow = React.memo(function ProductRow({ product }: { product: AdminProduct }) {
  const owner = product.user?.businessName || product.user?.email || '–';
  const meta = [product.category, formatVolumeCl(product.containerVolumeCl), product.alcoholDegree > 0 ? formatDegree(product.alcoholDegree) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card padding={14} accessibilityLabel={`${product.name}, ${owner}, marge ${formatPercent(product.marginPercent)}`}>
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <Badge value={product.marginPercent} size="sm" />
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {meta}
      </Text>
      <View style={styles.ownerRow}>
        <Ionicons name="storefront-outline" size={14} color={palette.em700} />
        <Text style={styles.owner} numberOfLines={1}>
          {owner}
        </Text>
        <Text style={styles.cost}>Achat {formatEuro(product.purchasePriceHT)} HT</Text>
      </View>
      <View style={styles.tags}>
        {product.servings.length ? (
          product.servings.map((s, i) => <PriceTag key={`${s.name}-${i}`} label={servingLabel(s.name, s.volumeCl)} price={s.sellingPriceTTC} />)
        ) : (
          <PriceTag label="Prix TTC" price={product.sellingPriceTTC} />
        )}
      </View>
    </Card>
  );
});

const Separator = () => <View style={{ height: 10 }} />;

export function AdminProductsScreen() {
  const thresholds = useMarginThresholds();
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState<string>('all');
  const q = useQuery({ queryKey: ['admin', 'products'], queryFn: adminService.getAllProducts, staleTime: 60_000, retry: 1 });
  const products = q.data ?? [];
  const showSkeleton = useDelayedLoading(q.isLoading && !q.data);

  const owners = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    for (const p of products) {
      if (!p.user) continue;
      const cur = map.get(p.user.id);
      if (cur) cur.count++;
      else map.set(p.user.id, { id: p.user.id, label: p.user.businessName || p.user.email.split('@')[0], count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
  }, [products]);

  const filtered = useMemo(() => {
    const s = strip(query.trim());
    return products.filter(
      (p) =>
        (owner === 'all' || p.user?.id === owner) &&
        (!s || strip(`${p.name} ${p.category} ${p.user?.businessName ?? ''} ${p.user?.email ?? ''} ${p.supplier ?? ''}`).includes(s)),
    );
  }, [products, owner, query]);

  const avg = filtered.length ? filtered.reduce((a, p) => a + p.marginPercent, 0) / filtered.length : 0;
  const counts = useMemo(() => {
    const c = { green: 0, orange: 0, red: 0 };
    for (const p of filtered) c[getMarginZone(p.marginPercent, thresholds)]++;
    return c;
  }, [filtered, thresholds]);
  const accounts = owner === 'all' ? owners.length : 1;

  const renderItem = useCallback(({ item, index }: { item: AdminProduct; index: number }) => (
    <FadeIn index={index}>
      <ProductRow product={item} />
    </FadeIn>
  ), []);

  const header = (
    <View style={styles.header}>
      <View style={styles.stats}>
        <StatTile style={styles.stat} label="Produits" value={filtered.length} valueStyle={styles.statValue} />
        <StatTile style={styles.stat} label="Comptes" value={accounts} valueStyle={styles.statValue} />
        <StatTile
          style={styles.stat}
          label="Marge"
          accessibilityLabel={`Marge moyenne : ${formatPercent(avg)}`}
          value={avg}
          format={(n) => formatPercent(n)}
          valueStyle={[styles.statValue, { color: filtered.length ? (getMarginZone(avg, thresholds) === 'green' ? palette.good : getMarginZone(avg, thresholds) === 'orange' ? palette.warn : palette.bad) : palette.ink }]}
        />
      </View>
      <TextField
        variant="search"
        leftIcon="search"
        placeholder="Produit, établissement, e-mail…"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
        containerStyle={{ marginTop: 16 }}
        testID="admin-products-search"
      />
      {owners.length > 1 ? (
        <ChipRow
          items={[{ key: 'all', label: 'Tous', count: products.length }, ...owners.map((o) => ({ key: o.id, label: o.label, count: o.count }))]}
          selectedKey={owner}
          onSelect={setOwner}
          style={{ marginTop: 12 }}
        />
      ) : null}
      {filtered.length ? <MarginLegend counts={counts} style={{ marginTop: 12, marginBottom: 4 }} /> : null}
    </View>
  );

  const empty = showSkeleton ? (
    <SkeletonList count={4} />
  ) : q.isLoading ? null : q.error && !q.data ? (
    isOnline() ? (
      <EmptyState icon="cloud-offline-outline" title="Chargement impossible" text={errorText(q.error)} primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => q.refetch() }} />
    ) : (
      <EmptyState variant="offline" primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => q.refetch() }} />
    )
  ) : query || owner !== 'all' ? (
    <EmptyState
      variant="noResults"
      query={query || undefined}
      primary={{ label: 'Réinitialiser les filtres', onPress: () => { setQuery(''); setOwner('all'); } }}
    />
  ) : (
    <EmptyState icon="cube-outline" title="Aucun produit" text="Les produits des comptes MargeBar Pro apparaîtront ici." />
  );

  return (
    <Screen
      scroll={false}
      header={<NavBar title="Tous les produits" trailing={<Badge variant="brand" icon="shield-checkmark" label="Admin" size="sm" />} />}
      refreshing={q.isFetching && !q.isLoading}
      onRefresh={() => q.refetch()}
      testID="admin-products-screen"
    >
      <ScreenList
        data={filtered}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        windowSize={7}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 8, paddingBottom: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0 },
  statValue: { fontSize: 24, lineHeight: 28, letterSpacing: -0.6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { ...type.headline, color: palette.ink, flex: 1, minWidth: 0 },
  meta: { ...type.footnote, color: palette.text3, marginTop: 2 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  owner: { ...type.footnoteStrong, color: palette.em700, flex: 1, minWidth: 0 },
  cost: { ...type.footnote, color: palette.text3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
});
