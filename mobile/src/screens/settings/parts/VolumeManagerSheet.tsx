/**
 * Manager sheet for named volumes: serving types (« Shot 3 cl ») and purchase
 * containers (« 70 cl », « Fût 30 L »). One full-height BottomSheet with three
 * views — list → add / edit — so sheets never stack. Deletions are confirmed
 * with a destructive dialog. In-sheet successes show an inline note (toasts
 * never appear over an open sheet).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheet,
  Button,
  EmptyState,
  FadeIn,
  IconName,
  ListRow,
  SwapFade,
  TextField,
  dialog,
} from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatVolumeCl, parseLocaleFloat, plural, toInputString } from '../../../utils/format';
import { readableError } from './helpers';
import { ErrorLine, RowSkeleton, SheetBack } from './ui';

export interface VolumeItem {
  id: string;
  name: string;
  volumeCl: number;
  sortOrder: number;
}

export interface VolumeManagerCopy {
  title: string;
  /** « 5 services » */
  count: (n: number) => string;
  listSubline: string;
  addLabel: string;
  newTitle: string;
  editTitle: string;
  createLabel: string;
  namePlaceholder: string;
  volumePlaceholder: string;
  volumeHelper: string;
  emptyTitle: string;
  emptyText: string;
  created: (name: string) => string;
  updated: (name: string) => string;
  deleted: (name: string) => string;
  confirmDelete: (item: VolumeItem) => { title: string; message: string };
}

type View_ = { mode: 'list' } | { mode: 'add' } | { mode: 'edit'; item: VolumeItem };

