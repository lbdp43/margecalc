/**
 * « Catalogue » — serving types (prix au verre), purchase containers, the
 * default container of a new product, and the categories. Each row opens one
 * sheet; sheets never stack.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CustomContainer } from '@margebar/shared';
import { ListGroup, ListRow, toast } from '../../../components/ui';
import { haptics } from '../../../theme/haptics';
import { formatVolumeCl, plural } from '../../../utils/format';
import { useAuthStore } from '../../../store/auth.store';
import * as servingService from '../../../services/serving.service';
import * as containerService from '../../../services/container.service';
import { invalidateProducts, SETTINGS_KEYS, updateMe, useCategories, useContainers, useServingTypes } from './data';
import { readableError, servingIcon } from './helpers';
import { CONTAINER_COPY, nameIsVolume, SERVING_COPY, VolumeManagerSheet } from './VolumeManagerSheet';
import { CategoriesSheet } from './CategoriesSheet';
import { ErrorLine, RowSkeleton, SettingsSection, Sheet } from './ui';

function summary(names: string[], max = 3): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')}…`;
}

/** The formats a bar buys first (bottles, kegs, BIB), the miniatures after. */
function purchaseFormatsFirst(list: CustomContainer[]): CustomContainer[] {
  const big = list.filter((c) => c.volumeCl >= 33);
  const small = list.filter((c) => c.volumeCl < 33);
  return [...big, ...small];
}

type Open = 'servings' | 'containers' | 'default' | 'categories' | null;

export function CatalogSection({ index }: { index: number }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const servings = useServingTypes();
  const containers = useContainers();
  const categories = useCategories();
  const [open, setOpen] = useState<Open>(null);
  /** The container picked in this session (two containers may share a volume). */
  const [chosenId, setChosenId] = useState<string | null>(null);

  const servingList = servings.data;
  const containerList = containers.data;
  const defaultVolume = user?.defaultContainerVolumeCl ?? 70;
  const defaultContainer =
    containerList?.find((c) => c.id === chosenId && c.volumeCl === defaultVolume) ?? containerList?.find((c) => c.volumeCl === defaultVolume);
  const defaultLabel = defaultContainer ? defaultContainer.name : formatVolumeCl(defaultVolume);

  const servingError = servings.error ? readableError(servings.error, 'Les services n’ont pas pu être chargés.').message : null;
  const containerError = containers.error ? readableError(containers.error, 'Les contenants n’ont pas pu être chargés.').message : null;
  const categoryError = categories.error && !categories.data ? readableError(categories.error, 'Les catégories n’ont pas pu être chargées.').message : null;

  const builtIn = useMemo(() => (categories.data ?? []).filter((c) => !c.userId), [categories.data]);
  const mine = useMemo(() => (categories.data ?? []).filter((c) => !!c.userId), [categories.data]);

  const refreshServings = useCallback(() => {
    qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.servingTypes] });
    invalidateProducts(qc);
  }, [qc]);
  const refreshContainers = useCallback(() => qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.containers] }), [qc]);
  const close = useCallback(() => setOpen(null), []);

  const loadingFirst = (servings.isLoading && !servingList) || (containers.isLoading && !containerList);

  return (
    <SettingsSection title="Catalogue" index={index} testID="settings-services">
      <ListGroup>
        {loadingFirst ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton last />
          </View>
        ) : null}
        {!loadingFirst ? (
          <ListRow
            icon="wine-outline"
            title="Types de service"
            subtitle={servingList ? summary(servingList.map((s) => s.name)) || 'Aucun service' : servingError ?? '…'}
            subtitleLines={1}
            value={servingList ? String(servingList.length) : undefined}
            onPress={() => setOpen('servings')}
            testID="settings-servings"
          />
        ) : null}
        {!loadingFirst ? (
          <ListRow
            icon="cube-outline"
            title="Contenants"
            subtitle={containerList ? summary(purchaseFormatsFirst(containerList).map((c) => c.name)) || 'Aucun contenant' : containerError ?? '…'}
            subtitleLines={1}
            value={containerList ? String(containerList.length) : undefined}
            onPress={() => setOpen('containers')}
            testID="settings-containers"
          />
        ) : null}
        {!loadingFirst ? (
          <ListRow
            icon="star-outline"
            title="Contenant par défaut"
            subtitle="Nouveau produit"
            subtitleLines={1}
            value={defaultLabel}
            onPress={() => setOpen('default')}
            testID="settings-default-container"
          />
        ) : null}
        {!loadingFirst ? (
          <ListRow
            icon="grid-outline"
            title="Catégories"
            subtitle={
              categoryError ??
              (categories.data
                ? mine.length
                  ? `${builtIn.length} de base · ${plural(mine.length, 'personnelle', 'personnelles')}`
                  : `${builtIn.length} de base · ajoutez les vôtres`
                : '…')
            }
            subtitleLines={1}
            value={categories.data ? String(categories.data.length) : undefined}
            onPress={() => {
              if (categoryError) categories.refetch();
              setOpen('categories');
            }}
            testID="settings-categories"
          />
        ) : null}
      </ListGroup>

      <VolumeManagerSheet
        visible={open === 'servings'}
        onClose={close}
        copy={SERVING_COPY}
        items={servingList}
        loading={servings.isLoading}
        loadError={servingError}
        onRetry={() => servings.refetch()}
        icon={(s) => servingIcon(s.name, s.volumeCl)}
        maxVolumeCl={100_000}
        create={async (name, volumeCl) => {
          const created = await servingService.createServingType({ name, volumeCl, sortOrder: (servingList?.length ?? 0) + 1 });
          refreshServings();
          return created;
        }}
        update={async (id, data) => {
          const updated = await servingService.updateServingType(id, data);
          refreshServings();
          return updated;
        }}
        remove={async (id) => {
          await servingService.deleteServingType(id);
          refreshServings();
        }}
        testID="sheet-servings"
      />

      <VolumeManagerSheet
        visible={open === 'containers'}
        onClose={close}
        copy={CONTAINER_COPY}
        items={containerList}
        loading={containers.isLoading}
        loadError={containerError}
        onRetry={() => containers.refetch()}
        icon={() => 'cube-outline'}
        rowSubtitle={(c) => (c.id === defaultContainer?.id ? 'Contenant par défaut' : undefined)}
        maxVolumeCl={100_000}
        create={async (name, volumeCl) => {
          const created = await containerService.createContainer(name, volumeCl);
          refreshContainers();
          return created;
        }}
        update={async (id, data) => {
          const updated = await containerService.updateContainer(id, data);
          refreshContainers();
          return updated;
        }}
        remove={async (id) => {
          await containerService.deleteContainer(id);
          refreshContainers();
        }}
        testID="sheet-containers"
      />

      <DefaultContainerSheet
        visible={open === 'default'}
        onClose={close}
        containers={containerList ?? []}
        selectedId={defaultContainer?.id ?? null}
        currentVolume={defaultVolume}
        onChosen={setChosenId}
      />

      <CategoriesSheet
        visible={open === 'categories'}
        onClose={close}
        isAdmin={isAdmin}
        categories={categories.data}
        loading={categories.isLoading}
        loadError={categoryError}
        onRetry={() => categories.refetch()}
      />
    </SettingsSection>
  );
}

