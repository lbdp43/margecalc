/**
 * « Modifier la ligne » / « Ajouter une ligne »: every field of an invoice
 * line in one sheet — name, category chips, quantity + contenance, purchase
 * price HT, selling price TTC (left empty → « calculé ×4 », shown live).
 * « Valider » checks the line; errors outline their field (also the ones the
 * backend returned for this line after an import).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Category } from '@margebar/shared';
import { BottomSheet, Button, ChipRow, TextField } from '../../components/ui';
import { haptics } from '../../theme/haptics';
import { palette, type } from '../../theme';
import { formatEuro, parseLocaleFloat, toInputString } from '../../utils/format';
import {
  containerLabel,
  derivedPrice,
  doseLabel,
  hasErrors,
  validateLine,
  type InvoiceLine,
  type LineErrors,
  type PricingContext,
} from './model';

export interface LineEditSheetProps {
  line: InvoiceLine | null;
  /** True for a line the user is adding by hand (sheet title + button). */
  isNew?: boolean;
  /** Show the validation errors at once (Importer pressed with an incomplete line). */
  showErrors?: boolean;
  categories: Category[];
  ctx: PricingContext;
  onSubmit: (line: InvoiceLine) => void;
  onClose: () => void;
}

interface Draft {
  name: string;
  categoryId: string | null;
  categorySlug: string;
  quantity: string;
  container: string;
  purchase: string;
  selling: string;
}

const DRAFT_KEY: Record<keyof LineErrors, keyof Draft> = {
  name: 'name',
  category: 'categoryId',
  quantity: 'quantity',
  container: 'container',
  purchase: 'purchase',
  selling: 'selling',
};

const numOrNull = (s: string): number | null => {
  const n = parseLocaleFloat(s);
  return Number.isFinite(n) ? n : null;
};

function toDraft(line: InvoiceLine): Draft {
  return {
    name: line.name,
    categoryId: line.categoryId,
    categorySlug: line.categorySlug,
    quantity: line.quantity !== null ? toInputString(line.quantity, line.quantity % 1 ? 1 : 0) : '',
    container: line.containerVolumeCl !== null ? toInputString(line.containerVolumeCl, line.containerVolumeCl % 1 ? 1 : 0) : '',
    purchase: line.purchasePriceHT !== null ? toInputString(line.purchasePriceHT, 2) : '',
    selling: line.sellingPriceTTC !== null ? toInputString(line.sellingPriceTTC, 2) : '',
  };
}

function applyDraft(line: InvoiceLine, d: Draft): InvoiceLine {
  const raw = (s: string) => (s.trim() === '' ? null : numOrNull(s) ?? NaN);
  return {
    ...line,
    name: d.name,
    categoryId: d.categoryId,
    categorySlug: d.categorySlug,
    quantity: raw(d.quantity),
    containerVolumeCl: raw(d.container),
    purchasePriceHT: raw(d.purchase),
    sellingPriceTTC: raw(d.selling),
  };
}

