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
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

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

  const { data: products = [], isLoading, refetch, isOffline } = useOfflineQuery<ProductWithMargin[]>(
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
      {/* Dark header */}
      <View style={styles.darkHeader}>
        <Text style={styles.title}>Mes produits</Text>
        <Text style={styles.count}>
          {count} produit{count !== 1 ? 's' : ''}
        </Text>
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
          <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher un produit..."
            placeholderTextColor={colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={CLEAR_HIT_SLOP}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
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
              activeOpacity={0.7}
            >
              <Text style={[styles.sortBtnText, isActive && styles.sortBtnTextActive]}>
                {s.label}
              </Text>
              {isActive && (
                <Ionicons
                  name={sortAsc ? 'arrow-up' : 'arrow-down'}
                  size={12}
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
                <Ionicons name="wine-outline" size={40} color={colors.accent} />
              </View>
              <Text style={styles.emptyText}>Aucun produit</Text>
              <Text style={styles.emptySubtext}>
                Scannez une bouteille ou appuyez sur + pour commencer
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ProductForm', {})}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={30} color={colors.textLight} />
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
  title: {
    ...typography.h1,
    color: colors.textLight,
  },
  count: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  list: {
    paddingBottom: 100,
    paddingTop: spacing.xs,
  },
  loader: {
    marginTop: spacing.xl * 2,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xl * 3,
    gap: spacing.sm + 4,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.h3,
    color: colors.text,
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 22,
  },
  searchRow: {
    marginBottom: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm + 2,
    ...shadows.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.cardBackground,
    gap: spacing.xs,
    ...shadows.sm,
  },
  sortBtnActive: {
    backgroundColor: colors.primary,
    ...shadows.md,
  },
  sortBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortBtnTextActive: {
    color: colors.textLight,
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
    ...shadows.lg,
  },
});
