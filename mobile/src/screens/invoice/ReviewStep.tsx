/**
 * Step 3 — review what was read: supplier and date header, the detected lines
 * (tick / untick, tap to edit, margin after import), what each line does to
 * the catalogue (lot 2: « Mettre à jour « … » » with the purchase price
 * before → after, « Ressemble à « … » · Mettre à jour ce produit ? » with
 * Lier / Créer un nouveau, « Nouveau produit »), « Ajouter une ligne », and
 * the sticky « Importer N produits » with the selection total.
 */
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@margebar/shared';
import { AnimatedNumber, Button, Card, FadeIn, NavBar, PressableScale, Screen, ScreenList, SectionHeader, StickyActionBar } from '../../components/ui';
import { palette, radius, type } from '../../theme';
import { NBSP, formatEuro, plural } from '../../utils/format';
import { LineCard } from './LineCard';
import { hasErrors, selectedTotalHT, validateLine, type InvoiceLine, type LinePreview, type PricingContext } from './model';

/** State of the name matching (POST /api/products/import/preview). */
export type MatchStatus = 'idle' | 'loading' | 'ok' | 'error';

export interface ReviewStepProps {
  lines: InvoiceLine[];
  supplier: string;
  dateLabel: string | null;
  previewUri: string | null;
  categories: Category[];
  ctx: PricingContext;
  /** What each line will do (by line id): target, price and margin after the import. */
  previews: Map<string, LinePreview>;
  /** The preview's own error for a line (by line id). */
  previewErrors: Map<string, string>;
  matchStatus: MatchStatus;
  /** True until the first preview of these lines answered. */
  matchPending: boolean;
  onRetryMatch: () => void;
  importing: boolean;
  /** True when these lines come back from a partial import (« Corriger »). */
  correcting: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onEdit: (id: string) => void;
  onLink: (id: string) => void;
  onCreateNew: (id: string) => void;
  onChoose: (id: string) => void;
  onEditSupplier: () => void;
  onAddLine: () => void;
  onRescan: () => void;
  onImport: () => void;
}

const Separator = () => <View style={styles.sep} />;

