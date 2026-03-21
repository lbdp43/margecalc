import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MarginMode, TVA_RATES, Category } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { MarginModeSelector } from '../../components/margin/MarginModeSelector';
import { MarginResultCard } from '../../components/margin/MarginResultCard';
import { useMarginCalculator } from '../../hooks/useMarginCalculator';
import { useAuthStore } from '../../store/auth.store';
import * as productService from '../../services/product.service';
import * as categoryService from '../../services/category.service';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'ProductForm'>;

export function ProductFormScreen({ route, navigation }: Props) {
  const productId = route.params?.productId;
  const isEditing = !!productId;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [containerVolume, setContainerVolume] = useState('');
  const [doseVolume, setDoseVolume] = useState('');
  const [marginMode, setMarginMode] = useState<MarginMode>(MarginMode.FIX_SELLING_PRICE);
  const [sellingPrice, setSellingPrice] = useState('');
  const [targetMargin, setTargetMargin] = useState('');
  const [coefficient, setCoefficient] = useState('');
  const [tvaRate, setTvaRate] = useState(user?.isAutoEntrepreneur ? 0 : TVA_RATES.RATE_20);
  const [supplier, setSupplier] = useState('');

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: categoryService.getCategories,
  });

  const { data: existingProduct } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productService.getProduct(productId!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingProduct) {
      setName(existingProduct.name);
      setCategoryId(existingProduct.categoryId);
      setPurchasePrice(String(existingProduct.purchasePriceHT));
      setContainerVolume(String(existingProduct.containerVolumeCl));
      setDoseVolume(String(existingProduct.doseVolumeCl));
      setMarginMode(existingProduct.marginMode as MarginMode);
      setSellingPrice(existingProduct.sellingPriceTTC ? String(existingProduct.sellingPriceTTC) : '');
      setTargetMargin(existingProduct.targetMarginPercent ? String(existingProduct.targetMarginPercent) : '');
      setCoefficient(existingProduct.coefficient ? String(existingProduct.coefficient) : '');
      setTvaRate(existingProduct.tvaRate);
      setSupplier(existingProduct.supplier || '');
    }
  }, [existingProduct]);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const marginResult = useMarginCalculator({
    purchasePriceHT: parseFloat(purchasePrice) || 0,
    containerVolumeCl: parseFloat(containerVolume) || 0,
    doseVolumeCl: parseFloat(doseVolume) || 0,
    marginMode,
    sellingPriceTTC: marginMode === MarginMode.FIX_SELLING_PRICE ? parseFloat(sellingPrice) || undefined : undefined,
    targetMarginPercent: marginMode === MarginMode.FIX_TARGET_MARGIN ? parseFloat(targetMargin) || undefined : undefined,
    coefficient: marginMode === MarginMode.FIX_COEFFICIENT ? parseFloat(coefficient) || undefined : undefined,
    tvaRate,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        name,
        categoryId,
        purchasePriceHT: parseFloat(purchasePrice),
        containerVolumeCl: parseFloat(containerVolume),
        doseVolumeCl: parseFloat(doseVolume),
        marginMode,
        sellingPriceTTC: marginMode === MarginMode.FIX_SELLING_PRICE ? parseFloat(sellingPrice) : undefined,
        targetMarginPercent: marginMode === MarginMode.FIX_TARGET_MARGIN ? parseFloat(targetMargin) : undefined,
        coefficient: marginMode === MarginMode.FIX_COEFFICIENT ? parseFloat(coefficient) : undefined,
        tvaRate,
        supplier: supplier || undefined,
      };

      if (isEditing) {
        return productService.updateProduct(productId!, data);
      }
      return productService.createProduct(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigation.goBack();
    },
    onError: (err: any) => {
      Alert.alert('Erreur', err.response?.data?.error || 'Impossible de sauvegarder');
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
    if (!name || !purchasePrice || !containerVolume || !doseVolume) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires');
      return;
    }
    saveMutation.mutate();
  };

  const tvaOptions = [
    { label: '20%', value: TVA_RATES.RATE_20 },
    { label: '10%', value: TVA_RATES.RATE_10 },
    { label: '5,5%', value: TVA_RATES.RATE_5_5 },
  ];

  return (
    <ScreenWrapper>
      <Text style={styles.title}>{isEditing ? 'Modifier le produit' : 'Nouveau produit'}</Text>

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

      <View style={styles.row}>
        <View style={styles.halfInput}>
          <Input
            label="Volume contenant *"
            value={containerVolume}
            onChangeText={setContainerVolume}
            keyboardType="decimal-pad"
            placeholder="70"
            suffix="cl"
          />
        </View>
        <View style={styles.halfInput}>
          <Input
            label="Dose de service *"
            value={doseVolume}
            onChangeText={setDoseVolume}
            keyboardType="decimal-pad"
            placeholder="4"
            suffix="cl"
          />
        </View>
      </View>

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

      <MarginModeSelector value={marginMode} onChange={setMarginMode} />

      {marginMode === MarginMode.FIX_SELLING_PRICE && (
        <Input
          label="Prix de vente TTC"
          value={sellingPrice}
          onChangeText={setSellingPrice}
          keyboardType="decimal-pad"
          placeholder="0,00"
          suffix="€"
        />
      )}
      {marginMode === MarginMode.FIX_TARGET_MARGIN && (
        <Input
          label="Marge cible"
          value={targetMargin}
          onChangeText={setTargetMargin}
          keyboardType="decimal-pad"
          placeholder="70"
          suffix="%"
        />
      )}
      {marginMode === MarginMode.FIX_COEFFICIENT && (
        <Input
          label="Coefficient multiplicateur"
          value={coefficient}
          onChangeText={setCoefficient}
          keyboardType="decimal-pad"
          placeholder="3,5"
          suffix="x"
        />
      )}

      <MarginResultCard result={marginResult} />

      <Input
        label="Fournisseur"
        value={supplier}
        onChangeText={setSupplier}
        placeholder="Nom du fournisseur (optionnel)"
      />

      <Button
        title={isEditing ? 'Enregistrer' : 'Ajouter le produit'}
        onPress={handleSave}
        loading={saveMutation.isPending}
      />

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
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfInput: {
    flex: 1,
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
  deleteBtn: {
    marginTop: spacing.sm,
    borderColor: colors.marginRed,
  },
  bottomSpacer: {
    height: spacing.xl,
  },
});
