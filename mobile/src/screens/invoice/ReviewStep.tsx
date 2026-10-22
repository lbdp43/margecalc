/**
 * Step 3 — review what was read: supplier and date header, the detected lines
 * (tick / untick, tap to edit), « Ajouter une ligne », and the sticky
 * « Importer N produits » with the selection total.
 */
import React, { useCallback, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Category } from '@margebar/shared';
import { AnimatedNumber, Button, Card, FadeIn, NavBar, PressableScale, Screen, ScreenList, SectionHeader, StickyActionBar } from '../../components/ui';
import { palette, radius, type } from '../../theme';
import { NBSP, formatEuro, plural } from '../../utils/format';
import { LineCard } from './LineCard';
import { effectivePrice, hasErrors, selectedTotalHT, validateLine, type InvoiceLine, type PricingContext } from './model';

export interface ReviewStepProps {
  lines: InvoiceLine[];
  supplier: string;
  dateLabel: string | null;
  previewUri: string | null;
  categories: Category[];
  ctx: PricingContext;
  importing: boolean;
  /** True when these lines come back from a partial import (« Corriger »). */
  correcting: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onEdit: (id: string) => void;
  onEditSupplier: () => void;
  onAddLine: () => void;
  onRescan: () => void;
  onImport: () => void;
}

const Separator = () => <View style={styles.sep} />;

export function ReviewStep(props: ReviewStepProps) {
  const { lines, ctx, categories, importing, onToggle, onEdit } = props;
  const selected = useMemo(() => lines.filter((l) => l.selected), [lines]);
  const n = selected.length;
  const total = useMemo(() => selectedTotalHT(lines), [lines]);
  const incomplete = useMemo(() => selected.filter((l) => hasErrors(validateLine(l))).length, [selected]);
  const anyDerived = useMemo(() => lines.some((l) => effectivePrice(l, ctx).derived), [lines, ctx]);
  const allSelected = n === lines.length && lines.length > 0;
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const catOf = useCallback(
    (l: InvoiceLine) => (l.categoryId ? catById.get(l.categoryId) : undefined) ?? categories.find((c) => c.slug === l.categorySlug),
    [catById, categories],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: InvoiceLine; index: number }) => (
      <FadeIn index={index}>
        <LineCard line={item} category={catOf(item)} ctx={ctx} disabled={importing} onToggle={onToggle} onEdit={onEdit} />
      </FadeIn>
    ),
    [catOf, ctx, importing, onToggle, onEdit],
  );

  const header = (
    <View>
      <FadeIn>
        <Card onPress={props.onEditSupplier} padding={12} accessibilityLabel={`Fournisseur ${props.supplier || 'non lu'}${props.dateLabel ? `, facture du ${props.dateLabel}` : ''}. Modifier`} testID="invoice-supplier">
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
              <Text style={[styles.supplierName, !props.supplier && { color: palette.text3 }]} numberOfLines={1}>
                {props.supplier || 'Non lu · à indiquer'}
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
            <Ionicons name="alert-circle-outline" size={18} color={palette.bad} />
            <Text style={[styles.noteText, { color: palette.bad }]}>
              {lines.length > 1 ? 'Ces lignes n’ont pas été importées. Corrigez-les, puis relancez l’import.' : 'Cette ligne n’a pas été importée. Corrigez-la, puis relancez l’import.'}
            </Text>
          </View>
        </FadeIn>
      ) : null}

      <SectionHeader
        title={props.correcting ? plural(lines.length, 'ligne à corriger', 'lignes à corriger') : plural(lines.length, 'produit détecté', 'produits détectés')}
        right={
          lines.length > 1 ? (
            <PressableScale onPress={props.onToggleAll} disabled={importing} scaleTo="chip" haptic="select" hitSlop={8} style={styles.toggleAll} accessibilityRole="button" accessibilityLabel={allSelected ? 'Tout désélectionner' : 'Tout sélectionner'} testID="invoice-toggle-all">
              <Text style={styles.toggleAllText}>{allSelected ? 'Tout décocher' : 'Tout cocher'}</Text>
            </PressableScale>
          ) : undefined
        }
        style={styles.section}
      />

      {anyDerived && !props.correcting ? (
        <FadeIn delay={60}>
          <View style={styles.note}>
            <Ionicons name="calculator-outline" size={18} color={palette.em700} />
            <Text style={styles.noteText}>
              Sans prix de vente, il est calculé ×4 sur le coût d’une dose, arrondi à 0,10 €. Modifiable ensuite dans chaque fiche.
            </Text>
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
      ? 'Aucun produit sélectionné'
      : incomplete > 0
        ? plural(incomplete, 'ligne à compléter', 'lignes à compléter')
        : `${n} sur ${lines.length} sélectionné${n > 1 ? 's' : ''}`;

  return (
    <Screen
      scroll={false}
      header={<NavBar title="Scanner une facture" />}
      testID="invoice-review"
      stickyFooter={
        <StickyActionBar
          summary={summary}
          summaryZone={incomplete > 0 ? 'red' : undefined}
          summaryRight={
            n > 0 && total > 0 ? (
              <AnimatedNumber value={total} from={null} format={(v) => formatEuro(v)} prefix="Achat " suffix={`${NBSP}HT`} style={styles.total} numberOfLines={1} testID="invoice-total" />
            ) : undefined
          }
          primary={{
            title: n === 0 ? 'Sélectionnez un produit' : `Importer ${plural(n, 'produit')}`,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: palette.em50,
  },
  noteBad: { backgroundColor: palette.badBg, marginTop: 12, marginBottom: 0 },
  noteText: { ...type.footnoteStrong, color: palette.em800, flex: 1 },
  listFooter: { marginTop: 16, gap: 4 },
  total: { ...type.footnoteStrong, color: palette.ink },
  toggleAll: { minHeight: 32, justifyContent: 'center', paddingLeft: 8 },
  toggleAllText: { ...type.calloutStrong, color: palette.em700 },
});
