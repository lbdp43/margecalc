import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
  Alert, ScrollView, Switch,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Category, MarginMode, TVA_RATES, CONTAINER_PRESETS } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { DecorativeCurve } from '../../components/ui/DecorativeCurve';
import { YinYangSpinner } from '../../components/ui/YinYangSpinner';
import { useAuthStore } from '../../store/auth.store';
import * as scanService from '../../services/scan.service';
import * as productService from '../../services/product.service';
import * as categoryService from '../../services/category.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

type Props = NativeStackScreenProps<any, 'InvoiceScan'>;

interface InvoiceProductState extends scanService.InvoiceProduct {
  selected: boolean;
}

export function InvoiceScanScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<string | null>(null);
  const [products, setProducts] = useState<InvoiceProductState[]>([]);
  const [importing, setImporting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission requise', "Autorisez l'accès à la caméra/galerie");
      return;
    }

    const pickerFn = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const picked = await pickerFn({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setImageUri(asset.uri);
    setScanning(true);
    setProducts([]);

    try {
      // Load categories for matching
      const cats = await categoryService.getCategories();
      setCategories(cats);

      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!compressed.base64) {
        Alert.alert('Erreur', "Impossible de lire l'image");
        setScanning(false);
        return;
      }

      const result = await scanService.scanInvoice(compressed.base64);
      setSupplier(result.supplier || '');
      setInvoiceDate(result.invoiceDate);
      setProducts(
        result.products.map((p) => ({ ...p, selected: p.confidence >= 0.5 }))
      );
    } catch (err: any) {
      Alert.alert(
        'Erreur de scan',
        err.response?.data?.error || err.message || "Impossible d'analyser la facture"
      );
    } finally {
      setScanning(false);
    }
  };

  const toggleProduct = (index: number) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, selected: !p.selected } : p))
    );
  };

  const toggleAll = () => {
    const allSelected = products.every((p) => p.selected);
    setProducts((prev) => prev.map((p) => ({ ...p, selected: !allSelected })));
  };

  const handleImport = async () => {
    const selected = products.filter((p) => p.selected);
    if (selected.length === 0) {
      Alert.alert('Erreur', 'Sélectionnez au moins un produit');
      return;
    }

    setImporting(true);
    let importCount = 0;

    try {
      const defaultContainer = user?.defaultContainerVolumeCl || 70;
      const tvaRate = user?.isAutoEntrepreneur ? 0 : TVA_RATES.RATE_20;

      for (const p of selected) {
        const matchedCat = categories.find((c) => c.slug === p.category);

        await productService.createProduct({
          name: p.name,
          categoryId: matchedCat?.id || categories[0]?.id || '',
          purchasePriceHT: p.purchasePriceHT || 0,
          containerVolumeCl: p.containerVolumeCl || defaultContainer,
          doseVolumeCl: 5,
          marginMode: MarginMode.FIX_SELLING_PRICE,
          sellingPriceTTC: 0,
          tvaRate,
          supplier: supplier || undefined,
        });
        importCount++;
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
      Alert.alert(
        'Import terminé',
        `${importCount} produit${importCount > 1 ? 's' : ''} importé${importCount > 1 ? 's' : ''}. Configurez les prix de vente dans chaque fiche produit.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert(
        'Erreur',
        `${importCount} importé(s). Erreur : ${err.message || "Impossible d'importer"}`
      );
    } finally {
      setImporting(false);
    }
  };

  const selectedCount = products.filter((p) => p.selected).length;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return colors.marginGreen;
    if (confidence >= 0.4) return colors.marginOrange;
    return colors.marginRed;
  };

  const getContainerLabel = (volumeCl: number | null) => {
    if (!volumeCl) return '?';
    const preset = CONTAINER_PRESETS.find((p) => p.volumeCl === volumeCl);
    return preset ? preset.label : `${volumeCl} cl`;
  };

  // === SCAN STEP ===
  if (products.length === 0 && !scanning) {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Scanner une facture</Text>
        </View>

        <DecorativeCurve variant="middle" />

        {imageUri && (
          <View style={styles.previewCard}>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          </View>
        )}

        {scanning ? (
          <View style={styles.loadingContainer}>
            <YinYangSpinner
              size={120}
              message="Analyse de la facture en cours..."
              submessage="Cela peut prendre jusqu'à 2 minutes"
            />
          </View>
        ) : (
          <>
            <View style={styles.infoCard}>
              <Ionicons name="receipt-outline" size={48} color={colors.primary} />
              <Text style={styles.infoTitle}>Importez vos produits depuis une facture</Text>
              <Text style={styles.infoText}>
                Prenez en photo votre facture fournisseur. L'IA va extraire tous les
                produits avec leurs prix d'achat et contenants.
              </Text>
            </View>

            <View style={styles.scanButtons}>
              <TouchableOpacity style={styles.scanBtn} onPress={() => pickImage(true)}>
                <Ionicons name="camera-outline" size={32} color={colors.white} />
                <Text style={styles.scanBtnText}>Photographier</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.scanBtn} onPress={() => pickImage(false)}>
                <Ionicons name="images-outline" size={32} color={colors.white} />
                <Text style={styles.scanBtnText}>Galerie</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScreenWrapper>
    );
  }

  // === RESULTS STEP ===
  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Produits détectés</Text>
      </View>

      {/* Supplier info */}
      {supplier && (
        <View style={styles.supplierCard}>
          <Ionicons name="business-outline" size={18} color={colors.primary} />
          <View style={styles.supplierInfo}>
            <Text style={styles.supplierName}>{supplier}</Text>
            {invoiceDate && (
              <Text style={styles.supplierDate}>{invoiceDate}</Text>
            )}
          </View>
        </View>
      )}

      {/* Select all / count */}
      <View style={styles.selectBar}>
        <TouchableOpacity onPress={toggleAll} style={styles.selectAllBtn}>
          <Ionicons
            name={selectedCount === products.length ? 'checkbox' : 'square-outline'}
            size={22}
            color={colors.primary}
          />
          <Text style={styles.selectAllText}>Tout sélectionner</Text>
        </TouchableOpacity>
        <Text style={styles.countText}>
          {selectedCount}/{products.length} produit{products.length > 1 ? 's' : ''}
        </Text>
      </View>

      {/* Product list */}
      {products.map((p, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.productRow, p.selected && styles.productRowSelected]}
          onPress={() => toggleProduct(index)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={p.selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={p.selected ? colors.primary : colors.tabBarInactive}
            style={styles.checkbox}
          />
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
            <View style={styles.productMeta}>
              {p.purchasePriceHT != null && (
                <Text style={styles.metaTag}>
                  {p.purchasePriceHT.toFixed(2)} € HT
                </Text>
              )}
              {p.containerVolumeCl != null && (
                <Text style={styles.metaTag}>
                  {getContainerLabel(p.containerVolumeCl)}
                </Text>
              )}
              {p.quantity > 1 && (
                <Text style={styles.metaTag}>x{p.quantity}</Text>
              )}
            </View>
          </View>
          <View
            style={[
              styles.confidenceDot,
              { backgroundColor: getConfidenceColor(p.confidence) },
            ]}
          />
        </TouchableOpacity>
      ))}

      {/* Rescan button */}
      <TouchableOpacity
        style={styles.rescanBtn}
        onPress={() => {
          setProducts([]);
          setImageUri(null);
        }}
      >
        <Ionicons name="refresh-outline" size={18} color={colors.primary} />
        <Text style={styles.rescanText}>Scanner une autre facture</Text>
      </TouchableOpacity>

      {/* Import button */}
      {selectedCount > 0 && (
        <TouchableOpacity
          style={[styles.importBtn, importing && styles.importBtnDisabled]}
          onPress={handleImport}
          disabled={importing}
          activeOpacity={0.8}
        >
          {importing ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons name="download-outline" size={22} color={colors.white} />
              <Text style={styles.importBtnText}>
                Importer {selectedCount} produit{selectedCount > 1 ? 's' : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <View style={{ height: spacing.xl }} />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  backBtn: {
    marginRight: spacing.md,
    padding: spacing.xs,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },

  // Info card
  infoCard: {
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  infoTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  infoText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Scan buttons
  scanButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  scanBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.md,
  },
  scanBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.white,
  },

  // Preview
  previewCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.md,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    padding: spacing.xxl,
  },
  loadingText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
  },
  loadingSubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // Supplier card
  supplierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  supplierDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Select bar
  selectBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  selectAllText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },
  countText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  // Product rows
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.sm,
  },
  productRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.light,
  },
  checkbox: {
    marginRight: spacing.sm + 2,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  productMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaTag: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  confidenceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: spacing.sm,
  },

  // Rescan
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  rescanText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.primary,
  },

  // Import button
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
    ...shadows.md,
  },
  importBtnDisabled: {
    opacity: 0.7,
  },
  importBtnText: {
    ...typography.button,
    color: colors.white,
  },
});
