import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ProductWithMargin, Category } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { ProductCard } from '../../components/product/ProductCard';
import { CategoryTabs } from '../../components/product/CategoryTabs';
import * as productService from '../../services/product.service';
import * as categoryService from '../../services/category.service';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'ProductList'>;

export function ProductListScreen({ navigation }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'margin' | 'price' | 'coeff'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoryService.getCategories,
  });

  const { data: products = [], isLoading, refetch } = useQuery<ProductWithMargin[]>({
    queryKey: ['products', selectedCategory],
    queryFn: () => productService.getProducts(selectedCategory || undefined),
  });

  const filtered = products
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
    });

  const renderProduct = useCallback(({ item }: { item: ProductWithMargin }) => (
    <ProductCard
      product={item}
      onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
    />
  ), [navigation]);

  const count = filtered.length;

  return (
    <ScreenWrapper scrollable={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes produits</Text>
        <Text style={styles.count}>
          {count} produit{count !== 1 ? 's' : ''}
        </Text>
      </View>

      <CategoryTabs
        categories={categories}
        selectedId={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.grayMedium} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Rechercher un produit..."
            placeholderTextColor={colors.grayMedium}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.grayMedium} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.sortRow}>
        {[
          { key: 'name', label: 'Nom' },
          { key: 'margin', label: 'Marge %' },
          { key: 'price', label: 'Prix' },
          { key: 'coeff', label: 'Coeff' },
        ].map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sortBtn, sortBy === s.key && styles.sortBtnActive]}
            onPress={() => {
              if (sortBy === s.key) setSortAsc(!sortAsc);
              else { setSortBy(s.key as any); setSortAsc(true); }
            }}
          >
            <Text style={[styles.sortBtnText, sortBy === s.key && styles.sortBtnTextActive]}>
              {s.label}
            </Text>
            {sortBy === s.key && (
              <Ionicons name={sortAsc ? 'arrow-up' : 'arrow-down'} size={12} color={colors.white} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color={colors.grayMedium} />
              <Text style={styles.emptyText}>Aucun produit</Text>
              <Text style={styles.emptySubtext}>Scannez une bouteille ou appuyez sur + pour commencer</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ProductForm', {})}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
  },
  count: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  list: {
    paddingBottom: 80,
  },
  loader: {
    marginTop: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  emptySubtext: {
    ...typography.body,
    color: colors.grayMedium,
    textAlign: 'center',
  },
  searchRow: {
    marginBottom: spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.inputBackground,
    gap: 4,
  },
  sortBtnActive: {
    backgroundColor: colors.primary,
  },
  sortBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortBtnTextActive: {
    color: colors.white,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
});
