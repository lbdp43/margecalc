/**
 * Lot 2 (UX audit n° 10) — « Lier à un produit » for one invoice line: a
 * searchable sheet of the user's products, the look-alikes first.
 *
 *   Lier à un produit                                       ✕
 *   « Côtes du Rhône Rouge 2022 » · 75 cl sur la facture
 *   [🔍 Rechercher un produit…]
 *   ( ) Créer un nouveau produit
 *   RESSEMBLENT À CE NOM
 *   (•) Côtes du Rhône rouge       Vins · 75 cl · achat 6,80 € HT
 *   MÊME CONTENANCE · 75 CL
 *   ( ) Chablis Domaine Laroche …
 *   AUTRES CONTENANCES
 *   ( ) Aperol …
 *
 * A look-alike whose container differs from the line's says so (its purchase
 * price would be replaced by the price of another size); the other products
 * are grouped by container, the line's own first. The choice is sent
 * as `productId` (or `createNew`) and the backend remembers it for the
 * supplier's next invoices.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet, EmptyState, ListRow, SectionHeader } from '../../components/ui';
import { palette, type } from '../../theme';
import { NBSP, formatEuro, formatVolumeCl } from '../../utils/format';
import {
  containerDiffers,
  containerOf,
  normName,
  type ExistingProduct,
  type InvoiceLine,
  type LineTarget,
  type MatchSuggestion,
  type PricingContext,
  type ProductCatalog,
} from './model';

export interface PickedProduct {
  productId: string;
  name: string;
  containerVolumeCl: number;
}

export interface ProductPickerSheetProps {
  /** The line to link; the sheet is open while it is set. */
  line: InvoiceLine | null;
  target: LineTarget | null;
  catalog: ProductCatalog;
  ctx: PricingContext;
  supplier: string;
  onPick: (product: PickedProduct, via: 'suggestion' | 'picked') => void;
  onCreateNew: () => void;
  onClose: () => void;
}

/** Rows rendered at most for « Tous vos produits » (a search narrows the rest). */
const MAX_ROWS = 60;

const quote = (s: string) => `«${NBSP}${s}${NBSP}»`;

function subtitleOf(p: ExistingProduct | null, fallbackCl: number): string {
  if (!p) return formatVolumeCl(fallbackCl);
  return [p.categoryName, formatVolumeCl(p.containerVolumeCl), p.purchasePriceHT > 0 ? `achat ${formatEuro(p.purchasePriceHT)} HT` : null]
    .filter(Boolean)
    .join(' · ');
}

