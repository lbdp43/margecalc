import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RecipeWithCost, formatPercent, formatPrice, MARGIN_COLOR_MAP } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as recipeService from '../../services/recipe.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

type Tab = 'mine' | 'community';

export function CocktailListScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('mine');

  const { data: myRecipes = [], isOffline } = useOfflineQuery<RecipeWithCost[]>(
    ['recipes'],
    () => recipeService.getRecipes(),
  );

  // Only fetch community recipes when that tab is active
  const { data: communityRecipes = [] } = useOfflineQuery<RecipeWithCost[]>(
    ['recipes-community'],
    () => recipeService.getCommunityRecipes(),
    { enabled: tab === 'community' },
  );

  const recipes = tab === 'mine' ? myRecipes : communityRecipes;

  const renderRecipe = useCallback(({ item }: { item: RecipeWithCost }) => {
    const accent = MARGIN_COLOR_MAP[item.computed.colorCode];
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('CocktailDetail', { recipeId: item.id })}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.indicator, { backgroundColor: accent }]} />
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
              ) : null}
              <Text style={styles.cardMeta}>
                {item.ingredients.length} ingrédient{item.ingredients.length > 1 ? 's' : ''}
                {item.consumables.length > 0 ? ` · ${item.consumables.length} consommable${item.consumables.length > 1 ? 's' : ''}` : ''}
              </Text>
            </View>
            <View style={styles.cardRight}>
              {item.sellingPriceTTC ? (
                <>
                  <Text style={[styles.cardMargin, { color: accent }]}>
                    {formatPercent(item.computed.marginPercent)}
                  </Text>
                  <Text style={styles.cardPrice}>{formatPrice(item.sellingPriceTTC)}</Text>
                </>
              ) : (
                <Text style={styles.cardNoPrice}>Prix non défini</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.tabBarInactive} />
          </View>
          {tab === 'community' && item.authorName ? (
            <Text style={styles.authorLabel}>par {item.authorName}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }, [navigation, tab]);

  return (
    <ScreenWrapper scrollable={false}>
      <Text style={styles.title}>Cocktails</Text>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]}
          onPress={() => setTab('mine')}
        >
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>Mes recettes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'community' && styles.tabBtnActive]}
          onPress={() => setTab('community')}
        >
          <Text style={[styles.tabText, tab === 'community' && styles.tabTextActive]}>Communauté</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={renderRecipe}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={15}
        removeClippedSubviews
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="wine-outline" size={48} color={colors.tabBarInactive} />
            <Text style={styles.emptyText}>
              {tab === 'mine'
                ? 'Créez votre premier cocktail'
                : 'Aucune recette partagée pour le moment'}
            </Text>
          </View>
        }
      />

      {/* FAB to create */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('CocktailForm')}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  list: {
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  indicator: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: spacing.sm + 2,
  },
  cardTitleWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  cardName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  cardDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.tabBarInactive,
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
    marginRight: spacing.xs,
  },
  cardMargin: {
    ...typography.h3,
    fontWeight: '800',
  },
  cardPrice: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardNoPrice: {
    ...typography.caption,
    color: colors.tabBarInactive,
    fontStyle: 'italic',
  },
  authorLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl * 2,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.tabBarInactive,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
});
