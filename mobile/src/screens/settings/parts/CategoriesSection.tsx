/**
 * « Catégories » — the built-in categories (shared) and the user's own,
 * private ones (POST /api/categories creates a private category; an admin can
 * choose to add it for every account).
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Category } from '@margebar/shared';
import { BottomSheet, Button, ListGroup, ListRow, TextField, categoryIcon, toast } from '../../../components/ui';
import { palette } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { api } from '../../../services/api';
import { useAuthStore } from '../../../store/auth.store';
import { SETTINGS_KEYS, useCategories, useSettingsQueryClient } from './data';
import { readableError } from './helpers';
import { RowSkeleton, SettingsSection } from './ui';

const NAME_MAX = 60;

export function CategoriesSection({ index }: { index: number }) {
  const { data, isLoading, error, refetch } = useCategories();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [addOpen, setAddOpen] = useState(false);

  const builtIn = (data ?? []).filter((c) => !c.userId);
  const mine = (data ?? []).filter((c) => !!c.userId);
  const loadError = error && !data ? readableError(error, 'Les catégories n’ont pas pu être chargées.').message : null;

  return (
    <SettingsSection
      title="Catégories"
      index={index}
      footer="Vos catégories personnelles sont privées : elles n’apparaissent que sur votre compte."
      testID="settings-categories"
    >
      <ListGroup>
        {isLoading && !data ? (
          <View>
            <RowSkeleton />
            <RowSkeleton last />
          </View>
        ) : null}
        {loadError ? (
          <ListRow
            icon="cloud-offline-outline"
            iconTone="neutral"
            title="Chargement impossible"
            subtitle={`${loadError} Touchez pour réessayer.`}
            onPress={() => refetch()}
            right="none"
          />
        ) : null}
        {data ? (
          <ListRow
            icon="grid-outline"
            iconTone="neutral"
            title="Catégories de base"
            subtitle={builtIn.map((c) => c.name).join(', ')}
            subtitleLines={3}
            right="value"
            value={String(builtIn.length)}
          />
        ) : null}
        {mine.map((c) => (
          <ListRow
            key={c.id}
            icon={categoryIcon(c.slug) ?? 'pricetag-outline'}
            title={c.name}
            subtitle="Catégorie personnelle"
            testID="settings-category-row"
          />
        ))}
        {data ? (
          <ListRow
            icon="add"
            title="Ajouter une catégorie"
            titleStyle={{ color: palette.em700 }}
            onPress={() => setAddOpen(true)}
            right="none"
            testID="settings-add-category"
          />
        ) : null}
      </ListGroup>
      <AddCategorySheet visible={addOpen} onClose={() => setAddOpen(false)} isAdmin={isAdmin} existing={data ?? []} />
    </SettingsSection>
  );
}

function AddCategorySheet({ visible, onClose, isAdmin, existing }: { visible: boolean; onClose: () => void; isAdmin: boolean; existing: Category[] }) {
  const qc = useSettingsQueryClient();
  const [name, setName] = useState('');
  const [global, setGlobal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setGlobal(false);
      setError(null);
    }
  }, [visible]);

  const save = async () => {
    const n = name.trim();
    if (!n) {
      haptics.warning();
      setError('Indiquez le nom de la catégorie.');
      return;
    }
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (existing.some((c) => norm(c.name) === norm(n))) {
      haptics.warning();
      setError('Une catégorie porte déjà ce nom.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<Category>('/categories', isAdmin ? { name: n, global } : { name: n });
      qc.setQueryData<Category[]>([...SETTINGS_KEYS.categories], (prev) => (prev ? [...prev, res.data] : prev));
      qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.categories] });
      haptics.success();
      onClose();
      toast.success(`Catégorie « ${res.data.name} » créée`);
    } catch (err) {
      haptics.warning();
      const e = readableError(err, 'La catégorie n’a pas pu être créée.');
      setError(e.fields.name ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Nouvelle catégorie"
      subline={isAdmin && global ? 'Ajoutée à tous les comptes.' : 'Privée : visible sur votre compte uniquement.'}
      footer={<Button title="Créer la catégorie" icon="checkmark-circle" onPress={save} loading={saving} testID="category-create" />}
      testID="sheet-add-category"
    >
      <TextField
        label="Nom de la catégorie"
        meta={`${name.length} / ${NAME_MAX}`}
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (error) setError(null);
        }}
        placeholder="Ex. : Cidres & poirés"
        maxLength={NAME_MAX}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        error={error}
        testID="input-category-name"
      />
      {isAdmin ? (
        <View style={{ marginTop: 16, marginHorizontal: -12 }}>
          <ListRow
            icon="people-outline"
            title="Pour tous les comptes"
            subtitle="Administrateur : ajoute une catégorie de base"
            switchValue={global}
            onSwitchChange={setGlobal}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}
