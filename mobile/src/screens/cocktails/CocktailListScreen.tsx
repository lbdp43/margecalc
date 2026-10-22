/**
 * Cocktails (hidden from users for now): my recipes / community recipes.
 * Built from the D1 kit so it is ready when the feature comes back.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RecipeWithCost } from '@margebar/shared';
import { Badge, Card, EmptyState, FAB, FadeIn, LargeTitleHeader, Screen, ScreenList, SegmentedControl } from '../../components/ui';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as recipeService from '../../services/recipe.service';
import { palette, type } from '../../theme';
import { formatEuro, plural } from '../../utils/format';

type Tab = 'mine' | 'community';

const Separator = () => <View style={{ height: 10 }} />;

export function CocktailListScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('mine');

  const { data: myRecipes = [] } = useOfflineQuery<RecipeWithCost[]>(['recipes'], () => recipeService.getRecipes());
  const { data: communityRecipes = [] } = useOfflineQuery<RecipeWithCost[]>(
    ['recipes-community'],
    () => recipeService.getCommunityRecipes(),
    { enabled: tab === 'community' },
  );
  const recipes = tab === 'mine' ? myRecipes : communityRecipes;

  const renderRecipe = useCallback(
    ({ item, index }: { item: RecipeWithCost; index: number }) => (
      <FadeIn index={index}>
        <Card onPress={() => navigation.navigate('CocktailDetail', { recipeId: item.id })} accessibilityLabel={item.name}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.description ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {item.description}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {plural(item.ingredients.length, 'ingrédient')}
                {item.consumables.length > 0 ? ` · ${plural(item.consumables.length, 'consommable')}` : ''}
                {tab === 'community' && item.authorName ? ` · par ${item.authorName}` : ''}
              </Text>
            </View>
            <View style={styles.right}>
              {item.sellingPriceTTC ? (
                <>
                  <Badge value={item.computed.marginPercent} size="sm" />
                  <Text style={styles.price}>{formatEuro(item.sellingPriceTTC)}</Text>
                </>
              ) : (
                <Text style={styles.meta}>Prix non défini</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.text4} />
          </View>
        </Card>
      </FadeIn>
    ),
    [navigation, tab],
  );

  return (
    <Screen scroll={false}>
      <ScreenList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={renderRecipe}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <LargeTitleHeader
              title="Cocktails"
              subline={plural(recipes.length, 'recette')}
              trailing={<FAB onPress={() => navigation.navigate('CocktailForm')} accessibilityLabel="Créer un cocktail" />}
            />
            <SegmentedControl
              options={[
                { key: 'mine', label: 'Mes recettes' },
                { key: 'community', label: 'Communauté' },
              ]}
              value={tab}
              onChange={(k) => setTab(k as Tab)}
              accessibilityLabel="Recettes"
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="wine-outline"
            title={tab === 'mine' ? 'Aucun cocktail pour l’instant' : 'Aucune recette partagée'}
            text={tab === 'mine' ? 'Créez votre premier cocktail pour connaître son coût et sa marge.' : 'Les recettes partagées par la communauté apparaîtront ici.'}
            primary={tab === 'mine' ? { label: 'Créer un cocktail', icon: 'add', onPress: () => navigation.navigate('CocktailForm') } : undefined}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { ...type.headline, color: palette.ink },
  meta: { ...type.footnote, color: palette.text3, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  price: { ...type.numS, color: palette.ink },
});