export function ProductPickerSheet({ line, target, catalog, ctx, supplier, onPick, onCreateNew, onClose }: ProductPickerSheetProps) {
  const [held, setHeld] = useState<{ line: InvoiceLine; target: LineTarget | null } | null>(line ? { line, target } : null);
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (line) {
      setHeld({ line, target });
      setQ('');
      setChosen(null);
    }
    // Only when another line opens the sheet: the target refreshes while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);
  useEffect(() => {
    if (line) setHeld({ line, target });
  }, [line, target]);

  const shownLine = held?.line ?? null;
  const t = held?.target ?? null;
  const current = chosen ?? (t?.kind === 'update' ? t.productId : t?.kind === 'create' && t.forced ? '__new' : null);
  const suggestions: MatchSuggestion[] = useMemo(() => {
    if (!t) return [];
    if (t.kind === 'update' || t.kind === 'decide' || t.kind === 'create') return t.suggestions;
    return [];
  }, [t]);
  const suggestionIds = useMemo(() => new Set(suggestions.map((s) => s.productId)), [suggestions]);

  const query = normName(q);
  const words = query ? query.split(' ') : [];
  const matches = (name: string) => {
    if (!words.length) return true;
    const n = normName(name);
    return words.every((w) => n.includes(w));
  };
  const shownSuggestions = suggestions.filter((s) => matches(s.name));
  const others = useMemo(() => catalog.list.filter((p) => !suggestionIds.has(p.id)), [catalog.list, suggestionIds]);
  const filtered = others.filter((p) => matches(p.name));
  const lineFor = held?.line ?? null;
  const sameSize = lineFor ? filtered.filter((p) => !containerDiffers(lineFor, p.containerVolumeCl, ctx)) : filtered;
  const otherSize = lineFor ? filtered.filter((p) => containerDiffers(lineFor, p.containerVolumeCl, ctx)) : [];
  const rowsSame = sameSize.slice(0, MAX_ROWS);
  const rowsOther = otherSize.slice(0, Math.max(0, MAX_ROWS - rowsSame.length));
  const hidden = filtered.length - rowsSame.length - rowsOther.length;

  const pick = (p: PickedProduct, via: 'suggestion' | 'picked') => {
    setChosen(p.productId);
    setTimeout(() => onPick(p, via), 120);
  };
  const createNew = () => {
    setChosen('__new');
    setTimeout(onCreateNew, 120);
  };

  const lineCl = shownLine ? containerOf(shownLine, ctx) : 0;
  const subline = shownLine ? `${quote(shownLine.name.trim() || 'Produit sans nom')} · ${formatVolumeCl(lineCl)} sur la facture` : undefined;
  const remember = supplier.trim() ? `Votre choix sera retenu pour les prochaines factures de ${supplier.trim()}.` : null;

  const productRow = (id: string, name: string, cl: number, via: 'suggestion' | 'picked', last: boolean) => {
    const p = catalog.byId.get(id) ?? null;
    const differs = shownLine ? containerDiffers(shownLine, cl, ctx) : false;
    // Only a look-alike needs the warning: the other products sit under « Autres contenances ».
    const warn = differs && via === 'suggestion';
    return (
      <ListRow
        key={id}
        icon={via === 'suggestion' ? 'git-compare-outline' : 'pricetag-outline'}
        iconTone="neutral"
        title={name}
        subtitle={subtitleOf(p, cl)}
        detail={warn ? `Contenance différente de la facture (${formatVolumeCl(lineCl)})` : undefined}
        right="radio"
        selected={current === id}
        onPress={() => pick({ productId: id, name: p?.name ?? name, containerVolumeCl: p?.containerVolumeCl ?? cl }, via)}
        divider={!last}
        accessibilityLabel={`${name}, ${subtitleOf(p, cl)}${differs ? ', contenance différente de la facture' : ''}`}
        testID={`picker-product-${id}`}
      />
    );
  };

  const nothing = !!words.length && !shownSuggestions.length && !filtered.length;
  const sizeTitle = `Même contenance · ${formatVolumeCl(lineCl)}`;

  return (
    <BottomSheet
      visible={!!line}
      onClose={onClose}
      title="Lier à un produit"
      subline={subline}
      snap="full"
      contentPadding={8}
      search={{ value: q, onChangeText: setQ, placeholder: 'Rechercher un produit…' }}
      testID="invoice-picker"
    >
      {remember ? <Text style={styles.note}>{remember}</Text> : null}
      <ListRow
        icon="add-circle-outline"
        title="Créer un nouveau produit"
        subtitle={shownLine ? `${quote(shownLine.name.trim() || 'Produit sans nom')} sera ajouté à vos produits` : undefined}
        right="radio"
        selected={current === '__new'}
        onPress={createNew}
        testID="picker-create"
      />

      {shownSuggestions.length ? (
        <>
          <SectionHeader variant="caps" title="Ressemblent à ce nom" style={styles.group} />
          {shownSuggestions.map((s, i) => productRow(s.productId, s.name, s.containerVolumeCl, 'suggestion', i === shownSuggestions.length - 1))}
        </>
      ) : null}

      {rowsSame.length ? (
        <>
          <SectionHeader variant="caps" title={sizeTitle} style={styles.group} />
          {rowsSame.map((p, i) => productRow(p.id, p.name, p.containerVolumeCl, 'picked', i === rowsSame.length - 1))}
        </>
      ) : null}
      {rowsOther.length ? (
        <>
          <SectionHeader variant="caps" title="Autres contenances" style={styles.group} />
          {rowsOther.map((p, i) => productRow(p.id, p.name, p.containerVolumeCl, 'picked', i === rowsOther.length - 1))}
        </>
      ) : null}
      {hidden > 0 ? <Text style={styles.more}>{`Encore ${hidden}${NBSP}produit${hidden > 1 ? 's' : ''} : affinez la recherche.`}</Text> : null}

      {nothing ? (
        <EmptyState variant="noResults" query={q} surface="surface" primary={{ label: 'Effacer la recherche', onPress: () => setQ('') }} style={styles.empty} />
      ) : !catalog.list.length ? (
        <View style={styles.emptyCatalog}>
          <Text style={styles.more}>Aucun produit suivi pour le moment.</Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  note: { ...type.footnote, color: palette.text3, paddingHorizontal: 12, paddingBottom: 6 },
  group: { marginTop: 18, marginBottom: 4, paddingHorizontal: 12 },
  more: { ...type.footnote, color: palette.text3, paddingHorizontal: 12, paddingVertical: 12 },
  empty: { marginTop: 24 },
  emptyCatalog: { marginTop: 8 },
});
