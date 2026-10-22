/**
 * « Mon établissement » — business name (edit sheet, the login e-mail under
 * it) and the auto-entrepreneur switch (TVA 0 %). Turning the switch on or off
 * also offers to apply the new TVA to the products already saved.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TVA_RATES } from '@margebar/shared';
import { Avatar, Button, ListGroup, ListRow, TextField, dialog, toast } from '../../../components/ui';
import { palette } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatPercent, plural } from '../../../utils/format';
import { useAuthStore } from '../../../store/auth.store';
import { readableError } from './helpers';
import { applyTvaChange, planTvaChange, updateMe, useMe } from './data';
import { ErrorLine, SettingsSection, Sheet, SwitchRow } from './ui';

const NAME_MAX = 80;

export function EstablishmentSection({ index }: { index: number }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  useMe();
  const [nameOpen, setNameOpen] = useState(false);
  const [autoEntrepreneur, setAutoEntrepreneur] = useState(!!user?.isAutoEntrepreneur);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!busyRef.current) setAutoEntrepreneur(!!user?.isAutoEntrepreneur);
  }, [user?.isAutoEntrepreneur]);

  const toggleAutoEntrepreneur = async (value: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setAutoEntrepreneur(value);
    const defaultRate = TVA_RATES.RATE_20;
    try {
      await updateMe({ isAutoEntrepreneur: value, defaultTvaRate: value ? 0 : defaultRate });
    } catch (err) {
      setAutoEntrepreneur(!value);
      haptics.warning();
      toast.error(readableError(err, 'Le réglage n’a pas pu être enregistré.').message);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    try {
      const userId = useAuthStore.getState().user?.id ?? 'anonymous';
      const plan = await planTvaChange(value, defaultRate, userId).catch(() => null);
      const n = plan?.changes.length ?? 0;
      let applied: { updated: number; failed: number; error?: unknown } | null = null;
      if (plan && n > 0) {
        const choice = await dialog.show({
          title: n > 1 ? `Appliquer aux ${n} produits ?` : 'Appliquer au produit existant ?',
          message: value
            ? `Vos produits enregistrés gardent leur TVA actuelle tant que vous ne l’appliquez pas. Avec « Appliquer », ${n > 1 ? 'leurs marges sont recalculées' : 'sa marge est recalculée'} sans TVA.`
            : `${n > 1 ? 'Ces produits sont' : 'Ce produit est'} à ${formatPercent(0, 0)}. Avec « Appliquer », ${n > 1 ? 'ils reprennent' : 'il reprend'} leur TVA d’avant, sinon ${formatPercent(20, 0)} (softs ${formatPercent(10, 0)}).`,
          icon: 'receipt-outline',
          actions: [
            { label: n > 1 ? `Appliquer aux ${n} produits` : 'Appliquer au produit', value: 'apply', style: 'primary' },
            { label: 'Seulement les nouveaux', value: 'new', style: 'cancel' },
          ],
        });
        if (choice === 'apply') applied = await applyTvaChange(qc, plan, userId);
      }
      haptics.success();
      const head = value ? `Auto-entrepreneur · TVA ${formatPercent(0, 0)}` : `TVA ${formatPercent(20, 0)} rétablie`;
      if (applied && applied.failed) {
        toast.error(
          `${plural(applied.failed, 'produit n’a', 'produits n’ont')} pas pu être mis à jour. ${readableError(applied.error, 'Réessayez.').message}`,
        );
      } else if (applied) {
        toast.success(`${head} · ${plural(applied.updated, 'produit mis à jour', 'produits mis à jour')}`);
      } else {
        toast.success(`${head} pour vos nouveaux produits`);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const name = user?.businessName?.trim();
  return (
    <SettingsSection title="Mon établissement" index={index} testID="settings-establishment">
      <ListGroup>
        <ListRow
          leading={<Avatar name={name || user?.email} size={40} />}
          title={name || 'Ajouter le nom de l’établissement'}
          titleStyle={!name ? { color: palette.em700 } : undefined}
          subtitle={user?.email ?? undefined}
          subtitleLines={1}
          onPress={() => setNameOpen(true)}
          accessibilityLabel={`Nom de l’établissement : ${name || 'non renseigné'}, compte ${user?.email ?? ''}. Modifier le nom`}
          testID="settings-business-name"
        />
        <SwitchRow
          icon="receipt-outline"
          iconTone="neutral"
          title="Auto-entrepreneur"
          subtitle={`Franchise de TVA · ${formatPercent(0, 0)}`}
          subtitleLines={1}
          value={autoEntrepreneur}
          onChange={toggleAutoEntrepreneur}
          disabled={busy}
          accessibilityLabel="Auto-entrepreneur, franchise de TVA"
          testID="settings-auto-entrepreneur"
        />
      </ListGroup>
      <BusinessNameSheet visible={nameOpen} onClose={() => setNameOpen(false)} initial={user?.businessName ?? ''} email={user?.email} />
    </SettingsSection>
  );
}

function BusinessNameSheet({ visible, onClose, initial, email }: { visible: boolean; onClose: () => void; initial: string; email?: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initial);
      setError(null);
      setFormError(null);
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
    if (unchanged) {
      onClose();
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
      if (e.fields.businessName || e.status === 400) setError(e.fields.businessName ?? e.message);
      else setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Nom de l’établissement"
      subline={email ? `Affiché sur votre tableau de bord · ${email}` : 'Affiché sur votre tableau de bord.'}
      footer={<Button title="Enregistrer" icon="checkmark-circle" onPress={save} loading={saving} disabled={unchanged && !!trimmed} testID="business-name-save" />}
      testID="sheet-business-name"
    >
      <TextField
        label="Nom"
        meta={`${name.length} / ${NAME_MAX}`}
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (error) setError(null);
          if (formError) setFormError(null);
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
      <ErrorLine message={formError} />
    </Sheet>
  );
}