export function LineEditSheet({ line, isNew, showErrors, categories, ctx, onSubmit, onClose }: LineEditSheetProps) {
  const [draft, setDraft] = useState<Draft | null>(line ? toDraft(line) : null);
  const [touched, setTouched] = useState(false);
  const [held, setHeld] = useState<InvoiceLine | null>(line);

  // Keep the last line while the sheet animates out.
  useEffect(() => {
    if (line) {
      setHeld(line);
      setDraft(toDraft(line));
      setTouched(!!showErrors);
    }
  }, [line, showErrors]);

  const current = held && draft ? applyDraft(held, draft) : null;
  const errors: LineErrors = useMemo(() => {
    if (!current) return {};
    const e = validateLine(current);
    // A number that does not parse (« 12,3,4 ») is NaN: say so on its field.
    if (Number.isNaN(current.quantity as number)) e.quantity = 'Quantité invalide.';
    if (Number.isNaN(current.containerVolumeCl as number)) e.container = 'Contenance invalide.';
    if (Number.isNaN(current.purchasePriceHT as number)) e.purchase = 'Prix d’achat invalide.';
    if (Number.isNaN(current.sellingPriceTTC as number)) e.selling = 'Prix de vente invalide.';
    return e;
  }, [current]);

  // The backend's error for this line stays on its field until that field is changed.
  const original = useMemo(() => (held ? toDraft(held) : null), [held]);
  const serverError = (f: keyof LineErrors): string | undefined => {
    const err = held?.importError;
    if (!err || err.field !== f || !draft || !original) return undefined;
    const key = DRAFT_KEY[f];
    return draft[key] === original[key] ? err.message : undefined;
  };
  const fieldError = (f: keyof LineErrors) => (touched ? errors[f] : undefined) ?? serverError(f);

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const chipItems = useMemo(() => categories.map((c) => ({ key: c.id, label: c.name })), [categories]);
  const selectedKey = draft?.categoryId ?? categories.find((c) => c.slug === draft?.categorySlug)?.id ?? null;

  const derived = current ? derivedPrice(current, ctx) : 0;
  const sellingEmpty = !draft || draft.selling.trim() === '';
  const contLabel = current && current.containerVolumeCl && current.containerVolumeCl >= 100 ? containerLabel(current.containerVolumeCl, current.categorySlug) : null;

  const submit = () => {
    if (!current || !held) return;
    setTouched(true);
    if (hasErrors(errors)) {
      haptics.warning();
      return;
    }
    const clean: InvoiceLine = {
      ...current,
      name: current.name.trim(),
      importError: null,
      selected: isNew ? true : held.selected || !!held.importError,
    };
    onSubmit(clean);
  };

  const sellingHelper =
    derived > 0
      ? sellingEmpty
        ? `Laissé vide : calculé ×4, soit ${formatEuro(derived)} TTC (${current ? doseLabel(current, ctx) : ''}).`
        : `Le calcul ×4 donnerait ${formatEuro(derived)} TTC. Videz le champ pour l’utiliser.`
      : 'Laissé vide : calculé ×4 dès que le prix d’achat est indiqué.';

  return (
    <BottomSheet
      visible={!!line}
      onClose={onClose}
      title={isNew ? 'Ajouter une ligne' : 'Modifier la ligne'}
      subline={isNew ? 'Un produit oublié par la lecture' : held?.source === 'ocr' ? 'Lue sur la facture · vérifiez les valeurs' : 'Ajoutée à la main'}
      snap="full"
      testID="invoice-line-sheet"
      footer={<Button title={isNew ? 'Ajouter la ligne' : 'Valider'} icon="checkmark" onPress={submit} testID="invoice-line-submit" />}
    >
      {draft ? (
        <View style={styles.form}>
          <TextField
            label="Nom du produit"
            value={draft.name}
            onChangeText={(t) => set({ name: t })}
            placeholder="Ex. Jameson Irish Whiskey"
            autoCapitalize="sentences"
            error={fieldError('name')}
            testID="invoice-field-name"
          />

          <View>
            <Text style={styles.label}>Catégorie</Text>
            <ChipRow
              items={chipItems}
              selectedKey={selectedKey}
              onSelect={(k) => {
                const c = categories.find((x) => x.id === k);
                if (c) set({ categoryId: c.id, categorySlug: c.slug });
              }}
              fade="surface"
              style={styles.chips}
            />
            {fieldError('category') ? <Text style={styles.error}>{fieldError('category')}</Text> : null}
          </View>

          <View style={styles.row}>
            <TextField
              label="Quantité"
              value={draft.quantity}
              onChangeText={(t) => set({ quantity: t })}
              keyboardType="decimal-pad"
              placeholder="1"
              error={fieldError('quantity')}
              containerStyle={styles.flex}
              testID="invoice-field-quantity"
            />
            <TextField
              label="Contenance"
              value={draft.container}
              onChangeText={(t) => set({ container: t })}
              onBlur={() => {
                const n = numOrNull(draft.container);
                if (n !== null && n > 0) set({ container: toInputString(n, n % 1 ? 1 : 0) });
              }}
              keyboardType="decimal-pad"
              placeholder={String(ctx.defaultContainerCl || 70)}
              suffix="cl"
              helper={contLabel ? `soit ${contLabel}` : undefined}
              error={fieldError('container')}
              containerStyle={styles.flex}
              testID="invoice-field-container"
            />
          </View>

          <TextField
            label="Prix d’achat HT"
            meta="à l’unité"
            value={draft.purchase}
            onChangeText={(t) => set({ purchase: t })}
            onBlur={() => {
              const n = numOrNull(draft.purchase);
              if (n !== null && n > 0) set({ purchase: toInputString(n, 2) });
            }}
            keyboardType="decimal-pad"
            placeholder="0,00"
            suffix="€"
            helper="Prix d’une bouteille, canette ou fût, hors TVA"
            error={fieldError('purchase')}
            testID="invoice-field-purchase"
          />

          <TextField
            label="Prix de vente TTC"
            meta={current ? doseLabel(current, ctx) : undefined}
            value={draft.selling}
            onChangeText={(t) => set({ selling: t })}
            onBlur={() => {
              const n = numOrNull(draft.selling);
              if (n !== null && n > 0) set({ selling: toInputString(n, 2) });
            }}
            keyboardType="decimal-pad"
            placeholder={derived > 0 ? toInputString(derived, 2) : '0,00'}
            suffix="€"
            helper={sellingHelper}
            error={fieldError('selling')}
            testID="invoice-field-selling"
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

export interface SupplierSheetProps {
  visible: boolean;
  supplier: string;
  dateLabel: string | null;
  onSubmit: (supplier: string) => void;
  onClose: () => void;
}

export function SupplierSheet({ visible, supplier, dateLabel, onSubmit, onClose }: SupplierSheetProps) {
  const [value, setValue] = useState(supplier);
  useEffect(() => {
    if (visible) setValue(supplier);
  }, [visible, supplier]);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Fournisseur"
      subline={dateLabel ? `Facture du ${dateLabel}` : 'Enregistré sur chaque produit importé'}
      testID="invoice-supplier-sheet"
      footer={<Button title="Valider" icon="checkmark" onPress={() => onSubmit(value.trim())} testID="invoice-supplier-submit" />}
    >
      <TextField
        label="Nom du fournisseur"
        value={value}
        onChangeText={setValue}
        placeholder="Ex. France Boissons"
        autoCapitalize="words"
        helper="Il figurera sur la fiche de chaque produit importé."
        testID="invoice-field-supplier"
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18, paddingBottom: 8 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  label: { ...type.label, color: palette.text2, marginBottom: 8 },
  chips: { marginTop: 0 },
  error: { ...type.footnote, color: palette.bad, marginTop: 8 },
});
