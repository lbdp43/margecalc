import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
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

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoryService.getCategories,
  });

  const { data: products = [], isLoading, refetch } = useQuery<ProductWithMargin[]>({
    queryKey: ['products', selectedCategory],
    queryFn: () => productService.getProducts(selectedCategory || undefined),
  });

  const renderProduct = useCallback(({ item }: { item: ProductWithMargin }) => (
    <ProductCard
      product={item}
      onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
    />
  ), [navigation]);

  const count = products.length;

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

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={products}
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
