/**
 * « Services & contenants » — serving types (prix au verre), purchase
 * containers and the default container of a new product.
 */
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { CustomContainer } from '@margebar/shared';
import { BottomSheet, ListGroup, ListRow, toast } from '../../../components/ui';
import { haptics } from '../../../theme/haptics';
import { formatVolumeCl } from '../../../utils/format';
import { useAuthStore } from '../../../store/auth.store';
import * as servingService from '../../../services/serving.service';
import * as containerService from '../../../services/container.service';
import { invalidateProducts, SETTINGS_KEYS, updateMe, useContainers, useServingTypes, useSettingsQueryClient } from './data';
import { readableError, servingIcon } from './helpers';
import { CONTAINER_COPY, SERVING_COPY, VolumeManagerSheet } from './VolumeManagerSheet';
import { ErrorLine, RowSkeleton, SettingsSection } from './ui';

function summary(names: string[], max = 4): string {
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')}…`;
}

export function ServicesSection({ index }: { index: number }) {
  const qc = useSettingsQueryClient();
  const user = useAuthStore((s) => s.user);
  const servings = useServingTypes();
  const containers = useContainers();
  const [open, setOpen] = useState<'servings' | 'containers' | 'default' | null>(null);

  const servingList = servings.data;
  const containerList = containers.data;
  const defaultVolume = user?.defaultContainerVolumeCl ?? 70;
  const defaultContainer = containerList?.find((c) => c.volumeCl === defaultVolume);
  const defaultLabel = defaultContainer ? defaultContainer.name : formatVolumeCl(defaultVolume);

  const servingError = servings.error ? readableError(servings.error, 'Les services n’ont pas pu être chargés.').message : null;
  const containerError = containers.error ? readableError(containers.error, 'Les contenants n’ont pas pu être chargés.').message : null;

  const refreshServings = useCallback(() => {
    qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.servingTypes] });
    invalidateProducts(qc);
  }, [qc]);
  const refreshContainers = useCallback(() => qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.containers] }), [qc]);

  const loadingFirst = (servings.isLoading && !servingList) || (containers.isLoading && !containerList);

  return (
    <SettingsSection
      title="Services & contenants"
      index={index}
      footer="Les services servent au prix au verre ; les contenants sont proposés à l’ajout d’un produit."
      testID="settings-services"
    >
      <ListGroup>
        {loadingFirst ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton last />
          </View>
        ) : null}
        {!loadingFirst ? (
          <ListRow
            icon="wine-outline"
            title="Types de service"
            subtitle={servingList ? summary(servingList.map((s) => s.name)) : servingError ?? '…'}
            value={servingList ? String(servingList.length) : undefined}
            onPress={() => setOpen('servings')}
            testID="settings-servings"
          />
        ) : null}
        {!loadingFirst ? (
          <ListRow
            icon="cube-outline"
            title="Contenants"
            subtitle={containerList ? summary(containerList.map((c) => c.name)) : containerError ?? '…'}
            value={containerList ? String(containerList.length) : undefined}
            onPress={() => setOpen('containers')}
            testID="settings-containers"
          />
        ) : null}
        {!loadingFirst ? (
          <ListRow
            icon="star-outline"
            title="Contenant par défaut"
            subtitle="Proposé pour un nouveau produit"
            value={defaultLabel}
            onPress={() => setOpen('default')}
            testID="settings-default-container"
          />
        ) : null}
      </ListGroup>

      <VolumeManagerSheet
        visible={open === 'servings'}
        onClose={() => setOpen(null)}
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
        onClose={() => setOpen(null)}
        copy={CONTAINER_COPY}
        items={containerList}
        loading={containers.isLoading}
        loadError={containerError}
        onRetry={() => containers.refetch()}
        icon={() => 'cube-outline'}
        rowSubtitle={(c) => (c.volumeCl === defaultVolume ? 'Contenant par défaut' : undefined)}
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
        onClose={() => setOpen(null)}
        containers={containerList ?? []}
        value={defaultVolume}
      />
    </SettingsSection>
  );
}

function DefaultContainerSheet({
  visible,
  onClose,
  containers,
  value,
}: {
  visible: boolean;
  onClose: () => void;
  containers: CustomContainer[];
  value: number;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = pending ?? value;

  const choose = async (c: CustomContainer) => {
    if (c.volumeCl === value) {
      setTimeout(onClose, 120);
      return;
    }
    setPending(c.volumeCl);
    setError(null);
    try {
      await updateMe({ defaultContainerVolumeCl: c.volumeCl });
      haptics.success();
      setTimeout(() => {
        onClose();
        setPending(null);
        toast.success(`Contenant par défaut : ${c.name}`);
      }, 120);
    } catch (err) {
      setPending(null);
      haptics.warning();
      setError(readableError(err, 'Le contenant par défaut n’a pas pu être enregistré.').message);
    }
  };

  return (
    <BottomSheet
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
          subtitle={c.name.replace(/\s/g, '') === formatVolumeCl(c.volumeCl).replace(/\s/g, '') ? undefined : formatVolumeCl(c.volumeCl)}
          right="radio"
          selected={c.volumeCl === selected}
          onPress={() => choose(c)}
          divider={i < containers.length - 1}
        />
      ))}
    </BottomSheet>
  );
}