export function ReviewStep(props: ReviewStepProps) {
  const { lines, ctx, categories, importing, onToggle, onEdit, onLink, onCreateNew, onChoose, previews, previewErrors, supplier } = props;
  const selected = useMemo(() => lines.filter((l) => l.selected), [lines]);
  const n = selected.length;
  const total = useMemo(() => selectedTotalHT(lines), [lines]);
  const incomplete = useMemo(() => selected.filter((l) => hasErrors(validateLine(l))).length, [selected]);
  const toConfirm = useMemo(
    () =>
      selected.filter((l) => {
        const p = previews.get(l.id);
        return p?.target.kind === 'decide' && !p.pending;
      }).length,
    [selected, previews],
  );
  const anyDerived = useMemo(() => lines.some((l) => previews.get(l.id)?.derived), [lines, previews]);
  const anyManual = useMemo(() => lines.some((l) => l.source === 'manual'), [lines]);
  const allSelected = n === lines.length && lines.length > 0;
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const catOf = useCallback(
    (l: InvoiceLine) => (l.categoryId ? catById.get(l.categoryId) : undefined) ?? categories.find((c) => c.slug === l.categorySlug),
    [catById, categories],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: InvoiceLine; index: number }) => (
      <FadeIn index={index}>
        {previews.get(item.id) ? (
          <LineCard
            line={item}
            category={catOf(item)}
            ctx={ctx}
            preview={previews.get(item.id)!}
            supplier={supplier}
            previewError={previewErrors.get(item.id) ?? null}
            disabled={importing}
            onToggle={onToggle}
            onEdit={onEdit}
            onLink={onLink}
            onCreateNew={onCreateNew}
            onChoose={onChoose}
          />
        ) : null}
      </FadeIn>
    ),
    [catOf, ctx, previews, previewErrors, supplier, importing, onToggle, onEdit, onLink, onCreateNew, onChoose],
  );

  const supplierA11y = `Fournisseur ${props.supplier || 'non indiqué'}${props.dateLabel ? `, facture du ${props.dateLabel}` : ''}. Modifier`;

  const header = (
    <View>
      <FadeIn>
        <Card onPress={props.onEditSupplier} padding={12} accessibilityLabel={supplierA11y} testID="invoice-supplier">
          <View style={styles.supplierRow}>
            {props.previewUri ? (
              <Image source={{ uri: props.previewUri }} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Ionicons name="receipt-outline" size={24} color={palette.em700} />
              </View>
            )}
            <View style={styles.flex}>
              <Text style={styles.supplierLabel}>Fournisseur</Text>
              <Text style={[styles.supplierName, !props.supplier && { color: palette.em700 }]} numberOfLines={1}>
                {props.supplier || 'Aucun fournisseur · ajouter'}
              </Text>
              <Text style={styles.supplierMeta} numberOfLines={1}>
                {props.dateLabel ? `Facture du ${props.dateLabel}` : 'Date non lue'}
              </Text>
            </View>
            <View style={styles.editTile}>
              <Ionicons name="create-outline" size={18} color={palette.em700} />
            </View>
          </View>
        </Card>
      </FadeIn>

      {props.correcting ? (
        <FadeIn delay={40}>
          <View style={[styles.note, styles.noteBad]}>
            <Ionicons name="alert-circle-outline" size={20} color={palette.bad} style={styles.noteIcon} />
            <Text style={[styles.noteText, { color: palette.bad }]}>
              {lines.length > 1 ? 'Ces lignes n’ont pas été importées. Corrigez-les, puis relancez l’import.' : 'Cette ligne n’a pas été importée. Corrigez-la, puis relancez l’import.'}
            </Text>
          </View>
        </FadeIn>
      ) : null}

      <SectionHeader
        title={
          props.correcting
            ? plural(lines.length, 'ligne à corriger', 'lignes à corriger')
            : anyManual
              ? plural(lines.length, 'ligne')
              : plural(lines.length, 'produit détecté', 'produits détectés')
        }
        right={
          lines.length > 1 ? (
            <PressableScale
              onPress={props.onToggleAll}
              disabled={importing}
              scaleTo="chip"
              haptic="select"
              style={styles.toggleAll}
              accessibilityRole="button"
              accessibilityLabel={allSelected ? 'Tout décocher' : 'Tout cocher'}
              testID="invoice-toggle-all"
            >
              <Text style={styles.toggleAllText}>{allSelected ? 'Tout décocher' : 'Tout cocher'}</Text>
            </PressableScale>
          ) : undefined
        }
        style={styles.section}
      />

      {props.matchPending && props.matchStatus === 'loading' ? (
        <FadeIn delay={40}>
          <View style={styles.note} accessibilityLiveRegion="polite" testID="invoice-match-loading">
            <ActivityIndicator size="small" color={palette.em700} style={styles.noteIcon} />
            <Text style={styles.noteText}>Rapprochement avec vos produits…</Text>
          </View>
        </FadeIn>
      ) : props.matchStatus === 'error' ? (
        <FadeIn delay={40}>
          <View style={[styles.note, styles.noteMuted]} accessibilityLiveRegion="polite" testID="invoice-match-error">
            <Ionicons name="cloud-offline-outline" size={20} color={palette.text2} style={styles.noteIcon} />
            <View style={styles.flex}>
              <Text style={[styles.noteText, { color: palette.text2 }]}>
                Rapprochement des noms indisponible : seuls les noms identiques mettront à jour vos produits.
              </Text>
              <Button
                title="Réessayer"
                variant="text"
                size="sm"
                icon="refresh"
                onPress={props.onRetryMatch}
                style={styles.noteAction}
                testID="invoice-match-retry"
              />
            </View>
          </View>
        </FadeIn>
      ) : null}

      {anyDerived && !props.correcting ? (
        <FadeIn delay={60}>
          <View style={styles.note}>
            <Ionicons name="calculator-outline" size={20} color={palette.em700} style={styles.noteIcon} />
            <Text style={styles.noteText}>Sans prix de vente indiqué, nous le calculons : coût d’une dose ×4, TVA comprise, arrondi à 0,10 €.</Text>
          </View>
        </FadeIn>
      ) : null}
    </View>
  );

  const footer = (
    <View style={styles.listFooter}>
      <Button title="Ajouter une ligne" variant="secondary" icon="add" onPress={props.onAddLine} disabled={importing} testID="invoice-add-line" />
      <Button title="Scanner une autre facture" variant="text" icon="camera-outline" onPress={props.onRescan} disabled={importing} testID="invoice-rescan" />
    </View>
  );

  const summary =
    n === 0
      ? 'Cochez au moins un produit'
      : incomplete > 0
        ? plural(incomplete, 'ligne à compléter', 'lignes à compléter')
        : toConfirm > 0
          ? plural(toConfirm, 'produit à confirmer', 'produits à confirmer')
          : `${n} sur ${lines.length} sélectionné${n > 1 ? 's' : ''}`;

  return (
    <Screen
      scroll={false}
      header={<NavBar title="Scanner une facture" />}
      testID="invoice-review"
      stickyFooter={
        <StickyActionBar
          summary={summary}
          summaryZone={incomplete > 0 && n > 0 ? 'red' : toConfirm > 0 && n > 0 ? 'orange' : undefined}
          summaryRight={
            n > 0 && total > 0 ? (
              <AnimatedNumber value={total} from={null} format={(v) => formatEuro(v)} prefix="Achat " suffix={`${NBSP}HT`} style={styles.total} numberOfLines={1} testID="invoice-total" />
            ) : undefined
          }
          primary={{
            title: n === 0 ? 'Importer' : `Importer ${plural(n, 'produit')}`,
            icon: 'download-outline',
            onPress: props.onImport,
            loading: importing,
            disabled: n === 0,
            haptic: false,
            testID: 'invoice-import',
          }}
        />
      }
    >
      <ScreenList
        data={lines}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={styles.content}
        removeClippedSubviews={false}
        initialNumToRender={12}
        windowSize={11}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  content: { paddingTop: 8 },
  sep: { height: 10 },
  supplierRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 56, height: 56, borderRadius: radius.icon, backgroundColor: palette.surface2 },
  thumbEmpty: { backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
  supplierLabel: { ...type.footnote, color: palette.text3 },
  supplierName: { ...type.headline, color: palette.ink },
  supplierMeta: { ...type.footnote, color: palette.text2 },
  editTile: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 24, marginBottom: 10 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: palette.em50,
  },
  noteIcon: { marginTop: 1 },
  noteBad: { backgroundColor: palette.badBg, marginTop: 12, marginBottom: 0 },
  noteMuted: { backgroundColor: palette.surface2 },
  noteAction: { alignSelf: 'flex-start', marginLeft: -12, marginTop: 2, marginBottom: -10 },
  noteText: { ...type.callout, color: palette.em800, flex: 1 },
  listFooter: { marginTop: 16, gap: 4 },
  total: { ...type.footnoteStrong, color: palette.ink },
  toggleAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, marginRight: -8 },
  toggleAllText: { ...type.calloutStrong, color: palette.em700 },
});
