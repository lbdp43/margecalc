/**
 * « Mon établissement » — business name (edit sheet), login e-mail,
 * auto-entrepreneur switch (TVA 0 %).
 */
import React, { useEffect, useState } from 'react';
import { TVA_RATES } from '@margebar/shared';
import { Avatar, BottomSheet, Button, ListGroup, ListRow, TextField, toast } from '../../../components/ui';
import { palette } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatPercent } from '../../../utils/format';
import { useAuthStore } from '../../../store/auth.store';
import { readableError } from './helpers';
import { updateMe, useMe } from './data';
import { SettingsSection } from './ui';

const NAME_MAX = 80;

export function EstablishmentSection({ index }: { index: number }) {
  const user = useAuthStore((s) => s.user);
  useMe();
  const [nameOpen, setNameOpen] = useState(false);
  const [autoEntrepreneur, setAutoEntrepreneur] = useState(!!user?.isAutoEntrepreneur);

  useEffect(() => {
    setAutoEntrepreneur(!!user?.isAutoEntrepreneur);
  }, [user?.isAutoEntrepreneur]);

  const toggleAutoEntrepreneur = async (value: boolean) => {
    setAutoEntrepreneur(value);
    try {
      await updateMe({ isAutoEntrepreneur: value, defaultTvaRate: value ? 0 : TVA_RATES.RATE_20 });
      toast.success(value ? `Mode auto-entrepreneur activé · TVA ${formatPercent(0, 0)}` : `TVA ${formatPercent(20, 0)} rétablie`);
    } catch (err) {
      setAutoEntrepreneur(!value);
      haptics.warning();
      toast.error(readableError(err, 'Le réglage n’a pas pu être enregistré.').message);
    }
  };

  return (
    <SettingsSection title="Mon établissement" index={index} testID="settings-establishment">
      <ListGroup>
        <ListRow
          leading={<Avatar name={user?.businessName || user?.email} size={40} />}
          title={user?.businessName || 'Ajouter le nom de l’établissement'}
          titleStyle={!user?.businessName ? { color: palette.em700 } : undefined}
          subtitle="Nom de l’établissement"
          onPress={() => setNameOpen(true)}
          accessibilityLabel={`Nom de l’établissement : ${user?.businessName || 'non renseigné'}. Modifier`}
          testID="settings-business-name"
        />
        <ListRow icon="mail-outline" iconTone="neutral" title={user?.email ?? '–'} subtitle="E-mail de connexion" />
        <ListRow
          icon="receipt-outline"
          iconTone="neutral"
          title="Auto-entrepreneur"
          subtitle="Sans TVA : vos prix de vente sont calculés hors TVA"
          switchValue={autoEntrepreneur}
          onSwitchChange={toggleAutoEntrepreneur}
          testID="settings-auto-entrepreneur"
        />
      </ListGroup>
      <BusinessNameSheet visible={nameOpen} onClose={() => setNameOpen(false)} initial={user?.businessName ?? ''} />
    </SettingsSection>
  );
}

function BusinessNameSheet({ visible, onClose, initial }: { visible: boolean; onClose: () => void; initial: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial);
      setError(null);
    }
  }, [visible, initial]);

  const trimmed = name.trim();
  const unchanged = trimmed === initial.trim();

  const save = async () => {
    if (!trimmed) {
      haptics.warning();
      setError('Indiquez le nom de votre établissement.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateMe({ businessName: trimmed });
      haptics.success();
      onClose();
      toast.success('Nom de l’établissement enregistré');
    } catch (err) {
      haptics.warning();
      const e = readableError(err, 'Le nom n’a pas pu être enregistré.');
      setError(e.fields.businessName ?? e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Nom de l’établissement"
      subline="Affiché sur votre tableau de bord."
      footer={<Button title="Enregistrer" icon="checkmark-circle" onPress={save} loading={saving} disabled={unchanged && !!trimmed} />}
      testID="sheet-business-name"
    >
      <TextField
        label="Nom"
        meta={`${name.length} / ${NAME_MAX}`}
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (error) setError(null);
        }}
        placeholder="Ex. : Le Comptoir des Plantes"
        maxLength={NAME_MAX}
        autoFocus
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={save}
        error={error}
        testID="input-business-name"
      />
    </BottomSheet>
  );
}