function DefaultContainerSheet({
  visible,
  onClose,
  containers,
  selectedId,
  currentVolume,
  onChosen,
}: {
  visible: boolean;
  onClose: () => void;
  containers: CustomContainer[];
  selectedId: string | null;
  currentVolume: number;
  onChosen: (id: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = pendingId ?? selectedId;

  const done = (c: CustomContainer, changed: boolean) => {
    setTimeout(() => {
      onClose();
      setPendingId(null);
      if (changed) toast.success(`Contenant par défaut : ${c.name}`);
    }, 120);
  };

  const choose = async (c: CustomContainer) => {
    if (pendingId) return;
    if (c.id === selected) {
      done(c, false);
      return;
    }
    setPendingId(c.id);
    setError(null);
    // Same volume as the saved default: only the name shown here changes.
    if (Math.abs(c.volumeCl - currentVolume) < 0.005) {
      onChosen(c.id);
      haptics.success();
      done(c, true);
      return;
    }
    try {
      await updateMe({ defaultContainerVolumeCl: c.volumeCl });
      onChosen(c.id);
      haptics.success();
      done(c, true);
    } catch (err) {
      setPendingId(null);
      haptics.warning();
      setError(readableError(err, 'Le contenant par défaut n’a pas pu être enregistré.').message);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title="Contenant par défaut"
      subline="Pré-sélectionné quand vous ajoutez un produit."
      contentPadding={8}
      testID="sheet-default-container"
    >
      <ErrorLine message={error} style={{ marginHorizontal: 12, marginTop: 0, marginBottom: 8 }} />
      {containers.map((c, i) => (
        <ListRow
          key={c.id}
          title={c.name}
          subtitle={nameIsVolume(c) ? undefined : formatVolumeCl(c.volumeCl)}
          right="radio"
          selected={c.id === selected}
          onPress={() => choose(c)}
          divider={i < containers.length - 1}
          testID="default-container-row"
        />
      ))}
    </Sheet>
  );
}
