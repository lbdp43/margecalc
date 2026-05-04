import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Image, ActivityIndicator, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { alert, confirm } from '../../utils/alert';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ServingTypeIcon } from '../../components/ui/ServingTypeIcon';
import {
  MarginMode, TVA_RATES, Category, CONTAINER_PRESETS,
  parseLocaleFloat, ServingType, calculateServingMargin,
  ServingMarginResult, MARGIN_COLOR_MAP, formatPrice, formatPercent,
  calculateDroits,
} from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PriceSlider } from '../../components/ui/PriceSlider';
import type { SaveProductData } from '../../components/ui/DroitsCalculator';
import { useAuthStore } from '../../store/auth.store';
import { useRatesStore } from '../../store/rates.store';
import * as productService from '../../services/product.service';
import * as categoryService from '../../services/category.service';
import * as servingService from '../../services/serving.service';
import * as scanService from '../../services/scan.service';
import { YinYangSpinner } from '../../components/ui/YinYangSpinner';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'ProductForm'>;
type ServingMode = 'price' | 'margin' | 'coefficient';
type FormStep = 'scan' | 'form';
type PriceInputMode = 'hors_droit' | 'ht_direct';
type SavedCalc = SaveProductData & { id: string };

// Map a fiscal category (rate slug) to a product category (Category slug)
const FISCAL_TO_PRODUCT_CATEGORY: Record<string, string> = {
  vin_tranquille: 'vins',
  vin_mousseux: 'vins',
  cidre_poire: 'vins',
  boisson_fermentee: 'vins',
  prod_interm_vdl_vdn: 'vins',
  prod_interm_autre: 'spiritueux',
  biere_legere: 'bieres',
  biere: 'bieres',
  petite_brasserie: 'bieres',
  rhum_dom: 'spiritueux',
  liqueur: 'spiritueux',
  spiritueux: 'spiritueux',
  rhum_hors_dom: 'spiritueux',
};