export interface VolumeManagerSheetProps {
  visible: boolean;
  onClose: () => void;
  copy: VolumeManagerCopy;
  items: VolumeItem[] | undefined;
  loading: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  icon: (item: Pick<VolumeItem, 'name' | 'volumeCl'>) => IconName;
  /** Subtitle of a row (e.g. « Par défaut pour un nouveau produit »). */
  rowSubtitle?: (item: VolumeItem) => string | undefined;
  create: (name: string, volumeCl: number) => Promise<unknown>;
  update: (id: string, data: { name: string; volumeCl: number }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  maxVolumeCl: number;
  testID?: string;
}

export function VolumeManagerSheet({
  visible,
  onClose,
  copy,
  items,
  loading,
  loadError,
  onRetry,
  icon,
  rowSubtitle,
  create,
  update,
  remove,
  maxVolumeCl,
  testID,
}: VolumeManagerSheetProps) {
  const [view, setView] = useState<View_>({ mode: 'list' });
  const [name, setName] = useState('');
  const [volume, setVolume] = useState('');
  const [errors, setErrors] = useState<{ name?: string; volumeCl?: string; form?: string }>({});
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setView({ mode: 'list' });
      setFlash(null);
    }
  }, [visible]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const showFlash = (text: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ id: Date.now(), text });
    flashTimer.current = setTimeout(() => setFlash(null), 3200);
  };

  const openAdd = () => {
    setName('');
    setVolume('');
    setErrors({});
    setView({ mode: 'add' });
  };
  const openEdit = (item: VolumeItem) => {
    setName(item.name);
    setVolume(toInputString(item.volumeCl, Number.isInteger(item.volumeCl) ? 0 : 1));
    setErrors({});
    setView({ mode: 'edit', item });
  };
  const backToList = () => {
    setErrors({});
    setView({ mode: 'list' });
  };

  const parsedVolume = parseLocaleFloat(volume);
  const volumeHint = isFinite(parsedVolume) && parsedVolume > 0 ? `Soit ${formatVolumeCl(parsedVolume)}` : copy.volumeHelper;

  const validate = (): { name: string; volumeCl: number } | null => {
    const next: typeof errors = {};
    const n = name.trim();
    if (!n) next.name = 'Indiquez un nom.';
    if (!isFinite(parsedVolume) || parsedVolume <= 0) next.volumeCl = 'Indiquez un volume supérieur à 0 cl.';
    else if (parsedVolume > maxVolumeCl) next.volumeCl = `Le volume ne peut pas dépasser ${formatVolumeCl(maxVolumeCl)}.`;
    setErrors(next);
    if (next.name || next.volumeCl) {
      haptics.warning();
      return null;
    }
    return { name: n, volumeCl: Math.round(parsedVolume * 100) / 100 };
  };

  const submit = async () => {
    const data = validate();
    if (!data) return;
    setBusy('save');
    try {
      if (view.mode === 'edit') {
        await update(view.item.id, data);
        showFlash(copy.updated(data.name));
      } else {
        await create(data.name, data.volumeCl);
        showFlash(copy.created(data.name));
      }
      haptics.success();
      setView({ mode: 'list' });
    } catch (err) {
      haptics.warning();
      const e = readableError(err, 'L’enregistrement a échoué. Réessayez.');
      setErrors({ name: e.fields.name, volumeCl: e.fields.volumeCl, form: e.fields.name || e.fields.volumeCl ? undefined : e.message });
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (view.mode !== 'edit') return;
    const item = view.item;
    const ok = await dialog.confirm({ ...copy.confirmDelete(item), confirmLabel: 'Supprimer', destructive: true });
    if (!ok) return;
    setBusy('delete');
    try {
      await remove(item.id);
      haptics.success();
      showFlash(copy.deleted(item.name));
      setView({ mode: 'list' });
    } catch (err) {
      haptics.warning();
      setErrors({ form: readableError(err, 'La suppression a échoué. Réessayez.').message });
    } finally {
      setBusy(null);
    }
  };

  const list = items ?? [];
  const title = view.mode === 'list' ? copy.title : view.mode === 'add' ? copy.newTitle : copy.editTitle;
  const subline =
    view.mode === 'list'
      ? items
        ? `${copy.count(list.length)} · ${copy.listSubline}`
        : copy.listSubline
      : view.mode === 'edit'
        ? `${view.item.name} · ${formatVolumeCl(view.item.volumeCl)}`
        : copy.listSubline;

  const footer =
    view.mode === 'list' ? (
      <Button title={copy.addLabel} icon="add" onPress={openAdd} disabled={!items && !!loadError} testID={`${testID}-add`} />
    ) : view.mode === 'add' ? (
      <Button title={copy.createLabel} icon="checkmark-circle" onPress={submit} loading={busy === 'save'} testID={`${testID}-create`} />
    ) : (
      <View style={styles.footerRow}>
        <Button
          title="Supprimer"
          variant="destructive"
          icon="trash-outline"
          onPress={confirmDelete}
          loading={busy === 'delete'}
          disabled={busy === 'save'}
          style={{ flex: 1 }}
          testID={`${testID}-delete`}
        />
        <Button
          title="Enregistrer"
          icon="checkmark-circle"
          onPress={submit}
          loading={busy === 'save'}
          disabled={busy === 'delete'}
          style={{ flex: 1.3 }}
          testID={`${testID}-save`}
        />
      </View>
    );

  const rows = useMemo(
    () =>
      list.map((item, i) => (
        <ListRow
          key={item.id}
          icon={icon(item)}
          title={item.name}
          subtitle={rowSubtitle?.(item)}
          value={formatVolumeCl(item.volumeCl)}
          onPress={() => openEdit(item)}
          divider={i < list.length - 1}
          accessibilityLabel={`${item.name}, ${formatVolumeCl(item.volumeCl)}. Modifier`}
          testID={`${testID}-row`}
        />
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, rowSubtitle],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subline={subline}
      snap="full"
      contentPadding={view.mode === 'list' ? 8 : 20}
      footer={footer}
      testID={testID}
    >
      <SwapFade value={view.mode === 'edit' ? `edit-${view.item.id}` : view.mode}>
        {view.mode === 'list' ? (
          <View>
            {flash ? (
              <FadeIn key={flash.id} offset={6} style={styles.flash}>
                <Ionicons name="checkmark-circle" size={18} color={palette.good} />
                <Text style={styles.flashText} accessibilityLiveRegion="polite">
                  {flash.text}
                </Text>
              </FadeIn>
            ) : null}
            {!items && loading ? (
              <>
                <RowSkeleton />
                <RowSkeleton />
                <RowSkeleton last />
              </>
            ) : !items && loadError ? (
              <EmptyState
                surface="surface"
                icon="cloud-offline-outline"
                title="Chargement impossible"
                text={loadError}
                primary={onRetry ? { label: 'Réessayer', icon: 'refresh', onPress: onRetry } : undefined}
              />
            ) : list.length === 0 ? (
              <EmptyState surface="surface" icon="albums-outline" title={copy.emptyTitle} text={copy.emptyText} />
            ) : (
              rows
            )}
          </View>
        ) : (
          <View style={{ gap: 20 }}>
            <SheetBack label={copy.title} onPress={backToList} />
            <TextField
              label="Nom"
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (errors.name || errors.form) setErrors((e) => ({ ...e, name: undefined, form: undefined }));
              }}
              placeholder={copy.namePlaceholder}
              maxLength={60}
              autoFocus={view.mode === 'add'}
              error={errors.name}
              testID={`${testID}-name`}
            />
            <TextField
              label="Volume"
              value={volume}
              onChangeText={(t) => {
                setVolume(t);
                if (errors.volumeCl || errors.form) setErrors((e) => ({ ...e, volumeCl: undefined, form: undefined }));
              }}
              onBlur={() => {
                if (isFinite(parsedVolume) && parsedVolume > 0) setVolume(toInputString(parsedVolume, Number.isInteger(parsedVolume) ? 0 : 1));
              }}
              placeholder={copy.volumePlaceholder}
              keyboardType="decimal-pad"
              suffix="cl"
              helper={volumeHint}
              error={errors.volumeCl}
              returnKeyType="done"
              onSubmitEditing={submit}
              testID={`${testID}-volume`}
            />
            <ErrorLine message={errors.form} style={{ marginTop: -8 }} />
          </View>
        )}
      </SwapFade>
    </BottomSheet>
  );
}

