/**
 * « Administration » (admins only) — users, user requests, every product,
 * system parameters.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, ListGroup, ListRow, TextField, toast } from '../../../components/ui';
import { AdminUsersSheet, useAdminUsers, usersSummary } from './AdminUsersSheet';
import { AdminTicketsSheet, ticketsSummary, useAdminTickets } from './AdminTicketsSheet';
import { haptics } from '../../../theme/haptics';
import { formatNumber, parseLocaleFloat, toInputString } from '../../../utils/format';
import { useSystemParamsStore } from '../../../store/systemParams.store';
import { ROUTES } from '../../../navigation/routes';
import { readableError } from './helpers';
import { ErrorLine, InfoNote, PillChevron, SettingsSection, Sheet } from './ui';

export function AdminSection({ index, navigation }: { index: number; navigation: { navigate: (name: string, params?: object) => void } }) {
  const users = useAdminUsers(true);
  const tickets = useAdminTickets(true);
  const [open, setOpen] = useState<'users' | 'tickets' | 'params' | null>(null);
  const openTickets = (tickets.data ?? []).filter((t) => t.status === 'open').length;

  return (
    <SettingsSection
      title="Administration"
      index={index}
      right={<Badge variant="brand" icon="shield-checkmark" label="Admin" size="sm" />}
      testID="settings-admin"
    >
      <ListGroup>
        <ListRow
          icon="people-outline"
          title="Utilisateurs"
          subtitle={usersSummary(users.data) ?? (users.error ? 'Touchez pour réessayer' : 'Comptes, connexions, suspension')}
          subtitleLines={1}
          onPress={() => setOpen('users')}
          testID="settings-admin-users"
        />
        <ListRow
          icon="chatbox-ellipses-outline"
          title="Demandes des utilisateurs"
          subtitle={ticketsSummary(tickets.data) ?? 'Bugs, idées et questions'}
          subtitleLines={1}
          right={<PillChevron count={openTickets} tone="bad" />}
          onPress={() => setOpen('tickets')}
          testID="settings-admin-tickets"
        />
        <ListRow
          icon="grid-outline"
          title="Tous les produits"
          subtitle="Catalogue de tous les comptes"
          subtitleLines={1}
          onPress={() => navigation.navigate(ROUTES.adminProducts)}
          testID="settings-admin-products"
        />
        <ListRow
          icon="options-outline"
          title="Paramètres système"
          subtitle="TVA, seuil de la sécu., lien officiel"
          subtitleLines={1}
          onPress={() => setOpen('params')}
          testID="settings-admin-params"
        />
      </ListGroup>
      <AdminUsersSheet visible={open === 'users'} onClose={() => setOpen(null)} />
      <AdminTicketsSheet visible={open === 'tickets'} onClose={() => setOpen(null)} />
      <SystemParamsSheet visible={open === 'params'} onClose={() => setOpen(null)} />
    </SettingsSection>
  );
}

// ─── System params ─────────────────────────────────────────────────────────
type Kind = 'percent' | 'number' | 'year' | 'url';
const FIELDS: { key: string; label: string; kind: Kind; suffix?: string; helper?: string }[] = [
  { key: 'tva_normal', label: 'TVA taux normal', kind: 'percent', suffix: '%', helper: 'Boissons alcoolisées.' },
  { key: 'tva_soft', label: 'TVA boissons non alcoolisées', kind: 'percent', suffix: '%' },
  { key: 'tva_food', label: 'TVA alimentation', kind: 'percent', suffix: '%' },
  { key: 'seuil_cotisation_ss', label: 'Seuil de la cotisation sécurité sociale', kind: 'number', suffix: '% vol.' },
  { key: 'tarif_annee', label: 'Année du barème', kind: 'year' },
  { key: 'lien_reference', label: 'Lien de référence officiel', kind: 'url' },
];

function display(kind: Kind, raw: string | null): string {
  if (raw === null || raw === undefined) return '';
  if (kind === 'percent') {
    const n = parseLocaleFloat(raw);
    return isFinite(n) ? toInputString(n * 100, Number.isInteger(Math.round(n * 10000) / 100) ? 0 : 1) : raw;
  }
  if (kind === 'number') {
    const n = parseLocaleFloat(raw);
    return isFinite(n) ? toInputString(n, Number.isInteger(n) ? 0 : 1) : raw;
  }
  return raw;
}

function SystemParamsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const params = useSystemParamsStore((s) => s.params);
  const known = useMemo(() => FIELDS.filter((f) => params.some((p) => p.key === f.key)), [params]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      useSystemParamsStore.getState().loadParams(true);
      setErrors({});
      setFormError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const d: Record<string, string> = {};
    for (const f of FIELDS) d[f.key] = display(f.kind, params.find((p) => p.key === f.key)?.value ?? null);
    setDraft(d);
  }, [visible, params]);

  const toStored = (f: (typeof FIELDS)[number], v: string): { value?: string; error?: string } => {
    const t = v.trim();
    if (f.kind === 'percent') {
      const n = parseLocaleFloat(t);
      if (!isFinite(n) || n < 0 || n > 100) return { error: 'Indiquez un taux entre 0 et 100 %.' };
      return { value: String(Math.round(n * 100) / 10000) };
    }
    if (f.kind === 'number') {
      const n = parseLocaleFloat(t);
      if (!isFinite(n) || n < 0 || n > 100) return { error: 'Indiquez un degré entre 0 et 100.' };
      return { value: String(n) };
    }
    if (f.kind === 'year') {
      if (!/^\d{4}$/.test(t)) return { error: 'Indiquez une année sur 4 chiffres.' };
      return { value: t };
    }
    if (!/^https:\/\/\S+$/i.test(t)) return { error: 'Indiquez une adresse qui commence par https://' };
    return { value: t };
  };

  const changes = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of known) {
      const current = params.find((p) => p.key === f.key)?.value ?? '';
      if ((draft[f.key] ?? '') !== display(f.kind, current)) out[f.key] = draft[f.key] ?? '';
    }
    return out;
  }, [draft, known, params]);

  const save = async () => {
    const values: Record<string, string> = {};
    const errs: Record<string, string> = {};
    for (const f of known) {
      if (!(f.key in changes)) continue;
      const r = toStored(f, changes[f.key]);
      if (r.error) errs[f.key] = r.error;
      else values[f.key] = r.value!;
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      haptics.warning();
      return;
    }
    setSaving(true);
    setFormError(null);
    const failed = await useSystemParamsStore.getState().updateParams(values);
    setSaving(false);
    if (failed.length) {
      haptics.warning();
      setFormError(readableError(failed[0].error, 'Les paramètres n’ont pas pu être enregistrés.').message);
      return;
    }
    haptics.success();
    onClose();
    toast.success('Paramètres système enregistrés');
  };

  const count = Object.keys(changes).length;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Paramètres système"
      subline="Administrateur · appliqués à tous les comptes"
      snap="full"
      footer={
        <View>
          <ErrorLine message={formError} style={{ marginTop: 0, marginBottom: 10 }} />
          <Button
            title={count ? `Enregistrer (${formatNumber(count)})` : 'Enregistrer'}
            icon="checkmark-circle"
            onPress={save}
            loading={saving}
            disabled={!count}
            testID="params-save"
          />
        </View>
      }
      testID="sheet-system-params"
    >
      <InfoNote icon="information-circle-outline">Les taux de TVA servent au calcul des prix TTC ; le seuil déclenche la cotisation sécurité sociale.</InfoNote>
      <View style={{ gap: 18, marginTop: 18 }}>
        {known.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            value={draft[f.key] ?? ''}
            onChangeText={(t) => {
              setDraft((d) => ({ ...d, [f.key]: t }));
              if (errors[f.key]) setErrors((e) => ({ ...e, [f.key]: '' }));
            }}
            keyboardType={f.kind === 'url' ? 'url' : f.kind === 'year' ? 'number-pad' : 'decimal-pad'}
            autoCapitalize="none"
            autoCorrect={false}
            suffix={f.suffix}
            helper={f.helper}
            error={errors[f.key] || null}
            maxLength={f.kind === 'url' ? 300 : 12}
            testID={`param-${f.key}`}
          />
        ))}
      </View>
    </Sheet>
  );
}
