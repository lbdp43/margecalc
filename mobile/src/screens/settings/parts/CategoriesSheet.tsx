/**
 * Catalogue › Catégories: the built-in categories (shared by every account)
 * and the user's own, private ones, then « Ajouter une catégorie » in the same
 * sheet (list → add). POST /api/categories creates a private category; an
 * admin can choose to add it for every account.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Category } from '@margebar/shared';
import { Button, EmptyState, ListRow, SectionHeader, SwapFade, TextField, categoryIcon } from '../../../components/ui';
import { haptics } from '../../../theme/haptics';
import { plural } from '../../../utils/format';
import { api } from '../../../services/api';
import { SETTINGS_KEYS } from './data';
import { readableError, sameName } from './helpers';
import { ErrorLine, RowSkeleton, Sheet, SheetBack, SheetFlash, SwitchRow, useSheetFlash } from './ui';

const NAME_MAX = 60;

export function CategoriesSheet({
  visible,
  onClose,
  isAdmin,
  categories,
  loading,
  loadError,
  onRetry,
}: {
  visible: boolean;
  onClose: () => void;
  isAdmin: boolean;
  categories?: Category[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [name, setName] = useState('');
  const [global, setGlobal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, showFlash, clearFlash] = useSheetFlash();

  useEffect(() => {
    if (visible) {
      setMode('list');
      clearFlash();
    }
  }, [visible, clearFlash]);

  const builtIn = (categories ?? []).filter((c) => !c.userId);
  const mine = (categories ?? []).filter((c) => !!c.userId);

  const openAdd = () => {
    setName('');
    setGlobal(false);
    setError(null);
    setFormError(null);
    setMode('add');
  };

  const save = async () => {
    const n = name.trim();
    if (!n) {
      haptics.warning();
      setError('Indiquez le nom de la catégorie.');
      return;
    }
    if ((categories ?? []).some((c) => sameName(c.name, n))) {
      haptics.warning();
      setError('Une catégorie porte déjà ce nom.');
      return;
    }
    setSaving(true);
    setError(null);
    setFormError(null);
    try {
      const res = await api.post<Category>('/categories', isAdmin ? { name: n, global } : { name: n });
      qc.setQueryData<Category[]>([...SETTINGS_KEYS.categories], (prev) => (prev ? [...prev, res.data] : prev));
      qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.categories] });
      haptics.success();
      setMode('list');
      showFlash(`Catégorie « ${res.data.name} » créée`);
    } catch (err) {
      haptics.warning();
      const e = readableError(err, 'La catégorie n’a pas pu être créée.');
      if (e.fields.name || e.status === 400 || e.status === 409) setError(e.fields.name ?? e.message);
      else setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const subline =
    mode === 'add'
      ? isAdmin && global
        ? 'Ajoutée à tous les comptes.'
        : 'Privée : visible sur votre compte uniquement.'
      : categories
        ? mine.length
          ? `${builtIn.length} de base · ${plural(mine.length, 'personnelle', 'personnelles')} (privée${mine.length > 1 ? 's' : ''})`
          : `${builtIn.length} catégories de base, partagées par tous les comptes`
        : 'Catégories de vos produits';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={mode === 'add' ? 'Nouvelle catégorie' : 'Catégories'}
      subline={subline}
      contentPadding={mode === 'list' ? 8 : 20}
      footer={
        mode === 'list' ? (
          <Button title="Ajouter une catégorie" icon="add" onPress={openAdd} disabled={!categories} testID="settings-add-category" />
        ) : (
          <Button title="Créer la catégorie" icon="checkmark-circle" onPress={save} loading={saving} testID="category-create" />
        )
      }
      testID="sheet-categories"
    >
      <SwapFade value={mode}>
        {mode === 'list' ? (
          <View>
            <SheetFlash flash={flash} style={styles.flash} />
            {!categories && loading ? (
              <>
                <RowSkeleton />
                <RowSkeleton />
                <RowSkeleton last />
              </>
            ) : !categories && loadError ? (
              <EmptyState
                surface="surface"
                icon="cloud-offline-outline"
                title="Chargement impossible"
                text={loadError}
                primary={{ label: 'Réessayer', icon: 'refresh', onPress: onRetry }}
              />
            ) : (
              <>
                {mine.length ? (
                  <>
                    <SectionHeader variant="caps" title="Vos catégories" style={styles.group} />
                    {mine.map((c, i) => (
                      <ListRow
                        key={c.id}
                        icon={categoryIcon(c.slug) ?? 'pricetag-outline'}
                        title={c.name}
                        subtitle="Privée"
                        subtitleLines={1}
                        divider={i < mine.length - 1}
                        testID="settings-category-row"
                      />
                    ))}
                  </>
                ) : null}
                <SectionHeader variant="caps" title="Catégories de base" style={styles.group} />
                {builtIn.map((c, i) => (
                  <ListRow
                    key={c.id}
                    icon={categoryIcon(c.slug) ?? 'pricetag-outline'}
                    iconTone="neutral"
                    title={c.name}
                    divider={i < builtIn.length - 1}
                  />
                ))}
              </>
            )}
          </View>
        ) : (
          <View>
            <SheetBack label="Catégories" onPress={() => setMode('list')} testID="category-back" />
            <TextField
              label="Nom de la catégorie"
              meta={`${name.length} / ${NAME_MAX}`}
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (error) setError(null);
                if (formError) setFormError(null);
              }}
              placeholder="Ex. : Cidres & poirés"
              maxLength={NAME_MAX}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
              error={error}
              testID="input-category-name"
            />
            <ErrorLine message={formError} />
            {isAdmin ? (
              <View style={styles.adminSwitch}>
                <SwitchRow
                  icon="people-outline"
                  title="Pour tous les comptes"
                  subtitle="Ajoute une catégorie de base"
                  subtitleLines={1}
                  value={global}
                  onChange={setGlobal}
                  testID="category-global"
                />
              </View>
            ) : null}
          </View>
        )}
      </SwapFade>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flash: { marginHorizontal: 12, marginBottom: 8 },
  group: { paddingHorizontal: 12, marginTop: 8 },
  adminSwitch: { marginTop: 16, marginHorizontal: -12 },
});