export const SERVING_COPY: VolumeManagerCopy = {
  title: 'Types de service',
  count: (n) => plural(n, 'service'),
  listSubline: 'pour le prix au verre',
  addLabel: 'Ajouter un service',
  newTitle: 'Nouveau service',
  editTitle: 'Modifier le service',
  createLabel: 'Créer le service',
  namePlaceholder: 'Ex. : Coupe de champagne',
  volumePlaceholder: '12',
  volumeHelper: 'Le volume servi au client, en centilitres.',
  emptyTitle: 'Aucun service',
  emptyText: 'Ajoutez vos formats : shot, verre, demi, pinte…',
  created: (n) => `« ${n} » ajouté`,
  updated: (n) => `« ${n} » enregistré`,
  deleted: (n) => `« ${n} » supprimé`,
  confirmDelete: (item) => ({
    title: `Supprimer « ${item.name} » ?`,
    message: `Les produits servis en « ${item.name} » perdront ce service ; leur prix de référence passera au service suivant. Cette action est définitive.`,
  }),
};

export const CONTAINER_COPY: VolumeManagerCopy = {
  title: 'Contenants',
  count: (n) => plural(n, 'contenant'),
  listSubline: 'bouteilles, fûts, BIB',
  addLabel: 'Ajouter un contenant',
  newTitle: 'Nouveau contenant',
  editTitle: 'Modifier le contenant',
  createLabel: 'Créer le contenant',
  namePlaceholder: 'Ex. : Bouteille 1 L',
  volumePlaceholder: '100',
  volumeHelper: 'La contenance achetée, en centilitres (1 L = 100 cl).',
  emptyTitle: 'Aucun contenant',
  emptyText: 'Ajoutez les formats que vous achetez : bouteille, fût, BIB…',
  created: (n) => `« ${n} » ajouté`,
  updated: (n) => `« ${n} » enregistré`,
  deleted: (n) => `« ${n} » supprimé`,
  confirmDelete: (item) => ({
    title: `Supprimer « ${item.name} » ?`,
    message: 'Ce contenant ne sera plus proposé à l’ajout d’un produit. Vos produits existants ne changent pas.',
  }),
};

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', gap: 10 },
  flash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.goodBg,
  },
  flashText: { ...type.calloutStrong, color: palette.good, flex: 1 },
});
