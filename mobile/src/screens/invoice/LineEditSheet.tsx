/**
 * « Modifier la ligne » / « Ajouter une ligne »: every field of an invoice
 * line in one sheet — name, category chips, contenance + degré, quantité +
 * prix d’achat HT, prix de vente TTC (left empty → « calculé ×4 », shown live)
 * with the margin it gives. A line that matches a product already tracked
 * keeps that product’s selling price: the field is locked and says so.
 * « Valider » checks the line; errors outline their field (also the ones the
 * backend returned for this line after an import).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@margebar/shared';
import { Badge, BottomSheet, Button, ChipRow, TextField } from '../../components/ui';
import { haptics } from '../../theme/haptics';
import { marginColors, palette, type } from '../../theme';
import { NBSP, formatEuro, formatPercent, toInputString } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';
import {
  FALLBACK_CATEGORIES,
  containerLabel,
  derivedPrice,
  doseLabel,
  hasErrors,
  parseStrictNumber,
  priceDecimals,
  validateLine,
  type InvoiceLine,
  type LineErrors,
  type LinePreview,
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
  /** What the line (as edited) will do: the product it updates, its price and margin after the import. */
  resolve: (line: InvoiceLine) => LinePreview;
  onSubmit: (line: InvoiceLine) => void;
  onClose: () => void;
}

interface Draft {
  name: string;
  categoryId: string | null;
  categorySlug: string;
  quantity: string;
  container: string;
  degree: string;
  purchase: string;
  selling: string;
}

const DRAFT_KEY: Record<keyof LineErrors, keyof Draft> = {
  name: 'name',
  category: 'categoryId',
  quantity: 'quantity',
  container: 'container',
  degree: 'degree',
  purchase: 'purchase',
  selling: 'selling',
};

/** null when empty; NaN when it does not parse (« 12,3,4 »): never a silently different number. */
const parse = (s: string): number | null => (s.trim() === '' ? null : parseStrictNumber(s));
const finite = (n: number | null): n is number => n !== null && Number.isFinite(n);
const ALCOHOLIC_SLUGS = new Set(['spiritueux', 'vins', 'bieres']);

/** « 17,90 », or « 0,467 » for a per-bottle price from a pack (never rounds it away). */
const priceInput = (n: number) => toInputString(n, priceDecimals(n));
const plainInput = (n: number) => toInputString(n, n % 1 ? (Math.abs(n * 10 - Math.round(n * 10)) > 1e-6 ? 2 : 1) : 0);

function toDraft(line: InvoiceLine): Draft {
  return {
    name: line.name,
    categoryId: line.categoryId,
    categorySlug: line.categorySlug,
    quantity: line.quantity !== null && Number.isFinite(line.quantity) ? plainInput(line.quantity) : '',
    container: line.containerVolumeCl !== null && Number.isFinite(line.containerVolumeCl) ? plainInput(line.containerVolumeCl) : '',
    degree: line.alcoholDegree !== null && Number.isFinite(line.alcoholDegree) && line.alcoholDegree > 0 ? plainInput(line.alcoholDegree) : '',
    purchase: line.purchasePriceHT !== null && Number.isFinite(line.purchasePriceHT) ? priceInput(line.purchasePriceHT) : '',
    selling: line.sellingPriceTTC !== null && Number.isFinite(line.sellingPriceTTC) ? priceInput(line.sellingPriceTTC) : '',
  };
}

function applyDraft(line: InvoiceLine, d: Draft): InvoiceLine {
  return {
    ...line,
    name: d.name,
    categoryId: d.categoryId,
    categorySlug: d.categorySlug,
    quantity: parse(d.quantity),
    containerVolumeCl: parse(d.container),
    alcoholDegree: parse(d.degree),
    purchasePriceHT: parse(d.purchase),
    sellingPriceTTC: parse(d.selling),
  };
}

