import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  ProductWithMargin, RecipeWithCost,
  calculateRecipeMargin, formatPercent, formatPrice, MARGIN_COLOR_MAP,
  parseLocaleFloat,
  CreateRecipeIngredientInput, CreateRecipeConsumableInput,
} from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as recipeService from '../../services/recipe.service';
import * as productService from '../../services/product.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';
import { useAuthStore } from '../../store/auth.store';

interface IngredientRow {
  key: string;
  productId?: string;
  name: string;
  quantityCl: string;
  costPerUnit: string;
}

interface ConsumableRow {
  key: string;
  name: string;
  unitCost: string;
  quantity: string;
}

export function CocktailFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const editId = route.params?.recipeId;
  const isEdit = !!editId;

  const { data: existingRecipe } = useOfflineQuery<RecipeWithCost>(
    ['recipe', editId],
    () => recipeService.getRecipe(editId),
    { enabled: isEdit },
  );

  const { data: products = [] } = useOfflineQuery<ProductWithMargin[]>(
    ['products'],
    () => productService.getProducts(),
  );

  // Form state
  const [name, setName] = useState(existingRecipe?.name || '');
  const [description, setDescription] = useState(existingRecipe?.description || '');
  const [sellingPrice, setSellingPrice] = useState(
    existingRecipe?.sellingPriceTTC?.toString().replace('.', ',') || ''
  );
  const [tvaRate, setTvaRate] = useState(existingRecipe?.tvaRate ?? user?.defaultTvaRate ?? 0.20);
  const [isPublic, setIsPublic] = useState(existingRecipe?.isPublic ?? false);
  const [saving, setSaving] = useState(false);

  // Initialize from existing recipe — use ID as dep to avoid re-running on refetch
  const [initialized, setInitialized] = useState(!isEdit);
  React.useEffect(() => {
    if (existingRecipe && !initialized) {
      setName(existingRecipe.name);
      setDescription(existingRecipe.description || '');
      setSellingPrice(existingRecipe.sellingPriceTTC?.toString().replace('.', ',') || '');
      setTvaRate(existingRecipe.tvaRate);
      setIsPublic(existingRecipe.isPublic);
      setIngredients(existingRecipe.ingredients.map((ing, i) => ({
        key: `ing-${i}`,
        productId: ing.productId || undefined,
        name: ing.name,
        quantityCl: ing.quantityCl.toString().replace('.', ','),
        costPerUnit: ing.costPerUnit.toString().replace('.', ','),
      })));
      setConsumables(existingRecipe.consumables.map((c, i) => ({
        key: `con-${i}`,
        name: c.name,
        unitCost: c.unitCost.toString().replace('.', ','),
        quantity: c.quantity.toString().replace('.', ','),
      })));
      setInitialized(true);
    }
  }, [existingRecipe?.id]);

  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { key: 'ing-0', name: '', quantityCl: '', costPerUnit: '' },
  ]);
  const [consumables, setConsumables] = useState<ConsumableRow[]>([]);

  // Product picker for ingredient
  const [showProductPicker, setShowProductPicker] = useState<string | null>(null);

  const addIngredient = () => {
    setIngredients([...ingredients, {
      key: `ing-${Date.now()}`,
      name: '',
      quantityCl: '',
      costPerUnit: '',
    }]);
  };

  const removeIngredient = (key: string) => {
    if (ingredients.length <= 1) return;
    setIngredients(ingredients.filter((i) => i.key !== key));
  };

  const updateIngredient = (key: string, field: keyof IngredientRow, value: string) => {
    setIngredients(ingredients.map((i) =>
      i.key === key ? { ...i, [field]: value } : i
    ));
  };

  const selectProduct = (key: string, product: ProductWithMargin) => {
    // Auto-fill cost per cl from product
    const costPerCl = product.purchasePriceHT / product.containerVolumeCl;
    setIngredients(ingredients.map((i) => {
      if (i.key !== key) return i;
      const qty = parseLocaleFloat(i.quantityCl) || 0;
      return {
        ...i,
        productId: product.id,
        name: product.name,
        costPerUnit: (costPerCl * (qty || 1)).toFixed(2).replace('.', ','),
      };
    }));
    setShowProductPicker(null);
  };

  // Auto-recalc cost when quantity changes and product is linked
  const recalcIngredientCost = (key: string, newQty: string) => {
    const ing = ingredients.find((i) => i.key === key);
    if (!ing?.productId) return;
    const product = products.find((p) => p.id === ing.productId);
    if (!product) return;
    const costPerCl = product.purchasePriceHT / product.containerVolumeCl;
    const qty = parseLocaleFloat(newQty) || 0;
    updateIngredient(key, 'costPerUnit', (costPerCl * qty).toFixed(2).replace('.', ','));
  };

  const addConsumable = () => {
    setConsumables([...consumables, {
      key: `con-${Date.now()}`,
      name: '',
      unitCost: '',
      quantity: '1',
    }]);
  };

  const removeConsumable = (key: string) => {
    setConsumables(consumables.filter((c) => c.key !== key));
  };

  const updateConsumable = (key: string, field: keyof ConsumableRow, value: string) => {
    setConsumables(consumables.map((c) =>
      c.key === key ? { ...c, [field]: value } : c
    ));
  };

  // Live margin preview
  const preview = useMemo(() => {
    const price = parseLocaleFloat(sellingPrice) || 0;
    if (price <= 0) return null;
    const ings = ingredients.map((i) => ({
      id: '', recipeId: '', productId: null,
      name: i.name,
      quantityCl: parseLocaleFloat(i.quantityCl) || 0,
      costPerUnit: parseLocaleFloat(i.costPerUnit) || 0,
    }));
    const cons = consumables.map((c) => ({
      id: '', recipeId: '',
      name: c.name,
      unitCost: parseLocaleFloat(c.unitCost) || 0,
      quantity: parseLocaleFloat(c.quantity) || 1,
    }));
    return calculateRecipeMargin(ings, cons, price, tvaRate);
  }, [ingredients, consumables, sellingPrice, tvaRate]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Le nom du cocktail est requis');
      return;
    }

    const validIngredients = ingredients.filter((i) => i.name.trim());
    if (validIngredients.length === 0) {
      Alert.alert('Erreur', 'Ajoutez au moins un ingrédient');
      return;
    }

    // Validate quantities are positive
    const badQty = validIngredients.find((i) => {
      const qty = parseLocaleFloat(i.quantityCl);
      return isNaN(qty) || qty <= 0;
    });
    if (badQty) {
      Alert.alert('Erreur', `Quantité invalide pour "${badQty.name}"`);
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        description: description.trim() || undefined,
        sellingPriceTTC: parseLocaleFloat(sellingPrice) || undefined,
        tvaRate,
        isPublic,
        ingredients: validIngredients
          .map((i): CreateRecipeIngredientInput => ({
            productId: i.productId,
            name: i.name.trim(),
            quantityCl: parseLocaleFloat(i.quantityCl) || 0,
            costPerUnit: parseLocaleFloat(i.costPerUnit) || 0,
          })),
        consumables: consumables
          .filter((c) => c.name.trim())
          .map((c): CreateRecipeConsumableInput => ({
            name: c.name.trim(),
            unitCost: parseLocaleFloat(c.unitCost) || 0,
            quantity: parseLocaleFloat(c.quantity) || 1,
          })),
      };

      if (isEdit) {
        await recipeService.updateRecipe(editId, data);
      } else {
        await recipeService.createRecipe(data);
      }
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      if (isPublic) {
        queryClient.invalidateQueries({ queryKey: ['recipes-community'] });
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  const TVA_OPTIONS = [
    { label: '20 %', value: 0.20 },
    { label: '10 %', value: 0.10 },
    { label: '5,5 %', value: 0.055 },
    { label: '0 %', value: 0 },
  ];

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEdit ? 'Modifier' : 'Nouveau cocktail'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Name & description */}
        <View style={styles.section}>
          <Text style={styles.label}>Nom du cocktail</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ex: Mojito, Spritz..."
            placeholderTextColor={colors.tabBarInactive}
          />
          <Text style={[styles.label, { marginTop: spacing.md }]}>Description (optionnel)</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Notes sur la recette..."
            placeholderTextColor={colors.tabBarInactive}
            multiline
          />
        </View>

        {/* Ingredients */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIndicator, { backgroundColor: colors.primary }]} />
            <Text style={styles.sectionTitle}>Ingrédients</Text>
          </View>

          {ingredients.map((ing) => (
            <View key={ing.key} style={styles.ingredientCard}>
              <View style={styles.ingredientRow}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={styles.inputSmall}
                    value={ing.name}
                    onChangeText={(v) => updateIngredient(ing.key, 'name', v)}
                    placeholder="Nom ingrédient"
                    placeholderTextColor={colors.tabBarInactive}
                  />
                </View>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => setShowProductPicker(
                    showProductPicker === ing.key ? null : ing.key
                  )}
                >
                  <Ionicons
                    name={ing.productId ? 'link' : 'link-outline'}
                    size={18}
                    color={ing.productId ? colors.primary : colors.tabBarInactive}
                  />
                </TouchableOpacity>
                {ingredients.length > 1 && (
                  <TouchableOpacity onPress={() => removeIngredient(ing.key)}>
                    <Ionicons name="close-circle" size={22} color={colors.marginRed} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Product picker dropdown */}
              {showProductPicker === ing.key && (
                <ScrollView style={styles.pickerDropdown} nestedScrollEnabled>
                  {products.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.pickerItem}
                      onPress={() => selectProduct(ing.key, p)}
                    >
                      <Text style={styles.pickerItemText}>{p.name}</Text>
                      <Text style={styles.pickerItemSub}>
                        {formatPrice(p.purchasePriceHT)} / {p.containerVolumeCl} cl
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {products.length === 0 && (
                    <Text style={styles.pickerEmpty}>Aucun produit enregistré</Text>
                  )}
                </ScrollView>
              )}

              <View style={styles.ingredientMetaRow}>
                <View style={styles.metaField}>
                  <Text style={styles.metaLabel}>Quantité (cl)</Text>
                  <TextInput
                    style={styles.inputMeta}
                    value={ing.quantityCl}
                    onChangeText={(v) => {
                      updateIngredient(ing.key, 'quantityCl', v);
                      recalcIngredientCost(ing.key, v);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.tabBarInactive}
                  />
                </View>
                <View style={styles.metaField}>
                  <Text style={styles.metaLabel}>Coût (€)</Text>
                  <TextInput
                    style={styles.inputMeta}
                    value={ing.costPerUnit}
                    onChangeText={(v) => updateIngredient(ing.key, 'costPerUnit', v)}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor={colors.tabBarInactive}
                  />
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.addBtn} onPress={addIngredient}>
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={styles.addBtnText}>Ajouter un ingrédient</Text>
          </TouchableOpacity>
        </View>

        {/* Consumables */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIndicator, { backgroundColor: colors.accent }]} />
            <Text style={styles.sectionTitle}>Consommables</Text>
          </View>
          <Text style={styles.helperText}>Paille, citron, glace, déco...</Text>

          {consumables.map((con) => (
            <View key={con.key} style={styles.consumableRow}>
              <TextInput
                style={[styles.inputSmall, { flex: 2 }]}
                value={con.name}
                onChangeText={(v) => updateConsumable(con.key, 'name', v)}
                placeholder="Nom"
                placeholderTextColor={colors.tabBarInactive}
              />
              <TextInput
                style={[styles.inputSmall, { flex: 1, marginHorizontal: spacing.xs }]}
                value={con.unitCost}
                onChangeText={(v) => updateConsumable(con.key, 'unitCost', v)}
                keyboardType="decimal-pad"
                placeholder="€"
                placeholderTextColor={colors.tabBarInactive}
              />
              <TextInput
                style={[styles.inputSmall, { width: 50 }]}
                value={con.quantity}
                onChangeText={(v) => updateConsumable(con.key, 'quantity', v)}
                keyboardType="decimal-pad"
                placeholder="Qté"
                placeholderTextColor={colors.tabBarInactive}
              />
              <TouchableOpacity onPress={() => removeConsumable(con.key)} style={{ marginLeft: spacing.xs }}>
                <Ionicons name="close-circle" size={22} color={colors.marginRed} />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addBtn} onPress={addConsumable}>
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text style={[styles.addBtnText, { color: colors.accent }]}>Ajouter un consommable</Text>
          </TouchableOpacity>
        </View>

        {/* Selling price & TVA */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIndicator, { backgroundColor: colors.secondary }]} />
            <Text style={styles.sectionTitle}>Prix de vente</Text>
          </View>

          <Text style={styles.label}>Prix de vente TTC</Text>
          <View style={styles.priceRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={sellingPrice}
              onChangeText={setSellingPrice}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.tabBarInactive}
            />
            <Text style={styles.priceSuffix}>€</Text>
          </View>

          <Text style={[styles.label, { marginTop: spacing.md }]}>TVA</Text>
          <View style={styles.tvaRow}>
            {TVA_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.tvaBtn, tvaRate === opt.value && styles.tvaBtnActive]}
                onPress={() => setTvaRate(opt.value)}
              >
                <Text style={[styles.tvaText, tvaRate === opt.value && styles.tvaTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Public toggle */}
          <TouchableOpacity
            style={styles.publicRow}
            onPress={() => setIsPublic(!isPublic)}
          >
            <Ionicons
              name={isPublic ? 'checkbox' : 'square-outline'}
              size={22}
              color={isPublic ? colors.primary : colors.tabBarInactive}
            />
            <Text style={styles.publicText}>Partager avec la communauté</Text>
          </TouchableOpacity>
        </View>

        {/* Live preview */}
        {preview && (
          <View style={[styles.section, styles.previewCard]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIndicator, { backgroundColor: MARGIN_COLOR_MAP[preview.colorCode] }]} />
              <Text style={styles.sectionTitle}>Aperçu marge</Text>
            </View>
            <View style={styles.previewGrid}>
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Coût total HT</Text>
                <Text style={styles.previewValue}>{formatPrice(preview.totalCostHT)}</Text>
              </View>
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Prix vente HT</Text>
                <Text style={styles.previewValue}>{formatPrice(preview.sellingPriceHT)}</Text>
              </View>
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Marge</Text>
                <Text style={[styles.previewValueBig, { color: MARGIN_COLOR_MAP[preview.colorCode] }]}>
                  {formatPercent(preview.marginPercent)}
                </Text>
              </View>
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Coefficient</Text>
                <Text style={styles.previewValue}>x {preview.coefficient.toFixed(1)}</Text>
              </View>
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Gain / cocktail</Text>
                <Text style={styles.previewValue}>{formatPrice(preview.marginHT)}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text,
  },
  saveBtn: {
    ...typography.button,
    color: colors.primary,
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

  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  helperText: {
    ...typography.caption,
    color: colors.tabBarInactive,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.body,
    color: colors.text,
  },
  inputSmall: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    ...typography.bodySmall,
    color: colors.text,
  },
  inputMeta: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    ...typography.bodySmall,
    color: colors.text,
    textAlign: 'center',
  },

  ingredientCard: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ingredientMetaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  metaField: {
    flex: 1,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  linkBtn: {
    padding: spacing.xs,
  },

  pickerDropdown: {
    maxHeight: 150,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerItem: {
    padding: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerItemText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  pickerItemSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  pickerEmpty: {
    ...typography.bodySmall,
    color: colors.tabBarInactive,
    padding: spacing.md,
    textAlign: 'center',
  },

  consumableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  addBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priceSuffix: {
    ...typography.h3,
    color: colors.textSecondary,
  },

  tvaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tvaBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
  },
  tvaBtnActive: {
    backgroundColor: colors.primary,
  },
  tvaText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tvaTextActive: {
    color: colors.white,
  },

  publicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  publicText: {
    ...typography.bodySmall,
    color: colors.text,
  },

  previewCard: {
    borderWidth: 2,
    borderColor: colors.light,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  previewItem: {
    minWidth: '40%' as any,
  },
  previewLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  previewValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  previewValueBig: {
    ...typography.h2,
    fontWeight: '800',
    marginTop: 2,
  },
});
