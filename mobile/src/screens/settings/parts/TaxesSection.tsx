/**
 * « Taxes & droits » — the 13 fiscal rates (official barème of the customs).
 * Read-only for users (with the official source), editable for admins
 * (save + « Rétablir les valeurs officielles »).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Rate } from '@margebar/shared';
import {
  Badge,
  BottomSheet,
  Button,
  ListGroup,
  ListRow,
  SectionHeader,
  TextField,
  dialog,
  fiscalRateLabel,
  groupFiscalRates,
  toast,
} from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { formatDegree, formatRate, parseLocaleFloat, plural, toInputString } from '../../../utils/format';
import { useRatesStore } from '../../../store/rates.store';
import { useSystemParamsStore } from '../../../store/systemParams.store';
import { formatDateTime, OFFICIAL_RATES_URL, openExternal, readableError } from './helpers';
import { ErrorLine, InfoNote, SettingsSection } from './ui';

const UNIT: Record<string, string> = { 'euro/hl': 'hl', 'euro/hl_degree': 'hl/degré', 'euro/hlap': 'hl AP' };
const unitOf = (u: string | null | undefined) => (u ? UNIT[u] ?? u.replace(/^euro\//, '') : '');

export function cotisationLabel(rate: Pick<Rate, 'cotisationRate' | 'cotisationUnit'>): string {
  return formatRate(rate.cotisationRate, unitOf(rate.cotisationUnit));
}

export function useOfficialLink(): string {
  return useSystemParamsStore((s) => s.params.find((p) => p.key === 'lien_reference')?.value) || OFFICIAL_RATES_URL;
}

export function useRatesYear(): string {
  return useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value) || '2026';
}

export async function openOfficialSource(url: string) {
  const ok = await openExternal(url);
  if (!ok) toast.error('Le lien n’a pas pu s’ouvrir. Réessayez.');
}

export function TaxesSection({ index, isAdmin }: { index: number; isAdmin: boolean }) {
  const rates = useRatesStore((s) => s.rates);
  const lastFetched = useRatesStore((s) => s.lastFetched);
  const year = useRatesYear();
  const link = useOfficialLink();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await useRatesStore.getState().refresh();
      await useSystemParamsStore.getState().loadParams(true);
      haptics.success();
      toast.success('Tarifs à jour · Barème officiel des douanes');
    } catch (err) {
      haptics.warning();
      toast.error(readableError(err, 'Les tarifs n’ont pas pu être actualisés.').message);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SettingsSection
      title="Taxes & droits"
      index={index}
      right={<Badge variant="brand" icon="shield-checkmark" label={`Tarifs ${year}`} size="sm" />}
      footer={
        isAdmin
          ? 'Administrateur : vos modifications s’appliquent à tous les comptes.'
          : 'Barème officiel des douanes, tenu à jour pour vous.'
      }
      testID="settings-taxes"
    >
      <ListGroup>
        <ListRow
          icon="shield-checkmark-outline"
          title={`Barème des droits ${year}`}
          subtitle={`${plural(rates.length, 'catégorie fiscale', 'catégories fiscales')} · accise et cotisation sécurité sociale`}
          value={isAdmin ? 'Modifier' : undefined}
          onPress={() => setOpen(true)}
          testID="settings-rates"
        />
        <ListRow
          icon="open-outline"
          title="Source officielle"
          subtitle="service-public.fr · Taxes sur les boissons alcoolisées"
          onPress={() => openOfficialSource(link)}
          right="none"
          testID="settings-official-link"
        />
        <ListRow
          icon="refresh-outline"
          iconTone="neutral"
          title={refreshing ? 'Actualisation…' : 'Actualiser les tarifs'}
          subtitle={lastFetched ? `Dernière vérification : ${formatDateTime(lastFetched)}` : 'Vérifier le barème en vigueur'}
          onPress={refreshing ? undefined : refresh}
          right="none"
          testID="settings-refresh-rates"
        />
      </ListGroup>
      {isAdmin ? (
        <RatesEditorSheet visible={open} onClose={() => setOpen(false)} rates={rates} year={year} />
      ) : (
        <RatesSheet visible={open} onClose={() => setOpen(false)} rates={rates} year={year} link={link} />
      )}
    </SettingsSection>
  );
}

// ─── Read-only barème ──────────────────────────────────────────────────────
function RatesSheet({ visible, onClose, rates, year, link }: { visible: boolean; onClose: () => void; rates: Rate[]; year: string; link: string }) {
  const groups = useMemo(() => groupFiscalRates(rates), [rates]);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Barème des droits ${year}`}
      subline={`${plural(rates.length, 'catégorie', 'catégories')} · barème officiel des douanes`}
      snap="full"
      contentPadding={8}
      footer={<Button title="Consulter la source officielle" variant="secondary" icon="open-outline" onPress={() => openOfficialSource(link)} testID="rates-official-link" />}
      testID="sheet-rates"
    >
      <InfoNote icon="shield-checkmark-outline" tone="brand" style={{ marginHorizontal: 12, marginBottom: 8 }}>
        Droits d’accise par catégorie fiscale. La cotisation sécurité sociale s’ajoute au-delà de {formatDegree(18)}
      </InfoNote>
      {groups.map((g) => (
        <View key={g.key}>
          <SectionHeader variant="caps" title={g.title} style={styles.groupHeader} />
          {g.rates.map((r, i) => (
            <ListRow
              key={r.slug}
              title={r.label}
              subtitle={r.examples ?? undefined}
              detail={`Accise ${fiscalRateLabel(r)}${r.cotisationCond && r.cotisationRate > 0 ? ` · Sécu. ${cotisationLabel(r)}` : ''}`}
              divider={i < g.rates.length - 1}
            />
          ))}
        </View>
      ))}
    </BottomSheet>
  );
}

// ─── Admin editor ──────────────────────────────────────────────────────────
type Draft = Record<string, { accise: string; cotisation: string }>;

function toDraft(rates: Rate[]): Draft {
  const d: Draft = {};
  for (const r of rates) d[r.slug] = { accise: toInputString(r.acciseRate, 2), cotisation: toInputString(r.cotisationRate, 2) };
  return d;
}

function RatesEditorSheet({ visible, onClose, rates, year }: { visible: boolean; onClose: () => void; rates: Rate[]; year: string }) {
  const groups = useMemo(() => groupFiscalRates(rates), [rates]);
  const [draft, setDraft] = useState<Draft>(() => toDraft(rates));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);

  useEffect(() => {
    if (visible) {
      setDraft(toDraft(useRatesStore.getState().rates));
      setErrors({});
      setFormError(null);
    }
  }, [visible]);

  const changes = useMemo(() => {
    const out: { slug: string; acciseRate?: number; cotisationRate?: number }[] = [];
    for (const r of rates) {
      const d = draft[r.slug];
      if (!d) continue;
      const a = parseLocaleFloat(d.accise);
      const c = parseLocaleFloat(d.cotisation);
      const change: { slug: string; acciseRate?: number; cotisationRate?: number } = { slug: r.slug };
      if (Math.abs(a - r.acciseRate) > 1e-9 || !isFinite(a)) change.acciseRate = a;
      if (r.cotisationCond && (Math.abs(c - r.cotisationRate) > 1e-9 || !isFinite(c))) change.cotisationRate = c;
      if (change.acciseRate !== undefined || change.cotisationRate !== undefined) out.push(change);
    }
    return out;
  }, [draft, rates]);

  const setField = (slug: string, field: 'accise' | 'cotisation', value: string) => {
    setDraft((prev) => ({ ...prev, [slug]: { ...prev[slug], [field]: value } }));
    const key = `${slug}.${field}`;
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
    if (formError) setFormError(null);
  };

  const save = async () => {
    const next: Record<string, string> = {};
    for (const c of changes) {
      if (c.acciseRate !== undefined && (!isFinite(c.acciseRate) || c.acciseRate < 0)) next[`${c.slug}.accise`] = 'Indiquez un taux positif.';
      if (c.cotisationRate !== undefined && (!isFinite(c.cotisationRate) || c.cotisationRate < 0)) next[`${c.slug}.cotisation`] = 'Indiquez un taux positif.';
    }
    if (Object.keys(next).length) {
      haptics.warning();
      setErrors(next);
      setFormError(`${plural(Object.keys(next).length, 'champ', 'champs')} à corriger.`);
      return;
    }
    setBusy('save');
    const failed = await useRatesStore.getState().saveRates(changes);
    setBusy(null);
    if (failed.length) {
      haptics.warning();
      const msg = readableError(failed[0].error, 'Les tarifs n’ont pas pu être enregistrés.').message;
      const errs: Record<string, string> = {};
      for (const f of failed) errs[`${f.slug}.accise`] = readableError(f.error, 'Non enregistré.').message;
      setErrors(errs);
      setFormError(failed.length === changes.length ? msg : `${plural(failed.length, 'tarif', 'tarifs')} non enregistré${failed.length > 1 ? 's' : ''} : ${msg}`);
      return;
    }
    haptics.success();
    onClose();
    toast.success(`${plural(changes.length, 'tarif enregistré', 'tarifs enregistrés')} · appliqué${changes.length > 1 ? 's' : ''} à tous les comptes`);
  };

  const reset = async () => {
    const ok = await dialog.confirm({
      title: 'Rétablir les valeurs officielles ?',
      message: `Les ${rates.length} tarifs reprennent les valeurs du barème officiel ${year} des douanes, pour tous les comptes. Vos modifications seront remplacées.`,
      confirmLabel: 'Rétablir',
      destructive: true,
      icon: 'refresh-outline',
    });
    if (!ok) return;
    setBusy('reset');
    try {
      await useRatesStore.getState().resetDefaults();
      await useSystemParamsStore.getState().loadParams(true);
      haptics.success();
      onClose();
      toast.success('Tarifs à jour · Barème officiel des douanes');
    } catch (err) {
      haptics.warning();
      setFormError(readableError(err, 'Les valeurs officielles n’ont pas pu être rétablies.').message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Barème des droits ${year}`}
      subline="Administrateur · appliqué à tous les comptes"
      snap="full"
      footer={
        <View style={{ gap: 4 }}>
          <ErrorLine message={formError} style={{ marginTop: 0, marginBottom: 8 }} />
          <Button
            title={changes.length ? `Enregistrer ${plural(changes.length, 'modification')}` : 'Enregistrer'}
            icon="checkmark-circle"
            onPress={save}
            loading={busy === 'save'}
            disabled={!changes.length || busy === 'reset'}
            testID="rates-save"
          />
          <Button
            title="Rétablir les valeurs officielles"
            variant="text"
            size="sm"
            icon="refresh-outline"
            onPress={reset}
            loading={busy === 'reset'}
            disabled={busy === 'save'}
            textStyle={{ color: palette.text2 }}
            testID="rates-reset"
          />
        </View>
      }
      testID="sheet-rates-editor"
    >
      <InfoNote icon="create-outline" tone="brand">
        Accise par catégorie fiscale ; la cotisation sécurité sociale (« Sécu. ») s’applique au-delà de {formatDegree(18)}
      </InfoNote>
      {groups.map((g) => (
        <View key={g.key}>
          <SectionHeader variant="caps" title={g.title} style={styles.groupHeaderEditor} />
          {g.rates.map((r) => {
            const d = draft[r.slug] ?? { accise: '', cotisation: '' };
            const hasSecu = !!r.cotisationCond;
            return (
              <View key={r.slug} style={styles.rateCard} testID={`rate-${r.slug}`}>
                <Text style={styles.rateTitle}>{r.label}</Text>
                <View style={styles.rateFields}>
                  <TextField
                    label="Accise"
                    meta={`€/${unitOf(r.acciseUnit)}`}
                    value={d.accise}
                    onChangeText={(t) => setField(r.slug, 'accise', t)}
                    onBlur={() => {
                      const n = parseLocaleFloat(d.accise);
                      if (isFinite(n)) setField(r.slug, 'accise', toInputString(n, 2));
                    }}
                    keyboardType="decimal-pad"
                    height={48}
                    error={errors[`${r.slug}.accise`] || null}
                    containerStyle={styles.field}
                    accessibilityLabel={`Accise ${r.label}`}
                    testID={`rate-${r.slug}-accise`}
                  />
                  {hasSecu ? (
                    <TextField
                      label="Sécu."
                      meta={`€/${unitOf(r.cotisationUnit)}`}
                      value={d.cotisation}
                      onChangeText={(t) => setField(r.slug, 'cotisation', t)}
                      onBlur={() => {
                        const n = parseLocaleFloat(d.cotisation);
                        if (isFinite(n)) setField(r.slug, 'cotisation', toInputString(n, 2));
                      }}
                      keyboardType="decimal-pad"
                      height={48}
                      error={errors[`${r.slug}.cotisation`] || null}
                      containerStyle={styles.field}
                      accessibilityLabel={`Cotisation sécurité sociale ${r.label}`}
                      testID={`rate-${r.slug}-cotisation`}
                    />
                  ) : (
                    <View style={styles.field} />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  groupHeader: { marginTop: 14, paddingHorizontal: 12 },
  groupHeaderEditor: { marginTop: 16, marginBottom: 4 },
  rateCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  rateTitle: { ...type.headline, color: palette.ink },
  rateFields: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, minWidth: 0 },
});
