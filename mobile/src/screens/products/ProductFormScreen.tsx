import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MarginMode,
  TVA_RATES,
  Category,
  CONTAINER_PRESETS,
  parseLocaleFloat,
  ServingType,
  calculateServingMargin,
  ServingMarginResult,
  MARGIN_COLOR_MAP,
  formatPrice,
  formatPercent,
} from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuthStore } from '../../store/auth.store';
import * as productService from '../../services/product.service';
import * as categoryService from '../../services/category.service';
import * as servingService from '../../services/serving.service';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'ProductForm'>;

export function ProductFormScreen({ route, navigation }: Props) {
  const productId = route.params?.productId;
  const scanData = route.params?.scanData as {
    name?: string;
    categoryId?: string;
    containerVolumeCl?: number;
    estimatedPriceHT?: number;
  } | undefined;
  const isEditing = !!productId;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const defaultContainer = user?.defaultContainerVolumeCl || 70;

  const [name, setName] = useState(scanData?.name || '');
  const [categoryId, setCategoryId] = useState(scanData?.categoryId || '');
  const [purchasePrice, setPurchasePrice] = useState(
    scanData?.estimatedPriceHT ? String(scanData.estimatedPriceHT) : ''
  );
  const [containerVolume, setContainerVolume] = useState(
    scanData?.containerVolumeCl ? String(scanData.containerVolumeCl) : String(defaultContainer)
  );
  const [tvaRate, setTvaRate] = useState(user?.isAutoEntrepreneur ? 0 : TVA_RATES.RATE_20);
  const [supplier, setSupplier] = useState('');
  // Prices per serving type: { servingTypeId: "3,50" }
  const [prices, setPrices] = useState<Record<string, string>>({});

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoryService.getCategories,
  });

  const { data: servingTypes = [] } = useQuery<ServingType[]>({
    queryKey: ['servingTypes'],
    queryFn: servingService.getServingTypes,
  });

  const { data: existingProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productService.getProduct(productId!),
    enabled: isEditing,
  });

  // Load existing servings when editing
  const { data: existingServings } = useQuery({
    queryKey: ['productServings', productId],
    queryFn: () => servingService.getProductServings(productId!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingProduct) {
      setName(existingProduct.name);
      setCategoryId(existingProduct.categoryId);
      setPurchasePrice(String(existingProduct.purchasePriceHT));
      setContainerVolume(String(existingProduct.containerVolumeCl));
      setTvaRate(existingProduct.tvaRate);
      setSupplier(existingProduct.supplier || '');
    }
  }, [existingProduct]);

  // Pre-fill prices from existing servings
  useEffect(() => {
    if (existingServings && existingServings.length > 0) {
      const priceMap: Record<string, string> = {};
      for (const s of existingServings) {
        priceMap[s.servingType.id] = s.sellingPriceTTC.toFixed(2).replace('.', ',');
      }
      setPrices(priceMap);
    }
  }, [existingServings]);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const currentContainerVol = parseLocaleFloat(containerVolume) || 0;
  const currentPurchasePrice = parseLocaleFloat(purchasePrice) || 0;

  // Calculate margin for a serving type in real-time
  const getServingMargin = (st: ServingType): ServingMarginResult | null => {
    const raw = prices[st.id];
    if (!raw) return null;
    const price = parseLocaleFloat(raw);
    if (isNaN(price) || price <= 0 || currentContainerVol <= 0 || currentPurchasePrice < 0) return null;
    try {
      return calculateServingMargin(currentPurchasePrice, currentContainerVol, tvaRate, st, price);
    } catch {
      return null;
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Collect valid servings
      const servings = Object.entries(prices)
        .map(([servingTypeId, raw]) => ({
          servingTypeId,
          sellingPriceTTC: parseLocaleFloat(raw),
        }))
        .filter((s) => !isNaN(s.sellingPriceTTC) && s.sellingPriceTTC > 0);

      if (servings.length === 0) {
        throw new Error('Entrez au moins un prix de vente');
      }

      // Find the first serving to use as default dose
      const firstServing = servings[0];
      const firstServingType = servingTypes.find((st) => st.id === firstServing.servingTypeId);
      const doseVolumeCl = firstServingType?.volumeCl || 5;

      const productData = {
        name,
        categoryId,
        purchasePriceHT: parseLocaleFloat(purchasePrice),
        containerVolumeCl: parseLocaleFloat(containerVolume),
        doseVolumeCl,
        marginMode: MarginMode.FIX_SELLING_PRICE,
        sellingPriceTTC: firstServing.sellingPriceTTC,
        tvaRate,
        supplier: supplier || undefined,
      };

      let savedProductId: string;

      if (isEditing) {
        const updated = await productService.updateProduct(productId!, productData);
        savedProductId = updated.id;
      } else {
        const created = await productService.createProduct(productData);
        savedProductId = created.id;
      }

      // Save servings
      await servingService.upsertProductServings(savedProductId, servings);

      return savedProductId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['productServings', productId] });
      navigation.goBack();
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err.response?.data?.error || err.message || 'Impossible de sauvegarder');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => productService.deleteProduct(productId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigation.goBack();
    },
  });

  const handleDelete = () => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  };

  const handleSave = () => {
    if (!name || !purchasePrice || !containerVolume) {
      Alert.alert('Erreur', 'Veuillez remplir le nom, le prix d\'achat et le volume du contenant');
      return;
    }
    const pp = parseLocaleFloat(purchasePrice);
    const cv = parseLocaleFloat(containerVolume);
    if (isNaN(pp) || isNaN(cv)) {
      Alert.alert('Erreur', 'Vérifiez les valeurs numériques');
      return;
    }
    saveMutation.mutate();
  };

  const handleContainerPreset = (volumeCl: number) => {
    setContainerVolume(String(volumeCl));
  };

  const tvaOptions = [
    { label: '20%', value: TVA_RATES.RATE_20 },
    { label: '10%', value: TVA_RATES.RATE_10 },
    { label: '5,5%', value: TVA_RATES.RATE_5_5 },
  ];

  // Count servings with prices
  const filledServings = Object.values(prices).filter((v) => {
    const n = parseLocaleFloat(v);
    return !isNaN(n) && n > 0;
  }).length;

  return (
    <ScreenWrapper>
      <Text style={styles.title}>{isEditing ? 'Modifier le produit' : 'Nouveau produit'}</Text>

      {/* === SECTION 1: Produit === */}
      <Input
        label="Nom du produit *"
        value={name}
        onChangeText={setName}
        placeholder="Ex: Herbe des Druides"
      />

      <View style={styles.categoryRow}>
        <Text style={styles.sectionLabel}>Catégorie *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              title={`${cat.icon} ${cat.name}`}
              onPress={() => setCategoryId(cat.id)}
              variant={categoryId === cat.id ? 'primary' : 'outline'}
              style={styles.categoryBtn}
            />
          ))}
        </ScrollView>
      </View>

      <Input
        label="Prix d'achat HT *"
        value={purchasePrice}
        onChangeText={setPurchasePrice}
        keyboardType="decimal-pad"
        placeholder="0,00"
        suffix="€"
      />

      {/* === SECTION 2: Contenant === */}
      <View style={styles.containerSection}>
        <Text style={styles.sectionLabel}>Volume du contenant *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
          {CONTAINER_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.volumeCl}
              style={[
                styles.presetBtn,
                currentContainerVol === preset.volumeCl && styles.presetBtnActive,
              ]}
              onPress={() => handleContainerPreset(preset.volumeCl)}
            >
              <Text
                style={[
                  styles.presetBtnText,
                  currentContainerVol === preset.volumeCl && styles.presetBtnTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Input
          label=""
          value={containerVolume}
          onChangeText={setContainerVolume}
          keyboardType="decimal-pad"
          placeholder="70"
          suffix="cl"
        />
      </View>

      {/* === SECTION 3: TVA === */}
      {!user?.isAutoEntrepreneur && (
        <View style={styles.tvaRow}>
          <Text style={styles.sectionLabel}>TVA</Text>
          <View style={styles.tvaOptions}>
            {tvaOptions.map((opt) => (
              <Button
                key={opt.value}
                title={opt.label}
                onPress={() => setTvaRate(opt.value)}
                variant={tvaRate === opt.value ? 'primary' : 'outline'}
                style={styles.tvaBtn}
              />
            ))}
          </View>
        </View>
      )}

      <Input
        label="Fournisseur"
        value={supplier}
        onChangeText={setSupplier}
        placeholder="Nom du fournisseur (optionnel)"
      />

      {/* === SECTION 4: Prix de vente par service === */}
      <Card style={styles.servingSection}>
        <Text style={styles.servingSectionTitle}>Prix de vente par service</Text>
        <Text style={styles.servingSectionDesc}>
          Entrez le prix TTC pour chaque type de service que vous proposez
        </Text>

        {servingTypes.map((st) => {
          const margin = getServingMargin(st);
          const nbServings = currentContainerVol > 0 ? currentContainerVol / st.volumeCl : 0;

          return (
            <View key={st.id} style={styles.servingBlock}>
              <View style={styles.servingHeader}>
                <Text style={styles.servingName}>
                  {st.icon} {st.name}
                </Text>
                <Text style={styles.servingMeta}>
                  {st.volumeCl} cl{nbServings > 0 ? ` · ${nbServings.toFixed(1)} / contenant` : ''}
                </Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Prix TTC</Text>
                <View style={styles.priceInputWrap}>
                  <TextInput
                    style={styles.priceInput}
                    value={prices[st.id] || ''}
                    onChangeText={(v) => setPrices((prev) => ({ ...prev, [st.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor={colors.grayMedium}
                  />
                  <Text style={styles.priceCurrency}>€</Text>
                </View>
              </View>

              {margin && (
                <View style={styles.marginGrid}>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Coût</Text>
                    <Text style={styles.marginValue}>{formatPrice(margin.costPerServingHT)}</Text>
                  </View>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Marge</Text>
                    <Text style={[styles.marginValueBig, { color: MARGIN_COLOR_MAP[margin.colorCode] }]}>
                      {formatPercent(margin.marginPercent)}
                    </Text>
                  </View>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Gain/dose</Text>
                    <Text style={[styles.marginValue, { color: MARGIN_COLOR_MAP[margin.colorCode] }]}>
                      {formatPrice(margin.marginPerServingHT)}
                    </Text>
                  </View>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Gain/contenant</Text>
                    <Text style={[styles.marginValue, { color: MARGIN_COLOR_MAP[margin.colorCode] }]}>
                      {formatPrice(margin.marginPerContainer)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </Card>

      <Button
        title={isEditing ? 'Enregistrer' : 'Ajouter le produit'}
        onPress={handleSave}
        loading={saveMutation.isPending}
      />

      {filledServings > 0 && (
        <Text style={styles.servingCount}>
          {filledServings} type{filledServings > 1 ? 's' : ''} de service configuré{filledServings > 1 ? 's' : ''}
        </Text>
      )}

      {isEditing && (
        <Button
          title="Supprimer"
          onPress={handleDelete}
          variant="outline"
          style={styles.deleteBtn}
        />
      )}

      <View style={styles.bottomSpacer} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  categoryRow: {
    marginBottom: spacing.md,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryBtn: {
    marginRight: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  containerSection: {
    marginBottom: spacing.sm,
  },
  presetScroll: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  presetBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    backgroundColor: colors.inputBackground,
  },
  presetBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  presetBtnTextActive: {
    color: colors.white,
  },
  tvaRow: {
    marginBottom: spacing.md,
  },
  tvaOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tvaBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  // Serving section
  servingSection: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  servingSectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  servingSectionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  servingBlock: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  servingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  servingName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  servingMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  priceLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    width: 80,
    textAlign: 'right',
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  priceCurrency: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  marginGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  marginItem: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
  },
  marginLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  marginValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  marginValueBig: {
    ...typography.h3,
    fontWeight: '700',
  },
  servingCount: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  deleteBtn: {
    marginTop: spacing.sm,
    borderColor: colors.marginRed,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
