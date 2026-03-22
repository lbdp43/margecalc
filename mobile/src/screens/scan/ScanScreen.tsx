import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Image, FlatList, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Category, CONTAINER_PRESETS } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as scanService from '../../services/scan.service';
import * as categoryService from '../../services/category.service';
import * as draftService from '../../services/draft.service';
import { ScanDraft } from '../../services/draft.service';
import { YinYangSpinner } from '../../components/ui/YinYangSpinner';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'Scan'>;

export function ScanScreen({ navigation }: Props) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<scanService.ScanResult | null>(null);
  const [drafts, setDrafts] = useState<ScanDraft[]>([]);

  const { data: categories = [] } = useOfflineQuery<Category[]>(
    ['categories'],
    categoryService.getCategories,
  );

  const loadDrafts = useCallback(async () => {
    setDrafts(await draftService.getDrafts());
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const pickImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission requise', 'Autorisez l\'accès à la caméra/galerie');
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
    setResult(null);
    setScanning(true);

    try {
      // Compress and resize image before sending to API
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!compressed.base64) {
        Alert.alert('Erreur', 'Impossible de lire l\'image');
        setScanning(false);
        return;
      }

      const scanResult = await scanService.scanBottle(compressed.base64);
      setResult(scanResult);
    } catch (err: any) {
      const message = err.response?.data?.error
        || err.message
        || 'Impossible d\'analyser l\'image';
      Alert.alert('Erreur de scan', message);
    } finally {
      setScanning(false);
    }
  };

  const handleUseResult = () => {
    if (!result) return;
    const matchedCategory = categories.find((c) => c.slug === result.category);
    navigation.navigate('Produits', {
      screen: 'ProductForm',
      params: {
        scanData: {
          name: result.name,
          categoryId: matchedCategory?.id || categories[0]?.id,
          containerVolumeCl: result.containerVolumeCl,
          estimatedPriceHT: result.estimatedPriceHT,
        },
      },
    });
  };

  const handleSaveDraft = async () => {
    if (!result) return;
    const matchedCategory = categories.find((c) => c.slug === result.category);
    await draftService.saveDraft({
      name: result.name,
      categoryId: matchedCategory?.id || categories[0]?.id,
      containerVolumeCl: result.containerVolumeCl,
      estimatedPriceHT: result.estimatedPriceHT,
    });
    Alert.alert('Brouillon sauvegardé', `"${result.name}" a été sauvegardé. Vous pourrez le reprendre plus tard.`);
    setResult(null);
    setImageUri(null);
    await loadDrafts();
  };

  const handleUseDraft = (draft: ScanDraft) => {
    navigation.navigate('Produits', {
      screen: 'ProductForm',
      params: {
        scanData: {
          name: draft.name,
          categoryId: draft.categoryId,
          containerVolumeCl: draft.containerVolumeCl,
          estimatedPriceHT: draft.estimatedPriceHT,
        },
      },
    });
    // Remove draft after use
    draftService.deleteDraft(draft.id).then(loadDrafts).catch(() => {});
  };

  const handleDeleteDraft = (draft: ScanDraft) => {
    Alert.alert('Supprimer', `Supprimer le brouillon "${draft.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await draftService.deleteDraft(draft.id);
          await loadDrafts();
        },
      },
    ]);
  };

  const getContainerLabel = (cl: number | null) => {
    if (!cl) return 'Non détecté';
    const preset = CONTAINER_PRESETS.find((p) => p.volumeCl === cl);
    return preset ? preset.label : `${cl} cl`;
  };

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Scanner un produit</Text>
      <Text style={styles.subtitle}>
        Prenez en photo une bouteille ou une facture pour remplir automatiquement les informations
      </Text>

      <View style={styles.buttonRow}>
        <Button
          title="Prendre une photo"
          icon={<Ionicons name="camera-outline" size={18} color={colors.white} />}
          onPress={() => pickImage(true)}
          style={styles.actionBtn}
        />
        <Button
          title="Galerie"
          icon={<Ionicons name="images-outline" size={18} color={colors.primary} />}
          onPress={() => pickImage(false)}
          variant="outline"
          style={styles.actionBtn}
        />
      </View>

      {imageUri && (
        <Card style={styles.previewCard}>
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
        </Card>
      )}

      {scanning && (
        <View style={styles.loadingContainer}>
          <YinYangSpinner
            size={100}
            message="Analyse en cours..."
            submessage="Reconnaissance du produit..."
          />
        </View>
      )}

      {result && !scanning && (
        <Card style={styles.resultCard}>
          <Text style={styles.resultTitle}>Produit reconnu</Text>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Nom</Text>
            <Text style={styles.resultValue}>{result.name}</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Catégorie</Text>
            <Text style={styles.resultValue}>{result.category}</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Volume</Text>
            <Text style={styles.resultValue}>{getContainerLabel(result.containerVolumeCl)}</Text>
          </View>

          {result.estimatedPriceHT && (
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Prix HT estimé</Text>
              <Text style={styles.resultValue}>{result.estimatedPriceHT.toFixed(2)} €</Text>
            </View>
          )}

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Confiance</Text>
            <Text style={[
              styles.resultValue,
              { color: result.confidence >= 0.7 ? colors.marginGreen : result.confidence >= 0.4 ? colors.marginOrange : colors.marginRed },
            ]}>
              {Math.round(result.confidence * 100)}%
            </Text>
          </View>

          <Button
            title="Utiliser ces informations"
            onPress={handleUseResult}
            style={styles.useBtn}
          />
          <Button
            title="Sauvegarder en brouillon"
            onPress={handleSaveDraft}
            variant="outline"
            icon={<Ionicons name="bookmark-outline" size={16} color={colors.primary} />}
            style={styles.draftBtn}
          />
        </Card>
      )}

      {/* Drafts list */}
      {drafts.length > 0 && !scanning && !result && (
        <View style={styles.draftsSection}>
          <Text style={styles.draftsTitle}>Brouillons ({drafts.length})</Text>
          {drafts.map((draft) => (
            <Card key={draft.id} style={styles.draftCard}>
              <TouchableOpacity style={styles.draftContent} onPress={() => handleUseDraft(draft)}>
                <View style={styles.draftInfo}>
                  <Text style={styles.draftName} numberOfLines={1}>{draft.name}</Text>
                  <Text style={styles.draftMeta}>
                    {draft.containerVolumeCl ? `${draft.containerVolumeCl} cl` : ''}
                    {draft.estimatedPriceHT ? ` · ${draft.estimatedPriceHT.toFixed(2)} €` : ''}
                    {' · '}{new Date(draft.savedAt).toLocaleDateString('fr-FR')}
                  </Text>
                </View>
                <View style={styles.draftActions}>
                  <Ionicons name="arrow-forward" size={18} color={colors.primary} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.draftDeleteBtn}
                onPress={() => handleDeleteDraft(draft)}
              >
                <Ionicons name="trash-outline" size={16} color={colors.marginRed} />
              </TouchableOpacity>
            </Card>
          ))}
        </View>
      )}
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
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    flex: 1,
  },
  previewCard: {
    marginBottom: spacing.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  preview: {
    width: '100%',
    height: 250,
    borderRadius: borderRadius.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  resultCard: {
    marginBottom: spacing.md,
  },
  resultTitle: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  resultValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  useBtn: {
    marginTop: spacing.md,
  },
  draftBtn: {
    marginTop: spacing.sm,
  },
  draftsSection: {
    marginTop: spacing.lg,
  },
  draftsTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  draftCard: {
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  draftContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  draftInfo: {
    flex: 1,
  },
  draftName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  draftMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  draftActions: {
    marginLeft: spacing.sm,
  },
  draftDeleteBtn: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
  },
});
