import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { alert, confirm } from '../../utils/alert';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { RecipeWithCost, formatPercent, formatPrice, MARGIN_COLOR_MAP } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as recipeService from '../../services/recipe.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

export function CocktailDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const recipeId = route.params?.recipeId;

  const { data: recipe, isLoading, isOffline } = useOfflineQuery<RecipeWithCost>(
    ['recipe', recipeId],
    () => recipeService.getRecipe(recipeId),
  );

  if (isLoading || !recipe) {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>
            {isLoading ? 'Chargement...' : 'Recette introuvable'}
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  const accent = MARGIN_COLOR_MAP[recipe.computed.colorCode];

  const handleDelete = () => {
    confirm(
      'Supprimer la recette',
      `Voulez-vous supprimer "${recipe.name}" ?`,
      async () => {
        try {
          await recipeService.deleteRecipe(recipeId);
          queryClient.invalidateQueries({ queryKey: ['recipes'] });
          navigation.goBack();
        } catch {
          alert('Erreur', 'Impossible de supprimer la recette');
        }
      },
      'Supprimer',
      true,
    );
  };

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('CocktailForm', { recipeId })}
          >
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={22} color={colors.marginRed} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Title */}
      <View style={styles.titleCard}>
        <Text style={styles.recipeName}>{recipe.name}</Text>
        {recipe.description ? (
          <Text style={styles.recipeDesc}>{recipe.description}</Text>
        ) : null}
        {recipe.authorName ? (
          <Text style={styles.authorText}>par {recipe.authorName}</Text>
        ) : null}
      </View>

      {/* Margin summary */}
      {recipe.sellingPriceTTC ? (
        <View style={styles.marginCard}>
          <View style={styles.marginRow}>
            <View style={styles.marginItem}>
              <Text style={styles.marginLabel}>Marge</Text>
              <Text style={[styles.marginBig, { color: accent }]}>
                {formatPercent(recipe.computed.marginPercent)}
              </Text>
            </View>
            <View style={styles.marginItem}>
              <Text style={styles.marginLabel}>Prix TTC</Text>
              <Text style={styles.marginValue}>{formatPrice(recipe.sellingPriceTTC)}</Text>
            </View>
            <View style={styles.marginItem}>
              <Text style={styles.marginLabel}>Coeff</Text>
              <Text style={styles.marginValue}>x {recipe.computed.coefficient.toFixed(1)}</Text>
            </View>
          </View>
          <View style={styles.marginRow}>
            <View style={styles.marginItem}>
              <Text style={styles.marginLabel}>Coût total HT</Text>
              <Text style={styles.marginValue}>{formatPrice(recipe.computed.totalCostHT)}</Text>
            </View>
            <View style={styles.marginItem}>
              <Text style={styles.marginLabel}>Prix HT</Text>
              <Text style={styles.marginValue}>{formatPrice(recipe.computed.sellingPriceHT)}</Text>
            </View>
            <View style={styles.marginItem}>
              <Text style={styles.marginLabel}>Gain</Text>
              <Text style={[styles.marginValue, { color: accent }]}>
                {formatPrice(recipe.computed.marginHT)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Ingredients */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIndicator, { backgroundColor: colors.primary }]} />
          <Text style={styles.sectionTitle}>
            Ingrédients ({recipe.ingredients.length})
          </Text>
        </View>
        {recipe.ingredients.map((ing) => (
          <View key={ing.id} style={styles.ingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ingName}>{ing.name}</Text>
              {ing.product ? (
                <Text style={styles.ingLinked}>Lié à {ing.product.name}</Text>
              ) : null}
            </View>
            <Text style={styles.ingQty}>{ing.quantityCl} cl</Text>
            <Text style={styles.ingCost}>{formatPrice(ing.costPerUnit)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total ingrédients</Text>
          <Text style={styles.totalValue}>{formatPrice(recipe.computed.totalIngredientCost)}</Text>
        </View>
      </View>

      {/* Consumables */}
      {recipe.consumables.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIndicator, { backgroundColor: colors.accent }]} />
            <Text style={styles.sectionTitle}>
              Consommables ({recipe.consumables.length})
            </Text>
          </View>
          {recipe.consumables.map((c) => (
            <View key={c.id} style={styles.ingRow}>
              <Text style={[styles.ingName, { flex: 1 }]}>{c.name}</Text>
              <Text style={styles.ingQty}>x{c.quantity}</Text>
              <Text style={styles.ingCost}>{formatPrice(c.unitCost * c.quantity)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total consommables</Text>
            <Text style={styles.totalValue}>{formatPrice(recipe.computed.totalConsumableCost)}</Text>
          </View>
        </View>
      )}

      <View style={{ height: spacing.xxl }} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerBtn: {
    padding: spacing.xs,
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },

  titleCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  recipeName: {
    ...typography.h1,
    color: colors.text,
  },
  recipeDesc: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  authorText: {
    ...typography.caption,
    color: colors.tabBarInactive,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },

  marginCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  marginRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  marginItem: {
    flex: 1,
    alignItems: 'center',
  },
  marginLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  marginBig: {
    ...typography.h2,
    fontWeight: '800',
    marginTop: 2,
  },
  marginValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },

  section: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionIndicator: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },

  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ingName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  ingLinked: {
    ...typography.caption,
    color: colors.primary,
    marginTop: 1,
  },
  ingQty: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginHorizontal: spacing.sm,
    minWidth: 40,
    textAlign: 'right',
  },
  ingCost: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    minWidth: 55,
    textAlign: 'right',
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  totalLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  totalValue: {
    ...typography.bodySmall,
    fontWeight: '800',
    color: colors.primary,
  },
});