export function ProductFormScreen({ route, navigation }: Props) {
  const productId = route.params?.productId;
  const incomingScanData = route.params?.scanData as {
    name?: string; categoryId?: string;
    containerVolumeCl?: number; estimatedPriceHT?: number;
  } | undefined;
  const isEditing = !!productId;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const defaultContainer = user?.defaultContainerVolumeCl || 70;

  // Skip scan step if we already have scan data from ScanScreen or editing
  const [step, setStep] = useState<FormStep>(isEditing || incomingScanData ? 'form' : 'scan');

  // Scan state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // Product fields
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [containerVolume, setContainerVolume] = useState(String(defaultContainer));
  const [tvaRate, setTvaRate] = useState(user?.isAutoEntrepreneur ? 0 : TVA_RATES.RATE_20);
  const [supplier, setSupplier] = useState('');
  const [alcoholDegree, setAlcoholDegree] = useState('');
  const [priceInputMode, setPriceInputMode] = useState<PriceInputMode>('ht_direct');
  const [fiscalCategory, setFiscalCategory] = useState('spiritueux');

  // Alcohol tax rates from rates store
  const rates = useRatesStore((s) => s.rates);
  const selectedRate = rates.find((r) => r.slug === fiscalCategory);

  // Saved calcs from dashboard droits calculator
  const [savedCalcs, setSavedCalcs] = useState<SavedCalc[]>([]);
  const [calcPickerVisible, setCalcPickerVisible] = useState(false);

  // Serving state
  const [enabledServings, setEnabledServings] = useState<Set<string>>(new Set());
  const [servingPrices, setServingPrices] = useState<Record<string, number>>({});
  const [servingModes, setServingModes] = useState<Record<string, ServingMode>>({});
  const [editingText, setEditingText] = useState<Record<string, string>>({});

  const { data: categories = [] } = useOfflineQuery<Category[]>(
    ['categories'],
    categoryService.getCategories,
  );

  const { data: servingTypes = [] } = useOfflineQuery<ServingType[]>(
    ['servingTypes'],
    servingService.getServingTypes,
  );

  const { data: existingProduct } = useOfflineQuery(
    ['product', productId],
    () => productService.getProduct(productId!),
    { enabled: isEditing },
  );

  const { data: existingServings } = useOfflineQuery(
    ['productServings', productId],
    () => servingService.getProductServings(productId!),
    { enabled: isEditing },
  );

  useEffect(() => {
    if (existingProduct) {
      setName(existingProduct.name);
      setCategoryId(existingProduct.categoryId);
      setPurchasePrice(String(existingProduct.purchasePriceHT));
      setContainerVolume(String(existingProduct.containerVolumeCl));
      setTvaRate(existingProduct.tvaRate);
      setAlcoholDegree(existingProduct.alcoholDegree ? String(existingProduct.alcoholDegree) : '');
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

  // Pre-fill from incoming scan data (from ScanScreen or draft)
  useEffect(() => {
    if (incomingScanData) {
      if (incomingScanData.name) setName(incomingScanData.name);
      if (incomingScanData.categoryId) setCategoryId(incomingScanData.categoryId);
      if (incomingScanData.containerVolumeCl) setContainerVolume(String(incomingScanData.containerVolumeCl));
      if (incomingScanData.estimatedPriceHT) setPurchasePrice(String(incomingScanData.estimatedPriceHT));
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  // Load saved calcs from the dashboard droits calculator
  useEffect(() => {
    if (isEditing) return;
    AsyncStorage.getItem('margebar_saved_calcs').then((val) => {
      if (!val) return;
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) setSavedCalcs(parsed);
      } catch { /* ignore corrupted data */ }
    }).catch(() => {});
  }, [isEditing]);

  const handleImportCalc = (calc: SavedCalc) => {
    setName(calc.name);
    setPriceInputMode('ht_direct');
    setPurchasePrice(calc.prixHTAvecDroits.toFixed(2));
    setContainerVolume(String(calc.volumeCl));
    if (calc.degree) setAlcoholDegree(String(calc.degree));
    setFiscalCategory(calc.fiscalCategory);
    const productSlug = FISCAL_TO_PRODUCT_CATEGORY[calc.fiscalCategory];
    if (productSlug) {
      const matched = categories.find((c) => c.slug === productSlug);
      if (matched) setCategoryId(matched.id);
    }
    setCalcPickerVisible(false);
  };

  // === SCAN ===
  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      alert('Permission requise', 'Autorisez l\'accès à la caméra/galerie');
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

    try {
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!compressed.base64) {
        alert('Erreur', 'Impossible de lire l\'image');
        setScanning(false);
        return;
      }

      const result = await scanService.scanBottle(compressed.base64);

      // Auto-fill form from scan
      if (result.name) setName(result.name);
      if (result.category) {
        const matched = categories.find((c) => c.slug === result.category);
        if (matched) setCategoryId(matched.id);
      }
      if (result.containerVolumeCl) setContainerVolume(String(result.containerVolumeCl));
      if (result.estimatedPriceHT) setPurchasePrice(String(result.estimatedPriceHT));

      // Go to form
      setStep('form');
    } catch (err: any) {
      alert('Erreur de scan', err.response?.data?.error || err.message || 'Impossible d\'analyser');
    } finally {
      setScanning(false);
    }
  };

  // === FORM LOGIC ===
  const currentContainerVol = parseLocaleFloat(containerVolume) || 0;
  const currentPurchasePriceRaw = parseLocaleFloat(purchasePrice) || 0;
  const currentAlcoholDegree = parseLocaleFloat(alcoholDegree) || 0;
  const alcoholTax = priceInputMode === 'hors_droit' && selectedRate
    ? calculateDroits(selectedRate, currentContainerVol, currentAlcoholDegree, 0).totalDroits
    : 0;
  const currentPurchasePrice = currentPurchasePriceRaw + alcoholTax;

  const toggleServing = (id: string) => {
    setEnabledServings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getCostPerServing = (st: ServingType): number => {
    if (currentContainerVol <= 0 || st.volumeCl <= 0) return 0;
    return currentPurchasePrice / (currentContainerVol / st.volumeCl);
  };

  const getServingMargin = (st: ServingType): ServingMarginResult | null => {
    const price = servingPrices[st.id];
    if (!price || price <= 0 || currentContainerVol <= 0 || currentPurchasePrice < 0) return null;
    try {
      return calculateServingMargin(currentPurchasePrice, currentContainerVol, tvaRate, st, price);
    } catch { return null; }
  };

  const handleSliderChange = (st: ServingType, val: number, mode: ServingMode) => {
    const costHT = getCostPerServing(st);
    let priceTTC: number;
    switch (mode) {
      case 'price': priceTTC = val; break;
      case 'margin': {
        if (val >= 100) return;
        priceTTC = (costHT / (1 - val / 100)) * (1 + tvaRate);
        break;
      }
      case 'coefficient': {
        priceTTC = costHT * val * (1 + tvaRate);
        break;
      }
    }
    setServingPrices((prev) => ({ ...prev, [st.id]: Math.round(priceTTC * 100) / 100 }));
  };

  const getSliderValue = (st: ServingType, mode: ServingMode): number => {
    const price = servingPrices[st.id] || 0;
    const costHT = getCostPerServing(st);
    switch (mode) {
      case 'price': return price;
      case 'margin': {
        if (price <= 0) return 0;
        const ht = price / (1 + tvaRate);
        return ht > 0 ? ((ht - costHT) / ht) * 100 : 0;
      }
      case 'coefficient': {
        if (costHT <= 0) return 1;
        return (price / (1 + tvaRate)) / costHT;
      }
    }
  };

  const getSliderConfig = (st: ServingType, mode: ServingMode) => {
    const costHT = getCostPerServing(st);
    const costTTC = costHT * (1 + tvaRate);
    switch (mode) {
      case 'price': return {
        min: Math.max(0.1, Math.floor(costTTC * 10) / 10),
        max: Math.max(costTTC * 8, 20),
        step: 0.1,
        formatLabel: (v: number) => `${v.toFixed(1)} €`,
      };
      case 'margin': return {
        min: 0, max: 95, step: 1,
        formatLabel: (v: number) => `${v.toFixed(0)} %`,
      };
      case 'coefficient': return {
        min: 1, max: 10, step: 0.1,
        formatLabel: (v: number) => `x${v.toFixed(1)}`,
      };
    }
  };

  // === SAVE ===
  const saveMutation = useMutation({
    mutationFn: async () => {
      const servings = Array.from(enabledServings)
        .map((id) => ({ servingTypeId: id, sellingPriceTTC: servingPrices[id] || 0 }))
        .filter((s) => s.sellingPriceTTC > 0);

      if (servings.length === 0) throw new Error('Sélectionnez au moins un type de service');

      const firstST = servingTypes.find((st) => st.id === servings[0].servingTypeId);
      const parsedContainerVol = parseLocaleFloat(containerVolume);
      if (isNaN(parsedContainerVol) || parsedContainerVol <= 0) {
        throw new Error('Volume du contenant invalide');
      }

      const productData = {
        name,
        categoryId,
        purchasePriceHT: currentPurchasePrice,
        containerVolumeCl: parsedContainerVol,
        doseVolumeCl: firstST?.volumeCl ?? 5,
        marginMode: MarginMode.FIX_SELLING_PRICE,
        sellingPriceTTC: servings[0].sellingPriceTTC,
        tvaRate,
        alcoholDegree: parseLocaleFloat(alcoholDegree) || 0,
        supplier: supplier || undefined,
        imageUrl: imageUri || undefined,
      };

      let id: string;
      if (isEditing) {
        id = (await productService.updateProduct(productId!, productData)).id;
      } else {
        id = (await productService.createProduct(productData)).id;
      }
      await servingService.upsertProductServings(id, servings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigation.goBack();
    },
    onError: (err: any) => {
      alert('Erreur', err.response?.data?.error || err.message || 'Impossible de sauvegarder');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => productService.deleteProduct(productId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigation.goBack();
    },
  });

  const handleSave = () => {
    if (!name || !purchasePrice || !containerVolume) {
      alert('Erreur', 'Remplissez le nom, le prix et le volume');
      return;
    }
    saveMutation.mutate();
  };

  const hasValidProduct = name && currentPurchasePriceRaw > 0 && currentContainerVol > 0;
  const tvaOptions = [
    { label: '20%', value: TVA_RATES.RATE_20 },
    { label: '10%', value: TVA_RATES.RATE_10 },
    { label: '5,5%', value: TVA_RATES.RATE_5_5 },
  ];
  const modeLabels: { mode: ServingMode; label: string }[] = [
    { mode: 'price', label: 'Prix' },
    { mode: 'margin', label: 'Marge' },
    { mode: 'coefficient', label: 'Coeff' },
  ];

  // =====================
  // RENDER: SCAN STEP
  // =====================
  if (step === 'scan') {
    return (
      <ScreenWrapper>
        <Text style={styles.title}>Nouveau produit</Text>

        {/* Photo preview */}
        {imageUri && (
          <Card style={styles.previewCard}>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          </Card>
        )}

        {scanning ? (
          <View style={styles.loadingContainer}>
            <YinYangSpinner
              size={100}
              message="Analyse en cours..."
              submessage="Reconnaissance du produit..."
            />
          </View>
        ) : (
          <>
            <Text style={styles.scanSubtitle}>
              Prenez en photo la bouteille ou la facture
            </Text>

            <View style={styles.scanButtons}>
              <TouchableOpacity style={styles.scanBtn} onPress={() => pickImage(true)}>
                <Ionicons name="camera-outline" size={36} color={colors.white} />
                <Text style={styles.scanBtnText}>Prendre une photo</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.scanBtn} onPress={() => pickImage(false)}>
                <Ionicons name="images-outline" size={36} color={colors.white} />
                <Text style={styles.scanBtnText}>Galerie</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.manualBtn} onPress={() => setStep('form')}>
              <Text style={styles.manualBtnText}>Remplir manuellement</Text>
            </TouchableOpacity>
          </>
        )}
      </ScreenWrapper>
    );
  }

  // =====================
  // RENDER: FORM STEP
  // =====================
  return (
    <ScreenWrapper>
      <Text style={styles.title}>{isEditing ? 'Modifier le produit' : 'Nouveau produit'}</Text>

      {/* Scanned image thumbnail */}
      {imageUri && (
        <View style={styles.thumbnailRow}>
          <Image source={{ uri: imageUri }} style={styles.thumbnail} resizeMode="cover" />
          <TouchableOpacity onPress={() => { setStep('scan'); setImageUri(null); }}>
            <Text style={styles.rescanText}>Rescanner</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Import from saved dashboard calculations */}
      {!isEditing && savedCalcs.length > 0 && (
        <TouchableOpacity
          style={styles.importCalcBtn}
          onPress={() => setCalcPickerVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="download-outline" size={18} color={colors.primary} />
          <View style={styles.importCalcTextWrap}>
            <Text style={styles.importCalcTitle}>Importer un produit hors-taxe hors droit</Text>
            <Text style={styles.importCalcSub}>
              {savedCalcs.length} calcul{savedCalcs.length > 1 ? 's' : ''} sauvegarde{savedCalcs.length > 1 ? 's' : ''} depuis le tableau de bord
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      )}

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

      {/* Price input mode toggle */}
      <View style={styles.priceModeTabs}>
        <TouchableOpacity
          style={[styles.priceModeTab, priceInputMode === 'ht_direct' && styles.priceModeTabActive]}
          onPress={() => setPriceInputMode('ht_direct')}
        >
          <Text style={[styles.priceModeTabText, priceInputMode === 'ht_direct' && styles.priceModeTabTextActive]}>
            Prix HT direct
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.priceModeTab, priceInputMode === 'hors_droit' && styles.priceModeTabActive]}
          onPress={() => setPriceInputMode('hors_droit')}
        >
          <Text style={[styles.priceModeTabText, priceInputMode === 'hors_droit' && styles.priceModeTabTextActive]}>
            HT hors droit + degré
          </Text>
        </TouchableOpacity>
      </View>

      {priceInputMode === 'hors_droit' ? (
        <>
          <Input
            label="Prix d'achat HT hors droit *"
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            keyboardType="decimal-pad"
            placeholder="0,00"
            suffix="€"
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 8 }}>Categorie fiscale</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {rates.map((r) => (
              <TouchableOpacity
                key={r.slug}
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: fiscalCategory === r.slug ? colors.primary : colors.surface, borderWidth: 1, borderColor: fiscalCategory === r.slug ? colors.primary : colors.border }}
                onPress={() => setFiscalCategory(r.slug)}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: fiscalCategory === r.slug ? colors.textLight : colors.textSecondary }}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Degré d'alcool"
            value={alcoholDegree}
            onChangeText={setAlcoholDegree}
            keyboardType="decimal-pad"
            placeholder="0"
            suffix="%"
          />

          {alcoholTax > 0 && (
            <View style={styles.taxInfoCard}>
              <View style={styles.taxInfoRow}>
                <Text style={styles.taxInfoLabel}>Droit d'accise + Sécu. sociale</Text>
                <Text style={styles.taxInfoValue}>{formatPrice(alcoholTax)}</Text>
              </View>
              <View style={[styles.taxInfoRow, styles.taxInfoTotal]}>
                <Text style={styles.taxInfoTotalLabel}>Prix d'achat HT (avec droits)</Text>
                <Text style={styles.taxInfoTotalValue}>{formatPrice(currentPurchasePrice)}</Text>
              </View>
            </View>
          )}
        </>
      ) : (
        <Input
          label="Prix d'achat HT (droits inclus) *"
          value={purchasePrice}
          onChangeText={setPurchasePrice}
          keyboardType="decimal-pad"
          placeholder="0,00"
          suffix="€"
        />
      )}

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

      {/* === Services === */}
      {hasValidProduct && (
        <>
          <Text style={styles.sectionTitle}>Comment vendez-vous ce produit ?</Text>
          <Text style={styles.sectionDesc}>
            Sélectionnez les services puis ajustez le prix avec le curseur
          </Text>

          <View style={styles.servingToggles}>
            {servingTypes.map((st) => {
              const isOn = enabledServings.has(st.id);
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[styles.servingToggle, isOn && styles.servingToggleActive]}
                  onPress={() => toggleServing(st.id)}
                >
                  <View style={styles.servingToggleRow}>
                    <ServingTypeIcon name={st.name} icon={st.icon} size={28} />
                    <Text style={[styles.servingToggleText, isOn && styles.servingToggleTextActive]}>
                      {st.name}
                    </Text>
                  </View>
                  <Text style={[styles.servingToggleVol, isOn && styles.servingToggleTextActive]}>
                    {st.volumeCl} cl
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {servingTypes
            .filter((st) => enabledServings.has(st.id))
            .map((st) => {
              const mode = servingModes[st.id] || 'price';
              const margin = getServingMargin(st);
              const sliderVal = getSliderValue(st, mode);
              const config = getSliderConfig(st, mode);
              const nbServings = currentContainerVol / st.volumeCl;
              const accent = margin ? MARGIN_COLOR_MAP[margin.colorCode] : colors.primary;

              return (
                <Card key={st.id} style={styles.servingCard}>
                  <View style={styles.servingCardHeader}>
                    <View style={styles.servingCardNameRow}>
                      <ServingTypeIcon name={st.name} icon={st.icon} size={28} />
                      <Text style={styles.servingCardName}>
                        {st.name} ({st.volumeCl} cl)
                      </Text>
                    </View>
                    <Text style={styles.servingCardMeta}>
                      {nbServings.toFixed(1)} / contenant
                    </Text>
                  </View>

                  <View style={styles.modeTabs}>
                    {modeLabels.map((m) => (
                      <TouchableOpacity
                        key={m.mode}
                        style={[styles.modeTab, mode === m.mode && styles.modeTabActive]}
                        onPress={() => setServingModes((prev) => ({ ...prev, [st.id]: m.mode }))}
                      >
                        <Text style={[styles.modeTabText, mode === m.mode && styles.modeTabTextActive]}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <PriceSlider
                        min={config.min}
                        max={config.max}
                        step={config.step}
                        value={isNaN(sliderVal) ? config.min : Math.max(config.min, Math.min(config.max, sliderVal))}
                        onValueChange={(v) => handleSliderChange(st, v, mode)}
                        formatLabel={config.formatLabel}
                        accentColor={accent}
                      />
                    </View>
                    <TextInput
                      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs + 2, width: 75, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.primary, backgroundColor: colors.cardBackground }}
                      value={editingText[st.id] !== undefined
                        ? editingText[st.id]
                        : mode === 'price' ? String(Math.round(sliderVal * 100) / 100) : mode === 'margin' ? String(Math.round(sliderVal * 10) / 10) : String(Math.round(sliderVal * 100) / 100)}
                      onFocus={() => {
                        const display = mode === 'price' ? String(Math.round(sliderVal * 100) / 100) : mode === 'margin' ? String(Math.round(sliderVal * 10) / 10) : String(Math.round(sliderVal * 100) / 100);
                        setEditingText((prev) => ({ ...prev, [st.id]: display }));
                      }}
                      onChangeText={(text) => {
                        setEditingText((prev) => ({ ...prev, [st.id]: text }));
                        const parsed = parseFloat(text.replace(',', '.'));
                        if (!isNaN(parsed) && parsed > 0) handleSliderChange(st, parsed, mode);
                      }}
                      onEndEditing={() => {
                        setEditingText((prev) => {
                          const next = { ...prev };
                          delete next[st.id];
                          return next;
                        });
                      }}
                      keyboardType="decimal-pad"
                      placeholder={mode === 'price' ? '€' : mode === 'margin' ? '%' : 'x'}
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>

                  {margin && (
                    <View style={styles.resultRow}>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Prix TTC</Text>
                        <Text style={styles.resultValue}>{formatPrice(margin.sellingPriceTTC)}</Text>
                      </View>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Prix HT</Text>
                        <Text style={styles.resultValue}>{formatPrice(margin.sellingPriceHT)}</Text>
                      </View>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Marge</Text>
                        <Text style={[styles.resultValueBig, { color: accent }]}>
                          {formatPercent(margin.marginPercent)}
                        </Text>
                      </View>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Cout/dose</Text>
                        <Text style={styles.resultValue}>{formatPrice(margin.costPerServingHT)}</Text>
                      </View>
                      <View style={styles.resultItem}>
                        <Text style={[styles.resultLabel, { color: accent }]}>Gain/dose</Text>
                        <Text style={[styles.resultValue, { color: accent }]}>
                          {formatPrice(margin.marginPerServingHT)}
                        </Text>
                      </View>
                      <View style={styles.resultItem}>
                        <Text style={styles.resultLabel}>Gain total</Text>
                        <Text style={[styles.resultValue, { color: accent }]}>
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
          onPress={() => {
            confirm('Supprimer', `Supprimer "${name}" ?`, () => deleteMutation.mutate(), 'Supprimer', true);
          }}
          variant="danger"
          style={styles.deleteBtn}
        />
      )}

      <View style={styles.bottomSpacer} />

      {/* Saved calcs picker */}
      <Modal
        visible={calcPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCalcPickerVisible(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Choisir un produit calcule</Text>
              <TouchableOpacity
                onPress={() => setCalcPickerVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerScroll} contentContainerStyle={{ paddingBottom: spacing.lg }}>
              {savedCalcs.map((calc) => {
                const rate = rates.find((r) => r.slug === calc.fiscalCategory);
                return (
                  <TouchableOpacity
                    key={calc.id}
                    style={styles.pickerItem}
                    onPress={() => handleImportCalc(calc)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerItemName} numberOfLines={1}>{calc.name}</Text>
                      <Text style={styles.pickerItemMeta}>
                        {(rate?.label || calc.fiscalCategory)} · {calc.volumeCl} cl
                        {calc.degree ? ` · ${calc.degree}°` : ''}
                      </Text>
                    </View>
                    <View style={styles.pickerItemPriceWrap}>
                      <Text style={styles.pickerItemPrice}>{formatPrice(calc.prixHTAvecDroits)}</Text>
                      <Text style={styles.pickerItemPriceMeta}>HT avec droits</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} style={{ marginLeft: spacing.sm }} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  // Scan step
  scanSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  scanButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  scanBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  scanBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.white,
  },
  manualBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
  },
  manualBtnText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  previewCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: borderRadius.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  // Form step - thumbnail
  thumbnailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
  },
  rescanText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  // Form
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
  categoryRow: { marginBottom: spacing.md },
  categoryBtn: {
    marginRight: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 36,
  },
  section: { marginBottom: spacing.sm },
  presetScroll: { flexDirection: 'row', marginBottom: spacing.sm },
  presetBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    backgroundColor: colors.inputBackground,
  },
  presetBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  presetBtnTextActive: { color: colors.white },
  tvaRow: { marginBottom: spacing.md },
  tvaOptions: { flexDirection: 'row', gap: spacing.sm },
  tvaBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 36 },
  // Serving toggles
  servingToggles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
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
  servingToggleActive: { borderColor: colors.primary, backgroundColor: colors.light },
  servingToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  servingToggleText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  servingToggleTextActive: { color: colors.primary },
  servingToggleVol: { ...typography.caption, color: colors.grayMedium, marginTop: 2 },
  // Serving card
  servingCard: { marginBottom: spacing.md },
  servingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  servingCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  servingCardName: { ...typography.body, fontWeight: '700', color: colors.text },
  servingCardMeta: { ...typography.caption, color: colors.textSecondary },
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
  modeTabActive: { backgroundColor: colors.primary },
  modeTabText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  modeTabTextActive: { color: colors.textLight },
  // Results
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  resultItem: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    alignItems: 'center',
  },
  resultLabel: { ...typography.caption, color: colors.textSecondary, marginBottom: 2 },
  resultValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  resultValueBig: { ...typography.h3, fontWeight: '700' },
  saveBtn: { marginTop: spacing.md },
  deleteBtn: { marginTop: spacing.sm, borderColor: colors.marginRed },
  bottomSpacer: { height: spacing.xl },
  importCalcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  importCalcTextWrap: {
    flex: 1,
  },
  importCalcTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  },
  importCalcSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 38, 30, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
    paddingTop: spacing.md,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    ...typography.h3,
    color: colors.primary,
  },
  pickerScroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerItemName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  pickerItemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pickerItemPriceWrap: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
  },
  pickerItemPrice: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  },
  pickerItemPriceMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  priceModeTabs: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    padding: 3,
    marginBottom: spacing.md,
  },
  priceModeTab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderRadius: borderRadius.md - 3,
  },
  priceModeTabActive: {
    backgroundColor: colors.primary,
  },
  priceModeTabText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  priceModeTabTextActive: {
    color: colors.textLight,
  },
  taxInfoCard: {
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  taxInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  taxInfoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  taxInfoValue: {
    ...typography.bodySmall,
    color: colors.text,
  },
  taxInfoTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: 0,
  },
  taxInfoTotalLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  taxInfoTotalValue: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  },
});
