import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Product, ServingType, ServingMarginResult, calculateServingMargin, MARGIN_COLOR_MAP } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import * as servingService from '../../services/serving.service';
import { api } from '../../services/api';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'ProductDetail'>;

export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params as { productId: string };
  const [product, setProduct] = useState<Product | null>(null);
  const [servingTypes, setServingTypes] = useState<ServingType[]>([]);
  const [savedServings, setSavedServings] = useState<ServingMarginResult[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [productId])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [productRes, typesRes, servingsRes] = await Promise.all([
        api.get<Product>(`/products/${productId}`),
        servingService.getServingTypes(),
        servingService.getProductServings(productId),
      ]);
      setProduct(productRes.data);
      setServingTypes(typesRes);
      setSavedServings(servingsRes);

      // Pre-fill prices from saved servings
      const priceMap: Record<string, string> = {};
      for (const s of servingsRes) {
        priceMap[s.servingType.id] = s.sellingPriceTTC.toFixed(2).replace('.', ',');
      }
      setPrices(priceMap);
    } catch {
      Alert.alert('Erreur', 'Impossible de charger le produit');
    } finally {
      setLoading(false);
    }
  };

  const getLocalMargin = (st: ServingType): ServingMarginResult | null => {
    if (!product) return null;
    const raw = prices[st.id];
    if (!raw) return null;
    const price = parseFloat(raw.replace(',', '.'));
    if (isNaN(price) || price <= 0) return null;
    return calculateServingMargin(
      product.purchasePriceHT,
      product.containerVolumeCl,
      product.tvaRate,
      st,
      price,
    );
  };

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    try {
      const servings = Object.entries(prices)
        .map(([servingTypeId, raw]) => ({
          servingTypeId,
          sellingPriceTTC: parseFloat(raw.replace(',', '.')),
        }))
        .filter((s) => !isNaN(s.sellingPriceTTC) && s.sellingPriceTTC > 0);

      if (servings.length === 0) {
        Alert.alert('Info', 'Entrez au moins un prix de vente');
        setSaving(false);
        return;
      }

      const results = await servingService.upsertProductServings(productId, servings);
      setSavedServings(results);
      Alert.alert('Succès', 'Prix de vente enregistrés');
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenWrapper>
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenWrapper>
    );
  }

  if (!product) {
    return (
      <ScreenWrapper>
        <Text style={styles.error}>Produit non trouvé</Text>
      </ScreenWrapper>
    );
  }

  const servingsPerContainer = (volumeCl: number) =>
    Math.floor((product.containerVolumeCl / volumeCl) * 100) / 100;

  return (
    <ScreenWrapper>
      <Text style={styles.title}>{product.name}</Text>
      <Text style={styles.subtitle}>
        Achat : {product.purchasePriceHT.toFixed(2)} € HT · {product.containerVolumeCl} cl
      </Text>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Prix de vente par service</Text>
        <Text style={styles.sectionDesc}>
          Entrez le prix TTC pour chaque type de service
        </Text>

        {servingTypes.map((st) => {
          const margin = getLocalMargin(st);
          const nbServings = servingsPerContainer(st.volumeCl);

          return (
            <View key={st.id} style={styles.servingBlock}>
              <View style={styles.servingHeader}>
                <Text style={styles.servingName}>{st.icon} {st.name}</Text>
                <Text style={styles.servingMeta}>{st.volumeCl} cl · {nbServings.toFixed(1)} par bouteille</Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Prix TTC</Text>
                <View style={styles.priceInputWrap}>
                  <TextInput
                    style={styles.priceInput}
                    value={prices[st.id] || ''}
                    onChangeText={(v) => setPrices((prev) => ({ ...prev, [st.id]: v }))}
                    keyboardType="numeric"
                    placeholder="0,00"
                    placeholderTextColor={colors.grayMedium}
                  />
                  <Text style={styles.priceCurrency}>€</Text>
                </View>
              </View>

              {margin && (
                <View style={styles.marginGrid}>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Coût/dose</Text>
                    <Text style={styles.marginValue}>{margin.costPerServingHT.toFixed(2)} €</Text>
                  </View>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Marge/dose</Text>
                    <Text style={[styles.marginValue, { color: MARGIN_COLOR_MAP[margin.colorCode] }]}>
                      {margin.marginPerServingHT.toFixed(2)} €
                    </Text>
                  </View>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Marge</Text>
                    <Text style={[styles.marginValueBig, { color: MARGIN_COLOR_MAP[margin.colorCode] }]}>
                      {margin.marginPercent.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Gain/bouteille</Text>
                    <Text style={[styles.marginValue, { color: MARGIN_COLOR_MAP[margin.colorCode] }]}>
                      {margin.marginPerContainer.toFixed(2)} €
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </Card>

      <Button title="Enregistrer les prix" onPress={handleSave} loading={saving} />

      <Button
        title="Modifier le produit"
        onPress={() => navigation.navigate('ProductForm', { productId: product.id })}
        variant="outline"
        style={styles.editBtn}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  error: {
    ...typography.body,
    color: colors.marginRed,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionDesc: {
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
  editBtn: {
    marginTop: spacing.sm,
  },
});
