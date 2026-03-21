import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, Alert, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TVA_RATES, CONTAINER_PRESETS, ServingType, DEFAULT_MARGIN_THRESHOLDS, Category } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuthStore } from '../../store/auth.store';
import { api } from '../../services/api';
import * as servingService from '../../services/serving.service';
import * as categoryService from '../../services/category.service';
import { colors, spacing, borderRadius, typography } from '../../theme';

export function SettingsScreen() {
  const { user, setAuth, logout } = useAuthStore();
  const [businessName, setBusinessName] = useState(user?.businessName || '');
  const [isAutoEntrepreneur, setIsAutoEntrepreneur] = useState(user?.isAutoEntrepreneur || false);
  const [defaultContainerVolumeCl, setDefaultContainerVolumeCl] = useState(
    user?.defaultContainerVolumeCl || 70
  );
  const [saving, setSaving] = useState(false);

  // Serving types state
  const [servingTypes, setServingTypes] = useState<ServingType[]>([]);
  const [newName, setNewName] = useState('');
  const [newVolume, setNewVolume] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editVolume, setEditVolume] = useState('');

  // Margin thresholds
  const [greenThreshold, setGreenThreshold] = useState(String(DEFAULT_MARGIN_THRESHOLDS.good));
  const [orangeThreshold, setOrangeThreshold] = useState(String(DEFAULT_MARGIN_THRESHOLDS.medium));

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadServingTypes();
      loadCategories();
      AsyncStorage.getItem('margebar_margin_thresholds').then((val) => {
        if (val) {
          const parsed = JSON.parse(val);
          setGreenThreshold(String(parsed.good));
          setOrangeThreshold(String(parsed.medium));
        }
      });
    }, [])
  );

  const loadServingTypes = async () => {
    try {
      const types = await servingService.getServingTypes();
      setServingTypes(types);
    } catch {
      // silently fail on initial load
    }
  };

  const handleAddServing = async () => {
    const vol = parseFloat(newVolume.replace(',', '.'));
    if (!newName.trim() || isNaN(vol) || vol <= 0) {
      Alert.alert('Erreur', 'Entrez un nom et un volume valide');
      return;
    }
    try {
      await servingService.createServingType({
        name: newName.trim(),
        volumeCl: vol,
        sortOrder: servingTypes.length + 1,
      });
      setNewName('');
      setNewVolume('');
      loadServingTypes();
    } catch {
      Alert.alert('Erreur', 'Impossible de créer le type de service');
    }
  };

  const handleEditServing = async (id: string) => {
    const vol = parseFloat(editVolume.replace(',', '.'));
    if (!editName.trim() || isNaN(vol) || vol <= 0) {
      Alert.alert('Erreur', 'Entrez un nom et un volume valide');
      return;
    }
    try {
      await servingService.updateServingType(id, {
        name: editName.trim(),
        volumeCl: vol,
      });
      setEditingId(null);
      loadServingTypes();
    } catch {
      Alert.alert('Erreur', 'Impossible de modifier');
    }
  };

  const handleDeleteServing = (id: string, name: string) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await servingService.deleteServingType(id);
            loadServingTypes();
          } catch {
            Alert.alert('Erreur', 'Impossible de supprimer');
          }
        },
      },
    ]);
  };

  const startEdit = (st: ServingType) => {
    setEditingId(st.id);
    setEditName(st.name);
    setEditVolume(String(st.volumeCl));
  };

  const loadCategories = async () => {
    try {
      const cats = await categoryService.getCategories();
      setCategories(cats);
    } catch {}
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Erreur', 'Entrez un nom de catégorie');
      return;
    }
    try {
      await categoryService.createCategory(newCategoryName.trim());
      setNewCategoryName('');
      loadCategories();
    } catch {
      Alert.alert('Erreur', 'Impossible de créer la catégorie');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await AsyncStorage.setItem('margebar_margin_thresholds', JSON.stringify({
        good: parseFloat(greenThreshold.replace(',', '.')) || DEFAULT_MARGIN_THRESHOLDS.good,
        medium: parseFloat(orangeThreshold.replace(',', '.')) || DEFAULT_MARGIN_THRESHOLDS.medium,
      }));
      const res = await api.patch('/users/me', {
        businessName: businessName || null,
        isAutoEntrepreneur,
        defaultTvaRate: isAutoEntrepreneur ? 0 : TVA_RATES.RATE_20,
        defaultContainerVolumeCl,
      });
      const token = useAuthStore.getState().token!;
      setAuth(token, res.data);
      Alert.alert('Succès', 'Paramètres mis à jour');
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Paramètres</Text>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Mon établissement</Text>
        <Input
          label="Nom de l'établissement"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Ex: La Brasserie des Plantes"
        />
        <Text style={styles.email}>{user?.email}</Text>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>TVA</Text>
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchLabel}>Auto-entrepreneur</Text>
            <Text style={styles.switchDesc}>Désactive la TVA sur tous les calculs</Text>
          </View>
          <Switch
            value={isAutoEntrepreneur}
            onValueChange={setIsAutoEntrepreneur}
            trackColor={{ true: colors.accent }}
            thumbColor={colors.white}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Seuils de marge</Text>
        <Text style={styles.sectionDesc}>
          Définissez les seuils pour les indicateurs de couleur
        </Text>
        <View style={styles.thresholdRow}>
          <View style={[styles.thresholdDot, { backgroundColor: colors.marginGreen }]} />
          <Text style={styles.thresholdLabel}>Bonne marge (vert) ≥</Text>
          <TextInput
            style={styles.thresholdInput}
            value={greenThreshold}
            onChangeText={setGreenThreshold}
            keyboardType="numeric"
            placeholder="65"
            placeholderTextColor={colors.grayMedium}
          />
          <Text style={styles.thresholdUnit}>%</Text>
        </View>
        <View style={styles.thresholdRow}>
          <View style={[styles.thresholdDot, { backgroundColor: colors.marginOrange }]} />
          <Text style={styles.thresholdLabel}>Marge correcte (orange) ≥</Text>
          <TextInput
            style={styles.thresholdInput}
            value={orangeThreshold}
            onChangeText={setOrangeThreshold}
            keyboardType="numeric"
            placeholder="50"
            placeholderTextColor={colors.grayMedium}
          />
          <Text style={styles.thresholdUnit}>%</Text>
        </View>
        <View style={styles.thresholdRow}>
          <View style={[styles.thresholdDot, { backgroundColor: colors.marginRed }]} />
          <Text style={styles.thresholdLabel}>Marge faible (rouge)</Text>
          <Text style={styles.thresholdAuto}>{'< '}{orangeThreshold || '50'}%</Text>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Contenant par défaut</Text>
        <Text style={styles.sectionDesc}>
          Volume du contenant pré-sélectionné lors de l'ajout d'un produit
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
          {CONTAINER_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.volumeCl}
              style={[
                styles.presetBtn,
                defaultContainerVolumeCl === preset.volumeCl && styles.presetBtnActive,
              ]}
              onPress={() => setDefaultContainerVolumeCl(preset.volumeCl)}
            >
              <Text
                style={[
                  styles.presetBtnText,
                  defaultContainerVolumeCl === preset.volumeCl && styles.presetBtnTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Types de service</Text>
        <Text style={styles.sectionDesc}>
          Définissez les formats de service pour calculer vos marges (shot, demi, pinte...)
        </Text>

        {servingTypes.map((st) => (
          <View key={st.id} style={styles.servingRow}>
            {editingId === st.id ? (
              <View style={styles.servingEditRow}>
                <TextInput
                  style={[styles.servingInput, { flex: 2 }]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Nom"
                  placeholderTextColor={colors.grayMedium}
                />
                <TextInput
                  style={[styles.servingInput, { flex: 1 }]}
                  value={editVolume}
                  onChangeText={setEditVolume}
                  keyboardType="numeric"
                  placeholder="cl"
                  placeholderTextColor={colors.grayMedium}
                />
                <TouchableOpacity onPress={() => handleEditServing(st.id)} style={styles.iconBtn}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingId(null)} style={styles.iconBtn}>
                  <Ionicons name="close-circle" size={22} color={colors.marginRed} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.servingInfo}>
                  <View style={styles.servingNameRow}>
                    <View style={styles.servingIconBadge}>
                      <Ionicons name="wine-outline" size={16} color={colors.primary} />
                    </View>
                    <Text style={styles.servingName}>{st.name}</Text>
                  </View>
                  <Text style={styles.servingVolume}>{st.volumeCl} cl</Text>
                </View>
                <View style={styles.servingActions}>
                  <TouchableOpacity onPress={() => startEdit(st)} style={styles.iconBtn}>
                    <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteServing(st.id, st.name)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.marginRed} />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        ))}

        <View style={styles.addServingRow}>
          <TextInput
            style={[styles.servingInput, { flex: 2 }]}
            value={newName}
            onChangeText={setNewName}
            placeholder="Nom (ex: Coupe)"
            placeholderTextColor={colors.grayMedium}
          />
          <TextInput
            style={[styles.servingInput, { flex: 1 }]}
            value={newVolume}
            onChangeText={setNewVolume}
            keyboardType="numeric"
            placeholder="cl"
            placeholderTextColor={colors.grayMedium}
          />
          <TouchableOpacity onPress={handleAddServing} style={styles.addBtn}>
            <Ionicons name="add" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Catégories</Text>
        <Text style={styles.sectionDesc}>
          Vos catégories de produits
        </Text>
        {categories.map((cat) => (
          <View key={cat.id} style={styles.servingRow}>
            <View style={styles.servingInfo}>
              <Text style={styles.servingName}>{cat.name}</Text>
            </View>
          </View>
        ))}
        <View style={styles.addServingRow}>
          <TextInput
            style={[styles.servingInput, { flex: 1 }]}
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            placeholder="Nouvelle catégorie"
            placeholderTextColor={colors.grayMedium}
          />
          <TouchableOpacity onPress={handleAddCategory} style={styles.addBtn}>
            <Ionicons name="add" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </Card>

      <Button title="Enregistrer" onPress={handleSave} loading={saving} />

      <Button
        title="Se déconnecter"
        onPress={handleLogout}
        variant="outline"
        style={styles.logoutBtn}
      />

      <Text style={styles.version}>MargeBar v1.0.0</Text>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  email: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  switchLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  switchDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  presetScroll: {
    flexDirection: 'row',
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
  logoutBtn: {
    marginTop: spacing.md,
    borderColor: colors.marginRed,
  },
  version: {
    ...typography.caption,
    color: colors.grayMedium,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  // Serving types styles
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  servingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  servingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  servingIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  servingName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  servingVolume: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  servingActions: {
    flexDirection: 'row',
  },
  iconBtn: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
  },
  servingEditRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  servingInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...typography.bodySmall,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  addServingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  // Margin threshold styles
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thresholdDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  thresholdLabel: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.text,
  },
  thresholdInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    width: 50,
    textAlign: 'center',
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  thresholdUnit: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  thresholdAuto: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
