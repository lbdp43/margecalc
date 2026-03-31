import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, Alert, TouchableOpacity, ScrollView, TextInput, Linking, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TVA_RATES, CONTAINER_PRESETS, ServingType, DEFAULT_MARGIN_THRESHOLDS, Category, CustomContainer } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { DecorativeCurve } from '../../components/ui/DecorativeCurve';
import { ServingTypeIcon } from '../../components/ui/ServingTypeIcon';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuthStore } from '../../store/auth.store';
import { useSystemParamsStore } from '../../store/systemParams.store';
import { api } from '../../services/api';
import * as servingService from '../../services/serving.service';
import * as categoryService from '../../services/category.service';
import * as containerService from '../../services/container.service';
import * as subscriptionService from '../../services/subscription.service';
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

  // System params (admin-managed alcohol taxes)
  const { params: systemParams, getParam, getParamNum, updateParam } = useSystemParamsStore();
  const isAdmin = user?.role === 'admin';

  // Local state for admin editing
  const [editDroitAccise, setEditDroitAccise] = useState('');
  const [editCotisationSecu, setEditCotisationSecu] = useState('');
  const [savingSystemParams, setSavingSystemParams] = useState(false);

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Subscription
  const [subStatus, setSubStatus] = useState<string>(user?.subscriptionStatus || 'none');
  const [subPlan, setSubPlan] = useState<string | null>(user?.subscriptionPlan || null);
  const [subEndDate, setSubEndDate] = useState<string | null>(user?.subscriptionEndDate || null);
  const [subLoading, setSubLoading] = useState(false);

  // Containers
  const [containers, setContainers] = useState<CustomContainer[]>([]);
  const [newContainerName, setNewContainerName] = useState('');
  const [newContainerVolume, setNewContainerVolume] = useState('');
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null);
  const [editContainerName, setEditContainerName] = useState('');
  const [editContainerVolume, setEditContainerVolume] = useState('');

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      loadServingTypes();
      loadCategories();
      loadContainers();
      loadSubscription();
      // Load system params and init admin edit fields
      useSystemParamsStore.getState().loadParams().then(() => {
        if (!mounted) return;
        const state = useSystemParamsStore.getState();
        setEditDroitAccise(state.getParam('droit_accise') || '');
        setEditCotisationSecu(state.getParam('cotisation_secu') || '');
      });
      AsyncStorage.getItem('margebar_margin_thresholds').then((thresholdsVal) => {
        if (!mounted) return;
        if (thresholdsVal) {
          try {
            const parsed = JSON.parse(thresholdsVal);
            setGreenThreshold(String(parsed.good));
            setOrangeThreshold(String(parsed.medium));
          } catch { /* ignore corrupted data */ }
        }
      }).catch(() => {});
      return () => { mounted = false; };
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

  const loadSubscription = async () => {
    try {
      const status = await subscriptionService.getSubscriptionStatus();
      setSubStatus(status.subscriptionStatus);
      setSubPlan(status.subscriptionPlan);
      setSubEndDate(status.subscriptionEndDate);
    } catch {}
  };

  const handleManageSubscription = async () => {
    setSubLoading(true);
    try {
      const { url } = await subscriptionService.createPortalSession();
      if (Platform.OS === 'web') {
        (globalThis as any).open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le portail d\'abonnement');
    } finally {
      setSubLoading(false);
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

  // Container handlers
  const loadContainers = async () => {
    try {
      const list = await containerService.getContainers();
      setContainers(list);
    } catch {}
  };

  const handleAddContainer = async () => {
    const vol = parseFloat(newContainerVolume.replace(',', '.'));
    if (!newContainerName.trim() || isNaN(vol) || vol <= 0) {
      Alert.alert('Erreur', 'Entrez un nom et un volume valide');
      return;
    }
    try {
      await containerService.createContainer(newContainerName.trim(), vol);
      setNewContainerName('');
      setNewContainerVolume('');
      loadContainers();
    } catch {
      Alert.alert('Erreur', 'Impossible de créer le contenant');
    }
  };

  const handleEditContainer = async (id: string) => {
    const vol = parseFloat(editContainerVolume.replace(',', '.'));
    if (!editContainerName.trim() || isNaN(vol) || vol <= 0) {
      Alert.alert('Erreur', 'Entrez un nom et un volume valide');
      return;
    }
    try {
      await containerService.updateContainer(id, {
        name: editContainerName.trim(),
        volumeCl: vol,
      });
      setEditingContainerId(null);
      loadContainers();
    } catch {
      Alert.alert('Erreur', 'Impossible de modifier');
    }
  };

  const handleDeleteContainer = (id: string, name: string) => {
    Alert.alert('Supprimer', `Supprimer "${name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await containerService.deleteContainer(id);
            loadContainers();
          } catch {
            Alert.alert('Erreur', 'Impossible de supprimer');
          }
        },
      },
    ]);
  };

  const startEditContainer = (c: CustomContainer) => {
    setEditingContainerId(c.id);
    setEditContainerName(c.name);
    setEditContainerVolume(String(c.volumeCl));
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

  const handleSaveSystemParams = async () => {
    setSavingSystemParams(true);
    try {
      await updateParam('droit_accise', editDroitAccise.replace(',', '.'));
      await updateParam('cotisation_secu', editCotisationSecu.replace(',', '.'));
      Alert.alert('Succès', 'Paramètres système mis à jour');
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres système');
    } finally {
      setSavingSystemParams(false);
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
      <DecorativeCurve variant="top" />
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

      {/* Droits d'alcool — read-only for users, editable for admin */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Droits d'alcool</Text>
          {!isAdmin && (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
            </View>
          )}
        </View>
        <View style={styles.sectionBody}>
          <Text style={styles.sectionDesc}>
            Prix par hectolitre d'alcool pur (hlAP). Utilisé pour calculer la taxe sur les produits alcoolisés.
            {!isAdmin ? '\nCes valeurs sont gérées par l\'administrateur.' : ''}
          </Text>
          <View style={styles.thresholdCard}>
            <Text style={[styles.thresholdLabel, { flex: 1 }]}>Droit d'accise</Text>
            <View style={styles.thresholdInputWrap}>
              {isAdmin ? (
                <TextInput
                  style={[styles.thresholdInput, { width: 80 }]}
                  value={editDroitAccise}
                  onChangeText={setEditDroitAccise}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
              ) : (
                <Text style={styles.readOnlyValue}>{getParam('droit_accise') || '—'}</Text>
              )}
              <Text style={styles.thresholdUnit}>€/hlAP</Text>
            </View>
          </View>
          <View style={styles.thresholdCard}>
            <Text style={[styles.thresholdLabel, { flex: 1 }]}>Cotisation sécu. sociale</Text>
            <View style={styles.thresholdInputWrap}>
              {isAdmin ? (
                <TextInput
                  style={[styles.thresholdInput, { width: 80 }]}
                  value={editCotisationSecu}
                  onChangeText={setEditCotisationSecu}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                />
              ) : (
                <Text style={styles.readOnlyValue}>{getParam('cotisation_secu') || '—'}</Text>
              )}
              <Text style={styles.thresholdUnit}>€/hlAP</Text>
            </View>
          </View>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.adminSaveBtn, savingSystemParams && styles.saveBtnDisabled]}
              onPress={handleSaveSystemParams}
              disabled={savingSystemParams}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={colors.textLight} style={{ marginRight: spacing.xs }} />
              <Text style={styles.adminSaveBtnText}>
                {savingSystemParams ? 'Enregistrement...' : 'Mettre à jour pour tous les utilisateurs'}
              </Text>
            </TouchableOpacity>
          )}
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

      {/* Contenants */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccent} />
          <Text style={styles.sectionTitle}>Contenants</Text>
        </View>
        <View style={styles.sectionBody}>
          <Text style={styles.sectionDesc}>
            Gérez vos contenants d'achat (bouteille, fût, BIB...). Le contenant par défaut est pré-sélectionné lors de l'ajout d'un produit.
          </Text>

          {/* Default container selector */}
          <Text style={styles.subLabel}>Contenant par défaut</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
            {containers.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.presetBtn,
                  defaultContainerVolumeCl === c.volumeCl && styles.presetBtnActive,
                ]}
                onPress={() => setDefaultContainerVolumeCl(c.volumeCl)}
              >
                <Text
                  style={[
                    styles.presetBtnText,
                    defaultContainerVolumeCl === c.volumeCl && styles.presetBtnTextActive,
                  ]}
                >
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Container list with edit/delete */}
          <Text style={[styles.subLabel, { marginTop: spacing.md }]}>Vos contenants</Text>
          {containers.map((c) => (
            <View key={c.id} style={styles.servingMiniCard}>
              {editingContainerId === c.id ? (
                <View style={styles.servingEditRow}>
                  <TextInput
                    style={[styles.servingInput, { flex: 2 }]}
                    value={editContainerName}
                    onChangeText={setEditContainerName}
                    placeholder="Nom"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TextInput
                    style={[styles.servingInput, { flex: 1 }]}
                    value={editContainerVolume}
                    onChangeText={setEditContainerVolume}
                    keyboardType="numeric"
                    placeholder="cl"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TouchableOpacity onPress={() => handleEditContainer(c.id)} style={styles.iconBtn}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingContainerId(null)} style={styles.iconBtn}>
                    <Ionicons name="close-circle" size={24} color={colors.marginRed} />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.servingInfo}>
                    <View style={styles.servingIconBadge}>
                      <Ionicons name="cube-outline" size={20} color={colors.accent} />
                    </View>
                    <View style={styles.servingTextBlock}>
                      <Text style={styles.servingName}>{c.name}</Text>
                      <Text style={styles.servingVolume}>{c.volumeCl} cl</Text>
                    </View>
                  </View>
                  <View style={styles.servingActions}>
                    <TouchableOpacity onPress={() => startEditContainer(c)} style={styles.iconBtnSmall}>
                      <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteContainer(c.id, c.name)} style={styles.iconBtnSmall}>
                      <Ionicons name="trash-outline" size={18} color={colors.marginRed} />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ))}

          {/* Add new container */}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, { flex: 2 }]}
              value={newContainerName}
              onChangeText={setNewContainerName}
              placeholder="Nom (ex: Bouteille 1L)"
              placeholderTextColor={colors.textSecondary}
            />
            <TextInput
              style={[styles.addInput, { flex: 1 }]}
              value={newContainerVolume}
              onChangeText={setNewContainerVolume}
              keyboardType="numeric"
              placeholder="cl"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity onPress={handleAddContainer} style={styles.addBtn}>
              <Ionicons name="add" size={22} color={colors.textLight} />
            </TouchableOpacity>
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
                    <ServingTypeIcon name={st.name} icon={st.icon} size={40} />
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

      {/* Abonnement */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: colors.primary }]} />
          <Text style={styles.sectionTitle}>Abonnement</Text>
        </View>
        <View style={styles.sectionBody}>
          <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionInfo}>
              <View style={[styles.subscriptionBadge, subStatus === 'active' || subStatus === 'trialing' ? styles.subscriptionBadgeActive : styles.subscriptionBadgeInactive]}>
                <Ionicons
                  name={subStatus === 'active' || subStatus === 'trialing' ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={subStatus === 'active' || subStatus === 'trialing' ? colors.marginGreen : colors.tabBarInactive}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.subscriptionStatus}>
                  {subStatus === 'active' ? 'Abonnement actif' :
                   subStatus === 'trialing' ? 'Période d\'essai' :
                   subStatus === 'past_due' ? 'Paiement en retard' :
                   subStatus === 'canceled' ? 'Abonnement annulé' :
                   'Aucun abonnement'}
                </Text>
                {subPlan && (
                  <Text style={styles.subscriptionPlan}>
                    Plan : {subPlan === 'pro_yearly' ? 'Annuel' : 'Mensuel'} — 2,50 €/mois
                  </Text>
                )}
                {subEndDate && (
                  <Text style={styles.subscriptionDate}>
                    {subStatus === 'active' ? 'Renouvellement' : 'Expire'} le {new Date(subEndDate).toLocaleDateString('fr-FR')}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={styles.subscriptionBtn}
              onPress={handleManageSubscription}
              disabled={subLoading}
              activeOpacity={0.7}
            >
              <Ionicons name="card-outline" size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
              <Text style={styles.subscriptionBtnText}>
                {subLoading ? 'Chargement...' : subStatus === 'active' ? 'Gérer mon abonnement' : 'Voir les offres'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Admin panel — visible only to admins */}
      {isAdmin && (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionAccent, { backgroundColor: colors.marginOrange }]} />
            <Text style={styles.sectionTitle}>Administration</Text>
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={14} color={colors.textLight} />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          </View>
          <View style={styles.sectionBody}>
            <Text style={styles.sectionDesc}>
              Paramètres système appliqués à tous les utilisateurs. Seuls les administrateurs peuvent modifier ces valeurs.
            </Text>
            {systemParams.filter(p => !['droit_accise', 'cotisation_secu'].includes(p.key)).map((param) => (
              <View key={param.key} style={styles.systemParamRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.systemParamLabel}>{param.label}</Text>
                  {param.description && (
                    <Text style={styles.systemParamDesc}>{param.description}</Text>
                  )}
                </View>
                <View style={styles.thresholdInputWrap}>
                  <Text style={styles.readOnlyValue}>{param.value}</Text>
                  {param.unit && <Text style={styles.thresholdUnit}>{param.unit}</Text>}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

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
  subLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
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

  // Subscription
  subscriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  subscriptionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  subscriptionBadge: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  subscriptionBadgeActive: {
    backgroundColor: colors.light,
  },
  subscriptionBadgeInactive: {
    backgroundColor: colors.cardBackground,
  },
  subscriptionStatus: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  },
  subscriptionPlan: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  subscriptionDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  subscriptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  subscriptionBtnText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
  },

  // Read-only value display
  readOnlyValue: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    minWidth: 56,
    textAlign: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },

  // Lock badge (for read-only sections)
  lockBadge: {
    marginLeft: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Admin badge
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.marginOrange,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginLeft: 'auto',
  },
  adminBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textLight,
    marginLeft: 4,
    fontSize: 11,
  },

  // Admin save button
  adminSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  adminSaveBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textLight,
  },

  // System param rows
  systemParamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  systemParamLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  systemParamDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
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
