import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ProductWithMargin, Category } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { YinYangSpinner } from '../../components/ui/YinYangSpinner';
import { ProductCard } from '../../components/product/ProductCard';
import { CategoryTabs } from '../../components/product/CategoryTabs';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as productService from '../../services/product.service';
import * as categoryService from '../../services/category.service';
import { colors, spacing, borderRadius, typography, shadows, fonts } from '../../theme';
import { Eyebrow, Display, InkStamp, Script } from '../../components/ui/atelier';

type Props = NativeStackScreenProps<any, 'ProductList'>;

const SORT_OPTIONS = [
  { key: 'name', label: 'Nom' },
  { key: 'margin', label: 'Marge %' },
  { key: 'price', label: 'Prix' },
  { key: 'coeff', label: 'Coeff' },
] as const;

const keyExtractor = (item: ProductWithMargin) => item.id;
const CLEAR_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export function ProductListScreen({ navigation }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'margin' | 'price' | 'coeff'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const { data: categories = [] } = useOfflineQuery<Category[]>(
    ['categories'],
    categoryService.getCategories,
  );

  const { data: products = [], isLoading, refetch } = useOfflineQuery<ProductWithMargin[]>(
    ['products', selectedCategory],
    () => productService.getProducts(selectedCategory || undefined),
  );

  const filtered = useMemo(() => products
    .filter((p) => searchQuery.length === 0 || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'margin': cmp = a.computed.marginPercent - b.computed.marginPercent; break;
        case 'price': cmp = a.purchasePriceHT - b.purchasePriceHT; break;
        case 'coeff': cmp = a.computed.coefficient - b.computed.coefficient; break;
      }
      return sortAsc ? cmp : -cmp;
    }), [products, searchQuery, sortBy, sortAsc]);

  const renderProduct = useCallback(({ item }: { item: ProductWithMargin }) => (
    <ProductCard
      product={item}
      onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
    />
  ), [navigation]);

  const count = filtered.length;

  return (
    <ScreenWrapper scrollable={false}>
      {/* Atelier hero header */}
      <View style={styles.darkHeader}>
        <View style={styles.headerTopRow}>
          <InkStamp size={36} color={colors.onAccent} rotate={-6} />
          <View style={{ marginLeft: spacing.sm + 2, flex: 1 }}>
            <Eyebrow color="rgba(243,248,236,0.78)" size={9.5} track={1.8}>Inventaire</Eyebrow>
            <Display size={22} color={colors.onAccent} style={{ marginTop: 2 }}>
              Mes produits
            </Display>
            <Script size={13} color="rgba(243,248,236,0.85)" style={{ marginTop: 2 }}>
              {count} produit{count !== 1 ? 's' : ''} au comptoir
            </Script>
          </View>
        </View>
      </View>

      {/* Category pills */}
      <CategoryTabs
        categories={categories}
        selectedId={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Chercher une bouteille…"
            placeholderTextColor={colors.textMuted}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={CLEAR_HIT_SLOP}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sort pills */}
      <View style={styles.sortRow}>
        {SORT_OPTIONS.map((s) => {
          const isActive = sortBy === s.key;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.sortBtn, isActive && styles.sortBtnActive]}
              onPress={() => {
                if (sortBy === s.key) setSortAsc(!sortAsc);
                else { setSortBy(s.key as any); setSortAsc(true); }
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortBtnText, isActive && styles.sortBtnTextActive]}>
                {s.label}
              </Text>
              {isActive && (
                <Ionicons
                  name={sortAsc ? 'arrow-up' : 'arrow-down'}
                  size={11}
                  color={colors.textLight}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Product list */}
      {isLoading ? (
        <YinYangSpinner size={80} message="Chargement des produits…" />
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderProduct}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          initialNumToRender={10}
          maxToRenderPerBatch={15}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <InkStamp size={64} color={colors.primary} rotate={-6} letter="M" />
              </View>
              <Display size={22} style={styles.emptyText}>
                Le carnet est vide
              </Display>
              <Text style={styles.emptySubtext}>
                Scannez une bouteille, ou ajoutez-la à la main.
              </Text>
              <Script size={20} color={colors.accent} style={{ marginTop: 6 }}>
                c'est parti !
              </Script>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ProductForm', {})}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.textLight} />
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  darkHeader: {
    backgroundColor: colors.primary,
    marginHorizontal: -spacing.md,
    marginTop: -spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  list: {
    paddingBottom: 100,
    paddingTop: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
  },
  emptyIconWrap: {
    width: 110,
    height: 110,
    borderRadius: borderRadius.xxl,
    backgroundColor: colors.cardBackgroundHi,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  searchRow: {
    marginBottom: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 15,
    color: colors.text,
    padding: 0,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.cardBackground,
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
  },
  sortBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.secondary,
  },
  sortBtnText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  sortBtnTextActive: {
    color: colors.textLight,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.secondary,
    ...shadows.lg,
  },
});
