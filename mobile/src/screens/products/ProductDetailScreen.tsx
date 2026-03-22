import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, Image, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Product, ServingType, ServingMarginResult, calculateServingMargin, MARGIN_COLOR_MAP } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { YinYangSpinner } from '../../components/ui/YinYangSpinner';
import { ServingTypeIcon } from '../../components/ui/ServingTypeIcon';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import * as servingService from '../../services/serving.service';
import * as productService from '../../services/product.service';
import { PriceHistoryEntry } from '../../services/product.service';
import { api } from '../../services/api';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

type Props = NativeStackScreenProps<any, 'ProductDetail'>;

export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params as { productId: string };
  const [product, setProduct] = useState<Product | null>(null);
  const [servingTypes, setServingTypes] = useState<ServingType[]>([]);
  const [savedServings, setSavedServings] = useState<ServingMarginResult[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => productService.deleteProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigation.navigate('ProductList');
    },
    onError: () => Alert.alert('Erreur', 'Impossible de supprimer le produit'),
  });

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

      const historyRes = await productService.getPriceHistory(productId);
      setPriceHistory(historyRes);

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
        <View style={styles.loadingContainer}>
          <YinYangSpinner size={80} message="Chargement du produit…" />
        </View>
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
      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={styles.backText}>Retour</Text>
      </TouchableOpacity>

      {/* Product header */}
      {product.imageUrl && (
        <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" />
      )}

      <View style={styles.headerCard}>
        <Text style={styles.title}>{product.name}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{product.purchasePriceHT.toFixed(2)} € HT</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="cube-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>{product.containerVolumeCl} cl</Text>
          </View>
        </View>
      </View>

      {/* Serving types with prices */}
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>Prix de vente par service</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Entrez le prix TTC pour chaque type de service
        </Text>

        {servingTypes.map((st) => {
          const margin = getLocalMargin(st);
          const nbServings = servingsPerContainer(st.volumeCl);

          return (
            <View key={st.id} style={styles.servingBlock}>
              <View style={styles.servingHeader}>
                <View style={styles.servingNameRow}>
                  <ServingTypeIcon name={st.name} icon={st.icon} size={36} />
                  <View>
                    <Text style={styles.servingName}>{st.name}</Text>
                    <Text style={styles.servingMeta}>{st.volumeCl} cl · {nbServings.toFixed(1)} / bouteille</Text>
                  </View>
                </View>
                <View style={styles.priceInputWrap}>
                  <TextInput
                    style={styles.priceInput}
                    value={prices[st.id] || ''}
                    onChangeText={(v) => setPrices((prev) => ({ ...prev, [st.id]: v }))}
                    keyboardType="numeric"
                    placeholder="0,00"
                    placeholderTextColor={colors.tabBarInactive}
                  />
                  <Text style={styles.priceCurrency}>€</Text>
                </View>
              </View>

              {margin && (
                <View style={styles.marginGrid}>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Coût</Text>
                    <Text style={styles.marginValue}>{margin.costPerServingHT.toFixed(2)} €</Text>
                  </View>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Marge/dose</Text>
                    <Text style={[styles.marginValue, { color: MARGIN_COLOR_MAP[margin.colorCode] }]}>
                      {margin.marginPerServingHT.toFixed(2)} €
                    </Text>
                  </View>
                  <View style={[styles.marginItem, styles.marginItemAccent]}>
                    <Text style={styles.marginLabel}>Marge</Text>
                    <Text style={[styles.marginValueBig, { color: MARGIN_COLOR_MAP[margin.colorCode] }]}>
                      {margin.marginPercent.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.marginItem}>
                    <Text style={styles.marginLabel}>Gain/bout.</Text>
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

      {priceHistory.length > 0 && (
        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>Historique des prix</Text>
          </View>
          {priceHistory.map((entry) => {
            const diff = entry.newPrice - entry.oldPrice;
            const isUp = diff > 0;
            return (
              <View key={entry.id} style={styles.historyRow}>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyPrice}>
                    {entry.oldPrice.toFixed(2)} € → {entry.newPrice.toFixed(2)} €
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(entry.changedAt).toLocaleDateString('fr-FR')} · {entry.source === 'scan' ? 'Scan' : 'Manuel'}
                  </Text>
                </View>
                <View style={[styles.historyBadge, { backgroundColor: isUp ? colors.marginRed + '12' : colors.marginGreen + '12' }]}>
                  <Ionicons name={isUp ? 'arrow-up' : 'arrow-down'} size={14} color={isUp ? colors.marginRed : colors.marginGreen} />
                  <Text style={[styles.historyDiff, { color: isUp ? colors.marginRed : colors.marginGreen }]}>
                    {Math.abs(diff).toFixed(2)} €
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <Button
        title="Supprimer le produit"
        onPress={() => {
          Alert.alert('Supprimer', `Supprimer "${product.name}" ?`, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => deleteMutation.mutate() },
          ]);
        }}
        variant="danger"
        style={styles.deleteBtn}
        loading={deleteMutation.isPending}
      />

      <View style={{ height: spacing.xl }} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  backText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  productImage: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  headerCard: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionDot: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  sectionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginLeft: spacing.md + 4,
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
  servingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  servingName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  servingMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    width: 85,
    textAlign: 'right',
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  priceCurrency: {
    ...typography.body,
    fontWeight: '600',
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    alignItems: 'center',
  },
  marginItemAccent: {
    backgroundColor: colors.light,
  },
  marginLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 3,
  },
  marginValue: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  marginValueBig: {
    ...typography.h3,
    fontWeight: '800',
  },
  editBtn: {
    marginTop: spacing.sm,
  },
  deleteBtn: {
    marginTop: spacing.lg,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyInfo: {
    flex: 1,
  },
  historyPrice: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  historyDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  historyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  historyDiff: {
    ...typography.caption,
    fontWeight: '700',
  },
});
