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
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

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

      {/* Mon établissement */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Mon établissement</Text>
        </View>
        <View style={styles.sectionBody}>
          <Input
            label="Nom de l'établissement"
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="Ex: La Brasserie des Plantes"
          />
          <View style={styles.emailRow}>
            <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>
      </View>

      {/* TVA */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>TVA</Text>
        </View>
        <View style={styles.sectionBody}>
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Auto-entrepreneur</Text>
              <Text style={styles.switchDesc}>Désactive la TVA sur tous les calculs</Text>
            </View>
            <Switch
              value={isAutoEntrepreneur}
              onValueChange={setIsAutoEntrepreneur}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.cardBackground}
            />
          </View>
        </View>
      </View>

      {/* Seuils de marge */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Seuils de marge</Text>
        </View>
        <View style={styles.sectionBody}>
          <Text style={styles.sectionDesc}>
            Définissez les seuils pour les indicateurs de couleur
          </Text>
          <View style={styles.thresholdCard}>
            <View style={[styles.thresholdDot, { backgroundColor: colors.marginGreen }]} />
            <Text style={styles.thresholdLabel}>Bonne marge (vert) ≥</Text>
            <View style={styles.thresholdInputWrap}>
              <TextInput
                style={styles.thresholdInput}
                value={greenThreshold}
                onChangeText={setGreenThreshold}
                keyboardType="numeric"
                placeholder="65"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.thresholdUnit}>%</Text>
            </View>
          </View>
          <View style={styles.thresholdCard}>
            <View style={[styles.thresholdDot, { backgroundColor: colors.marginOrange }]} />
            <Text style={styles.thresholdLabel}>Marge correcte (orange) ≥</Text>
            <View style={styles.thresholdInputWrap}>
              <TextInput
                style={styles.thresholdInput}
                value={orangeThreshold}
                onChangeText={setOrangeThreshold}
                keyboardType="numeric"
                placeholder="50"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.thresholdUnit}>%</Text>
            </View>
          </View>
          <View style={styles.thresholdCard}>
            <View style={[styles.thresholdDot, { backgroundColor: colors.marginRed }]} />
            <Text style={styles.thresholdLabel}>Marge faible (rouge)</Text>
            <Text style={styles.thresholdAuto}>{'< '}{orangeThreshold || '50'}%</Text>
          </View>
        </View>
      </View>

      {/* Contenant par défaut */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Contenant par défaut</Text>
        </View>
        <View style={styles.sectionBody}>
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
          <View style={styles.customContainerRow}>
            <View style={styles.customContainerInputWrap}>
              <Ionicons name="resize-outline" size={16} color={colors.textSecondary} style={{ marginRight: spacing.sm }} />
              <TextInput
                style={styles.customContainerInput}
                value={String(defaultContainerVolumeCl)}
                onChangeText={(v) => {
                  const vol = parseFloat(v.replace(',', '.'));
                  if (!isNaN(vol) && vol > 0) setDefaultContainerVolumeCl(vol);
                }}
                keyboardType="numeric"
                placeholder="Volume personnalisé"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.customContainerUnit}>cl</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Types de service */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Types de service</Text>
        </View>
        <View style={styles.sectionBody}>
          <Text style={styles.sectionDesc}>
            Définissez les formats de service pour calculer vos marges (shot, demi, pinte...)
          </Text>

          {servingTypes.map((st) => (
            <View key={st.id} style={styles.servingMiniCard}>
              {editingId === st.id ? (
                <View style={styles.servingEditRow}>
                  <TextInput
                    style={[styles.servingInput, { flex: 2 }]}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Nom"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TextInput
                    style={[styles.servingInput, { flex: 1 }]}
                    value={editVolume}
                    onChangeText={setEditVolume}
                    keyboardType="numeric"
                    placeholder="cl"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TouchableOpacity onPress={() => handleEditServing(st.id)} style={styles.iconBtn}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingId(null)} style={styles.iconBtn}>
                    <Ionicons name="close-circle" size={24} color={colors.marginRed} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.servingInfo}>
                    <View style={styles.servingIconBadge}>
                      <Text style={styles.servingIconEmoji}>{st.icon || '🍷'}</Text>
                    </View>
                    <View style={styles.servingTextBlock}>
                      <Text style={styles.servingName}>{st.name}</Text>
                      <Text style={styles.servingVolume}>{st.volumeCl} cl</Text>
                    </View>
                  </View>
                  <View style={styles.servingActions}>
                    <TouchableOpacity onPress={() => startEdit(st)} style={styles.iconBtnSmall}>
                      <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteServing(st.id, st.name)} style={styles.iconBtnSmall}>
                      <Ionicons name="trash-outline" size={18} color={colors.marginRed} />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ))}

          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, { flex: 2 }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Nom (ex: Coupe)"
              placeholderTextColor={colors.textSecondary}
            />
            <TextInput
              style={[styles.addInput, { flex: 1 }]}
              value={newVolume}
              onChangeText={setNewVolume}
              keyboardType="numeric"
              placeholder="cl"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity onPress={handleAddServing} style={styles.addBtn}>
              <Ionicons name="add" size={22} color={colors.textLight} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Catégories */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Catégories</Text>
        </View>
        <View style={styles.sectionBody}>
          <Text style={styles.sectionDesc}>
            Vos catégories de produits
          </Text>
          {categories.map((cat) => (
            <View key={cat.id} style={styles.categoryRow}>
              <View style={styles.categoryBadge}>
                <Ionicons name="pricetag-outline" size={14} color={colors.accent} />
              </View>
              <Text style={styles.categoryName}>{cat.name}</Text>
            </View>
          ))}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, { flex: 1 }]}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="Nouvelle catégorie"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity onPress={handleAddCategory} style={styles.addBtn}>
              <Ionicons name="add" size={22} color={colors.textLight} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Save button */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
      >
        <Ionicons name="checkmark-circle-outline" size={22} color={colors.textLight} style={{ marginRight: spacing.sm }} />
        <Text style={styles.saveBtnText}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Text>
      </TouchableOpacity>

      {/* Logout button */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.marginRed} style={{ marginRight: spacing.sm }} />
        <Text style={styles.logoutBtnText}>Se déconnecter</Text>
      </TouchableOpacity>

      <Text style={styles.version}>MargeBar v1.0.0</Text>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.xl,
  },

  // Section card
  sectionCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  sectionAccent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
  },
  sectionBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  sectionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },

  // Email
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  email: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },

  // Switch
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
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
    marginTop: spacing.xs,
    lineHeight: 17,
  },

  // Thresholds
  thresholdCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  thresholdDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: spacing.sm,
  },
  thresholdLabel: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.text,
  },
  thresholdInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thresholdInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    width: 56,
    textAlign: 'center',
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.cardBackground,
  },
  thresholdUnit: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  thresholdAuto: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },

  // Container presets
  presetScroll: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  presetBtn: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginRight: spacing.sm,
    backgroundColor: colors.cardBackground,
  },
  presetBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  presetBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  presetBtnTextActive: {
    color: colors.textLight,
  },
  customContainerRow: {
    marginTop: spacing.sm,
  },
  customContainerInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  customContainerInput: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  customContainerUnit: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },

  // Serving types
  servingMiniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  servingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  servingIconBadge: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  servingIconEmoji: {
    fontSize: 22,
  },
  servingTextBlock: {
    marginLeft: spacing.sm,
  },
  servingName: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  servingVolume: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  servingActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    padding: spacing.sm,
    marginLeft: spacing.xs,
  },
  iconBtnSmall: {
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
    paddingVertical: spacing.sm,
    ...typography.bodySmall,
    color: colors.text,
    backgroundColor: colors.cardBackground,
  },

  // Add row (shared for serving + category)
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typography.bodySmall,
    color: colors.text,
    backgroundColor: colors.cardBackground,
  },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },

  // Categories
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  categoryName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },

  // Save button
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    ...shadows.md,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    ...typography.button,
    color: colors.textLight,
  },

  // Logout button
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.marginRed,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    marginTop: spacing.md,
    backgroundColor: colors.cardBackground,
  },
  logoutBtnText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.marginRed,
  },

  // Version
  version: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
});
