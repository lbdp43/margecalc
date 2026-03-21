import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity } from 'react-native';
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
import { PriceSlider } from '../../components/ui/PriceSlider';
import { useAuthStore } from '../../store/auth.store';
import * as productService from '../../services/product.service';
import * as categoryService from '../../services/category.service';
import * as servingService from '../../services/serving.service';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'ProductForm'>;

type ServingMode = 'price' | 'margin' | 'coefficient';

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

  // Which serving types are enabled
  const [enabledServings, setEnabledServings] = useState<Set<string>>(new Set());
  // Selling price TTC per serving type (the computed value from slider)
  const [servingPrices, setServingPrices] = useState<Record<string, number>>({});
  // Margin mode per serving type
  const [servingModes, setServingModes] = useState<Record<string, ServingMode>>({});

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

  useEffect(() => {
    if (existingServings && existingServings.length > 0) {
      const enabled = new Set<string>();
      const prices: Record<string, number> = {};
      for (const s of existingServings) {
        enabled.add(s.servingType.id);
        prices[s.servingType.id] = s.sellingPriceTTC;
      }
      setEnabledServings(enabled);
      setServingPrices(prices);
    }
  }, [existingServings]);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const currentContainerVol = parseLocaleFloat(containerVolume) || 0;
  const currentPurchasePrice = parseLocaleFloat(purchasePrice) || 0;

  const toggleServing = (id: string) => {
    setEnabledServings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const setServingMode = (servingId: string, mode: ServingMode) => {
    setServingModes((prev) => ({ ...prev, [servingId]: mode }));
  };

  // Compute cost per serving for a given serving type
  const getCostPerServing = (st: ServingType): number => {
    if (currentContainerVol <= 0 || st.volumeCl <= 0) return 0;
    const servingsPerContainer = currentContainerVol / st.volumeCl;
    return currentPurchasePrice / servingsPerContainer;
  };

  // Get margin result for a serving type
  const getServingMargin = (st: ServingType): ServingMarginResult | null => {
    const price = servingPrices[st.id];
    if (!price || price <= 0 || currentContainerVol <= 0 || currentPurchasePrice < 0) return null;
    try {
      return calculateServingMargin(currentPurchasePrice, currentContainerVol, tvaRate, st, price);
    } catch {
      return null;
    }
  };

  // Update price from slider based on current mode
  const handleSliderChange = (st: ServingType, sliderValue: number, mode: ServingMode) => {
    const costHT = getCostPerServing(st);
    let priceTTC: number;

    switch (mode) {
      case 'price':
        priceTTC = sliderValue;
        break;
      case 'margin': {
        // margin% → selling price
        const marginPct = sliderValue;
        if (marginPct >= 100) return;
        const sellingPriceHT = costHT / (1 - marginPct / 100);
        priceTTC = sellingPriceHT * (1 + tvaRate);
        break;
      }
      case 'coefficient': {
        const coeff = sliderValue;
        const sellingPriceHT = costHT * coeff;
        priceTTC = sellingPriceHT * (1 + tvaRate);
        break;
      }
    }

    setServingPrices((prev) => ({ ...prev, [st.id]: Math.round(priceTTC * 100) / 100 }));
  };

  // Get slider value from current price based on mode
  const getSliderValue = (st: ServingType, mode: ServingMode): number => {
    const price = servingPrices[st.id] || 0;
    const costHT = getCostPerServing(st);

    switch (mode) {
      case 'price':
        return price;
      case 'margin': {
        if (price <= 0) return 0;
        const sellingHT = price / (1 + tvaRate);
        if (sellingHT <= 0) return 0;
        return ((sellingHT - costHT) / sellingHT) * 100;
      }
      case 'coefficient': {
        if (costHT <= 0) return 1;
        const sellingHT = price / (1 + tvaRate);
        return sellingHT / costHT;
      }
    }
  };

  // Get slider config based on mode and cost
  const getSliderConfig = (st: ServingType, mode: ServingMode) => {
    const costHT = getCostPerServing(st);
    const costTTC = costHT * (1 + tvaRate);

    switch (mode) {
      case 'price':
        return {
          min: Math.max(0.1, Math.floor(costTTC * 10) / 10),
          max: Math.max(costTTC * 8, 20),
          step: 0.1,
          formatLabel: (v: number) => `${v.toFixed(1)} €`,
        };
      case 'margin':
        return {
          min: 0,
          max: 95,
          step: 1,
          formatLabel: (v: number) => `${v.toFixed(0)} %`,
        };
      case 'coefficient':
        return {
          min: 1,
          max: 10,
          step: 0.1,
          formatLabel: (v: number) => `x ${v.toFixed(1)}`,
        };
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const servings = Array.from(enabledServings)
        .map((servingTypeId) => ({
          servingTypeId,
          sellingPriceTTC: servingPrices[servingTypeId] || 0,
        }))
        .filter((s) => s.sellingPriceTTC > 0);

      if (servings.length === 0) {
        throw new Error('Sélectionnez au moins un type de service et ajustez le prix');
      }

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
      Alert.alert('Erreur', 'Remplissez le nom, le prix d\'achat et le volume');
      return;
    }
    saveMutation.mutate();
  };

  const tvaOptions = [
    { label: '20%', value: TVA_RATES.RATE_20 },
    { label: '10%', value: TVA_RATES.RATE_10 },
    { label: '5,5%', value: TVA_RATES.RATE_5_5 },
  ];

  const hasValidProduct = name && currentPurchasePrice > 0 && currentContainerVol > 0;
  const modeLabels: { mode: ServingMode; label: string }[] = [
    { mode: 'price', label: 'Prix' },
    { mode: 'margin', label: 'Marge' },
    { mode: 'coefficient', label: 'Coeff' },
  ];

  return (
    <ScreenWrapper>
      <Text style={styles.title}>{isEditing ? 'Modifier le produit' : 'Nouveau produit'}</Text>

      {/* === Produit === */}
      <Input
        label="Nom du produit *"
        value={name}
        onChangeText={setName}
        placeholder="Ex: Herbe des Druides"
      />

      <View style={styles.categoryRow}>
        <Text style={styles.sectionLabel}>Catégorie *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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

      {/* === Contenant === */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Contenant *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
          {CONTAINER_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.volumeCl}
              style={[
                styles.presetBtn,
                currentContainerVol === preset.volumeCl && styles.presetBtnActive,
              ]}
              onPress={() => setContainerVolume(String(preset.volumeCl))}
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

      {/* === TVA === */}
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
        placeholder="Optionnel"
      />

      {/* === Services (contenants de vente) === */}
      {hasValidProduct && (
        <>
          <Text style={styles.sectionTitle}>Comment vendez-vous ce produit ?</Text>
          <Text style={styles.sectionDesc}>
            Sélectionnez vos types de service et ajustez le prix avec le curseur
          </Text>

          {/* Toggle serving types */}
          <View style={styles.servingToggles}>
            {servingTypes.map((st) => {
              const isOn = enabledServings.has(st.id);
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[styles.servingToggle, isOn && styles.servingToggleActive]}
                  onPress={() => toggleServing(st.id)}
                >
                  <Text style={[styles.servingToggleText, isOn && styles.servingToggleTextActive]}>
                    {st.icon} {st.name}
                  </Text>
                  <Text style={[styles.servingToggleVol, isOn && styles.servingToggleTextActive]}>
                    {st.volumeCl} cl
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Slider + margin for each enabled serving */}
          {servingTypes
            .filter((st) => enabledServings.has(st.id))
            .map((st) => {
              const mode = servingModes[st.id] || 'price';
              const margin = getServingMargin(st);
              const sliderValue = getSliderValue(st, mode);
              const config = getSliderConfig(st, mode);
              const nbServings = currentContainerVol / st.volumeCl;
              const accentColor = margin
                ? MARGIN_COLOR_MAP[margin.colorCode]
                : colors.primary;

              return (
                <Card key={st.id} style={styles.servingCard}>
                  <View style={styles.servingCardHeader}>
                    <Text style={styles.servingCardName}>
                      {st.icon} {st.name} ({st.volumeCl} cl)
                    </Text>
                    <Text style={styles.servingCardMeta}>
                      {nbServings.toFixed(1)} / contenant
                    </Text>
                  </View>

                  {/* Mode tabs */}
                  <View style={styles.modeTabs}>
                    {modeLabels.map((m) => (
                      <TouchableOpacity
                        key={m.mode}
                        style={[styles.modeTab, mode === m.mode && styles.modeTabActive]}
                        onPress={() => setServingMode(st.id, m.mode)}
                      >
                        <Text
                          style={[
                            styles.modeTabText,
                            mode === m.mode && styles.modeTabTextActive,
                          ]}
                        >
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Slider */}
                  <PriceSlider
                    min={config.min}
                    max={config.max}
                    step={config.step}
                    value={isNaN(sliderValue) ? config.min : Math.max(config.min, Math.min(config.max, sliderValue))}
                    onValueChange={(v) => handleSliderChange(st, v, mode)}
                    formatLabel={config.formatLabel}
                    accentColor={accentColor}
                  />

                  {/* Results */}
                  {margin && (
                    <View style={styles.resultRow}>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Prix TTC</Text>
                        <Text style={styles.resultValue}>
                          {formatPrice(margin.sellingPriceTTC)}
                        </Text>
                      </View>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Marge</Text>
                        <Text
                          style={[
                            styles.resultValueBig,
                            { color: accentColor },
                          ]}
                        >
                          {formatPercent(margin.marginPercent)}
                        </Text>
                      </View>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Gain/dose</Text>
                        <Text style={[styles.resultValue, { color: accentColor }]}>
                          {formatPrice(margin.marginPerServingHT)}
                        </Text>
                      </View>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Gain total</Text>
                        <Text style={[styles.resultValue, { color: accentColor }]}>
                          {formatPrice(margin.marginPerContainer)}
                        </Text>
                      </View>
                    </View>
                  )}
                </Card>
              );
            })}
        </>
      )}

      {enabledServings.size > 0 && (
        <Button
          title={isEditing ? 'Enregistrer' : 'Ajouter le produit'}
          onPress={handleSave}
          loading={saveMutation.isPending}
          style={styles.saveBtn}
        />
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
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  categoryRow: {
    marginBottom: spacing.md,
  },
  categoryBtn: {
    marginRight: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  section: {
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
  // Serving toggles
  servingToggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  servingToggle: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    minWidth: 90,
  },
  servingToggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.light,
  },
  servingToggleText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  servingToggleTextActive: {
    color: colors.primary,
  },
  servingToggleVol: {
    ...typography.caption,
    color: colors.grayMedium,
    marginTop: 2,
  },
  // Serving card with slider
  servingCard: {
    marginBottom: spacing.md,
  },
  servingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  servingCardName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  servingCardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  // Mode tabs
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    padding: 2,
    marginBottom: spacing.xs,
  },
  modeTab: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: borderRadius.sm - 2,
  },
  modeTabActive: {
    backgroundColor: colors.primary,
  },
  modeTabText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeTabTextActive: {
    color: colors.textLight,
  },
  // Results
  resultRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  resultItem: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
  },
  resultLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  resultValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  resultValueBig: {
    ...typography.h3,
    fontWeight: '700',
  },
  saveBtn: {
    marginTop: spacing.md,
  },
  deleteBtn: {
    marginTop: spacing.sm,
    borderColor: colors.marginRed,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