export function LineEditSheet({ line, isNew, showErrors, categories, ctx, resolve, onSubmit, onClose }: LineEditSheetProps) {
  const [draft, setDraft] = useState<Draft | null>(line ? toDraft(line) : null);
  const [touched, setTouched] = useState(false);
  const [held, setHeld] = useState<InvoiceLine | null>(line);
  const thresholds = useMarginThresholds();

  // Keep the last line while the sheet animates out.
  useEffect(() => {
    if (line) {
      setHeld(line);
      setDraft(toDraft(line));
      setTouched(!!showErrors);
    }
  }, [line, showErrors]);

  const current = held && draft ? applyDraft(held, draft) : null;
  const preview = useMemo(() => (current ? resolve(current) : null), [current, resolve]);
  // Only a confirmed update keeps the product's selling price (an undecided look-alike may still become a new product).
  const updating = preview?.target.kind === 'update' ? preview.target : null;
  const match = updating ? (preview?.existing ?? null) : null;
  // « Same product as line N »: line N creates it at its own price, this line only changes the purchase price.
  const sameAs = preview?.target.kind === 'sameAs' ? preview.target : null;
  const keepsPrice = !!updating || !!sameAs;
  const lineN = sameAs ? sameAs.lineIndex + 1 : 0;

  const errors: LineErrors = useMemo(() => {
    if (!current) return {};
    const e = validateLine(current);
    // A number that does not parse (« 12,3,4 ») is NaN: say so on its field.
    if (Number.isNaN(current.quantity as number)) e.quantity = 'Quantité invalide : un seul nombre, par exemple 6.';
    if (Number.isNaN(current.containerVolumeCl as number)) e.container = 'Contenance invalide : un seul nombre, en cl.';
    if (Number.isNaN(current.alcoholDegree as number)) e.degree = 'Degré invalide : un seul nombre, par exemple 40 ou 12,5.';
    if (Number.isNaN(current.purchasePriceHT as number)) e.purchase = 'Prix d’achat invalide : un seul nombre, par exemple 17,90.';
    if (Number.isNaN(current.sellingPriceTTC as number)) e.selling = 'Prix de vente invalide : un seul nombre, par exemple 6,50.';
    // The selling price of a product already tracked (or created by line N) is kept: nothing to check.
    if (keepsPrice) delete e.selling;
    return e;
  }, [current, keepsPrice]);

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
  /** Reformat a number field on blur — only when it parses, so a typo stays visible. */
  const tidy = (key: keyof Draft, fmt: (n: number) => string) => () => {
    if (!draft) return;
    const n = parse(draft[key] as string);
    if (finite(n) && n > 0) set({ [key]: fmt(n) } as Partial<Draft>);
  };

  const offline = categories.length === 0;
  const chipItems = useMemo(
    () => (offline ? FALLBACK_CATEGORIES.map((c) => ({ key: c.slug, label: c.name })) : categories.map((c) => ({ key: c.id, label: c.name }))),
    [categories, offline],
  );
  const selectedKey = offline
    ? draft?.categorySlug ?? null
    : draft?.categoryId ?? categories.find((c) => c.slug === draft?.categorySlug)?.id ?? null;

  const derived = current ? derivedPrice(current, ctx) : 0;
  const sellingEmpty = !draft || draft.selling.trim() === '';
  const contLabel = current && finite(current.containerVolumeCl) && current.containerVolumeCl >= 100 ? containerLabel(current.containerVolumeCl, current.categorySlug) : null;

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
      // A product already tracked keeps its price: drop a price typed before the match.
      sellingPriceTTC: updating ? null : current.sellingPriceTTC,
      alcoholDegree: current.alcoholDegree && current.alcoholDegree > 0 ? current.alcoholDegree : null,
      importError: null,
      selected: isNew ? true : held.selected || !!held.importError,
    };
    onSubmit(clean);
  };

  const sellingHelper = updating
    ? `Ce produit existe déjà : seul son prix d’achat sera mis à jour. Son prix de vente actuel est conservé.`
    : sameAs
      ? `La ligne${NBSP}${lineN} crée ce produit à ce prix : cette ligne ne met à jour que son prix d’achat.`
      : derived > 0
      ? sellingEmpty
        ? `Laissé vide : calculé ×4, soit ${formatEuro(derived)} TTC (${current ? doseLabel(current, ctx) : ''}).`
        : `Le calcul ×4 donnerait ${formatEuro(derived)} TTC. Videz le champ pour l’utiliser.`
      : 'Laissé vide : calculé ×4 dès que le prix d’achat est indiqué.';

  const margin = preview?.marginPercent ?? null;
  const zone = margin !== null ? getMarginZone(margin, thresholds) : null;
  const sellingError = keepsPrice ? undefined : fieldError('selling');

  // Half-width fields: the message runs full width under their row.
  const sizeError = fieldError('container') ?? fieldError('degree');
  const needsDegree = !!draft && ALCOHOLIC_SLUGS.has(draft.categorySlug) && draft.degree.trim() === '';
  const sizeHelper = [contLabel ? `Soit ${contLabel}.` : null, needsDegree ? 'Indiquez le degré : il sert au calcul des droits d’accise.' : null]
    .filter(Boolean)
    .join(' ');
  const buyError = fieldError('quantity') ?? fieldError('purchase');

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
          <View>
            <TextField
              label="Nom du produit"
              value={draft.name}
              onChangeText={(t) => set({ name: t })}
              placeholder="Ex. Jameson Irish Whiskey"
              autoCapitalize="sentences"
              error={fieldError('name')}
              testID="invoice-field-name"
            />
            {updating ? (
              <View style={styles.matchRow} testID="invoice-field-match">
                <Badge variant="brand" icon="sync-outline" label="Déjà suivi" size="sm" />
                <Text style={styles.matchText}>{`Met à jour «${NBSP}${updating.name}${NBSP}» : seul son prix d’achat change.`}</Text>
              </View>
            ) : sameAs ? (
              <View style={styles.matchRow} testID="invoice-field-match">
                <Badge variant="neutral" icon="copy-outline" label="Même produit" size="sm" />
                <Text style={styles.matchText}>{`Créé par la ligne${NBSP}${lineN} : seul son prix d’achat change ici.`}</Text>
              </View>
            ) : preview?.target.kind === 'decide' ? (
              <View style={styles.matchRow} testID="invoice-field-match">
                <Badge zone="orange" icon="git-compare-outline" label="À confirmer" size="sm" />
                <Text style={styles.matchText}>{`Ressemble à «${NBSP}${preview.target.name}${NBSP}» : confirmez le lien sur la ligne (Lier ou Créer un nouveau).`}</Text>
              </View>
            ) : null}
          </View>

          <View>
            <Text style={styles.label}>Catégorie</Text>
            <ChipRow
              items={chipItems}
              selectedKey={selectedKey}
              onSelect={(k) => {
                if (offline) {
                  set({ categoryId: null, categorySlug: k });
                  return;
                }
                const c = categories.find((x) => x.id === k);
                if (c) set({ categoryId: c.id, categorySlug: c.slug });
              }}
              fade="surface"
              style={styles.chips}
            />
            {offline ? <Text style={styles.helper}>Catégories indisponibles pour le moment : les catégories de base sont proposées.</Text> : null}
            {fieldError('category') ? <RowError text={fieldError('category')!} /> : null}
          </View>

          <View>
            <View style={styles.row}>
              <TextField
                label="Contenance"
                value={draft.container}
                onChangeText={(t) => set({ container: t })}
                onBlur={tidy('container', plainInput)}
                keyboardType="decimal-pad"
                placeholder={String(ctx.defaultContainerCl || 70)}
                suffix="cl"
                fieldStyle={fieldError('container') ? styles.fieldBad : undefined}
                containerStyle={styles.flex}
                testID="invoice-field-container"
              />
              <TextField
                label="Degré d’alcool"
                value={draft.degree}
                onChangeText={(t) => set({ degree: t })}
                onBlur={tidy('degree', plainInput)}
                keyboardType="decimal-pad"
                placeholder="0"
                suffix="% vol."
                fieldStyle={fieldError('degree') ? styles.fieldBad : undefined}
                containerStyle={styles.flex}
                testID="invoice-field-degree"
              />
            </View>
            {sizeError ? (
              <RowError text={sizeError} />
            ) : sizeHelper ? (
              <Text style={styles.helper}>{sizeHelper}</Text>
            ) : null}
          </View>

          <View>
            <View style={styles.row}>
              <TextField
                label="Quantité"
                value={draft.quantity}
                onChangeText={(t) => set({ quantity: t })}
                onBlur={tidy('quantity', plainInput)}
                keyboardType="decimal-pad"
                placeholder="1"
                fieldStyle={fieldError('quantity') ? styles.fieldBad : undefined}
                containerStyle={styles.qty}
                testID="invoice-field-quantity"
              />
              <TextField
                label="Prix d’achat HT"
                value={draft.purchase}
                onChangeText={(t) => set({ purchase: t })}
                onBlur={tidy('purchase', priceInput)}
                keyboardType="decimal-pad"
                placeholder="0,00"
                suffix="€"
                fieldStyle={fieldError('purchase') ? styles.fieldBad : undefined}
                containerStyle={styles.flex}
                testID="invoice-field-purchase"
              />
            </View>
            {buyError ? <RowError text={buyError} /> : <Text style={styles.helper}>Prix d’une bouteille, canette ou fût, hors TVA.</Text>}
          </View>

          <View>
            <TextField
              label="Prix de vente TTC"
              meta={updating ? 'prix actuel conservé' : sameAs ? `prix de la ligne${NBSP}${lineN} conservé` : current ? doseLabel(current, ctx) : undefined}
              value={keepsPrice ? toInputString(preview?.price ?? match?.sellingPriceTTC ?? 0, 2) : draft.selling}
              onChangeText={(t) => set({ selling: t })}
              onBlur={tidy('selling', (n) => toInputString(n, 2))}
              editable={!keepsPrice}
              keyboardType="decimal-pad"
              placeholder={derived > 0 ? toInputString(derived, 2) : '0,00'}
              suffix="€"
              helper={sellingHelper}
              error={sellingError}
              testID="invoice-field-selling"
            />
            {margin !== null && zone ? (
              <View style={styles.marginRow} accessibilityLiveRegion="polite" testID="invoice-field-margin">
                <Badge value={margin} />
                <Text style={[styles.marginText, zone === 'red' && { color: marginColors.red.fg }]}>
                  {margin < 0
                    ? 'Prix sous le coût d’une dose : ce produit serait vendu à perte.'
                    : zone === 'red'
                      ? `Marge faible : sous ${formatPercent(thresholds.medium, 0)}. Vérifiez le prix de vente.`
                      : keepsPrice
                        ? 'Marge après la mise à jour du prix d’achat'
                        : sellingEmpty
                          ? 'Marge avec le prix calculé ×4'
                          : 'Marge avec votre prix'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

function RowError({ text }: { text: string }) {
  return (
    <View style={styles.errorRow} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={16} color={palette.bad} style={styles.errorIcon} />
      <Text style={styles.errorText}>{text}</Text>
    </View>
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
  form: { gap: 20, paddingBottom: 8 },
  flex: { flex: 1, minWidth: 0 },
  qty: { flex: 0.62, minWidth: 0 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  label: { ...type.label, color: palette.text2, marginBottom: 8 },
  chips: { marginTop: 0 },
  helper: { ...type.footnote, color: palette.text3, marginTop: 8 },
  fieldBad: { borderWidth: 2, borderColor: palette.bad },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  errorIcon: { marginTop: 1 },
  errorText: { ...type.footnoteStrong, color: palette.bad, flex: 1 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  matchText: { ...type.footnote, color: palette.text2, flexShrink: 1 },
  marginRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  marginText: { ...type.callout, color: palette.text2, flex: 1 },
});
