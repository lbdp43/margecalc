import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { TVA_RATES, CONTAINER_PRESETS } from '@margebar/shared';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuthStore } from '../../store/auth.store';
import { api } from '../../services/api';
import { colors, spacing, borderRadius, typography } from '../../theme';

export function SettingsScreen() {
  const { user, setAuth, logout } = useAuthStore();
  const [businessName, setBusinessName] = useState(user?.businessName || '');
  const [isAutoEntrepreneur, setIsAutoEntrepreneur] = useState(user?.isAutoEntrepreneur || false);
  const [defaultContainerVolumeCl, setDefaultContainerVolumeCl] = useState(
    user?.defaultContainerVolumeCl || 70
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
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
});
