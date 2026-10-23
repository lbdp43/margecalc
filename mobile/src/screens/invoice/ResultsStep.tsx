/**
 * Step 4 — what the import did (lot 2, UX audit n° 9, mockup 5).
 *
 *   ┌ ✓ 6 produits importés ─────────────────────────┐   emerald summary
 *   │   France Boissons · 14 octobre 2026             │
 *   │   (+ 3 créés) (↻ 3 mis à jour)                  │
 *   └─────────────────────────────────────────────────┘
 *   ┌ ↘ 1 produit sous l’objectif            [Ajuster] ┐  amber: user thresholds
 *   │   Jameson Irish Whiskey · Verre 5 cl 4,00 → 4,40 € │  → « Sous l’objectif » (these products)
 *   └─────────────────────────────────────────────────┘
 *   ┌ ▦ 3 prix à vérifier                    [Vérifier] ┐  prices derived ×4
 *   Détail de l’import
 *   ↻ Jameson Irish Whiskey                    ● 61,6 %
 *     Achat 16,20 → 17,90 € (+10,5 %)
 *     Marge 65,3 → 61,6 % (−3,7 pts)
 *   + Côtes du Rhône Rouge 2022             [À vérifier]   amber, never a green « OK »
 *     Créé · 3,70 € TTC · calculé ×4
 *
 * Nothing imported: a calm white card (never the celebratory emerald one).
 * Failed rows show the backend's error inline; when any line failed, the
 * sticky primary is « Corriger les N lignes » (back to review).
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedNumber, Badge, Button, Card, FadeIn, HeroRings, NavBar, PressableScale, Screen, SectionHeader, StickyActionBar } from '../../components/ui';
import { palette, radius, type } from '../../theme';
import { NBSP, formatEuro, formatNumber, formatPercent, formatPoints, plural } from '../../utils/format';
import { useMarginThresholds } from '../../utils/marginThresholds';
import { doseCost, suggestedPrice } from '../../utils/pricing';
import { usePriceRounding } from '../../utils/priceRounding';
import { PurchaseChange } from './MatchBlock';
import { samePurchase, type LineOutcome, type ProductCatalog } from './model';
import { withAlpha } from './colors';

export interface ImportSummary {
  outcomes: LineOutcome[];
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  supplier: string;
  dateLabel: string | null;
}

export interface ResultsStepProps {
  summary: ImportSummary;
  /** The user's products (refetched after the import): the suggested price in the alert. */
  catalog: ProductCatalog;
  onOpenProduct: (productId: string) => void;
  /** « Ajuster »: « Sous l’objectif » restricted to these products. */
  onAdjust: (productIds: string[]) => void;
  /** « Vérifier »: the products created with a price calculated ×4. */
  onReview: (productIds: string[]) => void;
  onFix: () => void;
  onSeeProducts: () => void;
  onNewInvoice: () => void;
}

/** « Jameson Irish Whiskey », « A et B », « A, B et 2 autres ». */
function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} et ${names[1]}`;
  return `${names[0]}, ${names[1]} et ${plural(names.length - 2, 'autre', 'autres')}`;
}

/** « Marge 65,3 → 61,6 % (−3,7 pts) »; the change in amber when it drops, green when it rises. */
function MarginChange({ before, after }: { before: number | null; after: number | null }) {
  if (after === null) return null;
  if (before === null) return <Text style={styles.rowLine}>Marge {formatPercent(after)}</Text>;
  const delta = Math.round((after - before) * 10) / 10;
  if (Math.abs(delta) < 0.05) return <Text style={styles.rowLine}>Marge {formatPercent(after)} · inchangée</Text>;
  return (
    <Text style={styles.rowLine} accessibilityLabel={`Marge ${formatPercent(before)}, puis ${formatPercent(after)}`}>
      Marge {formatNumber(before, 1)} → {formatPercent(after)}
      <Text style={[styles.rowStrong, { color: delta < 0 ? palette.warn : palette.good }]}>{` (${formatPoints(delta)})`}</Text>
    </Text>
  );
}

function ResultRow({ outcome, last, onOpen, index }: { outcome: LineOutcome; last: boolean; onOpen: (id: string) => void; index: number }) {
  const { line, result, marginPercent, previousMarginPercent, previousPurchasePriceHT } = outcome;
  const name = outcome.productName || result.name || line.name || 'Produit sans nom';
  if (!result.ok) {
    return (
      <View
        style={[styles.row, !last && styles.rowDivider]}
        testID={`invoice-result-${index}`}
        accessible
        accessibilityLabel={`${name}, non importé : ${result.error}`}
      >
        <View style={[styles.rowIcon, { backgroundColor: palette.badBg }]}>
          <Ionicons name="alert-circle-outline" size={20} color={palette.bad} />
        </View>
        <View style={styles.rowTexts}>
          <Text style={styles.rowTitle}>{name}</Text>
          <Text style={[styles.rowLine, { color: palette.bad }]}>{result.error}</Text>
        </View>
      </View>
    );
  }
  const created = result.action === 'created';
  const toReview = created && result.priceDerived;
  const purchase = line.purchasePriceHT;
  const a11y = created
    ? `${name}, créé, ${formatEuro(result.sellingPriceTTC)} TTC${toReview ? ', calculé fois 4, prix à vérifier' : ''}`
    : `${name}, mis à jour${
        previousPurchasePriceHT !== null && purchase ? `, achat ${formatEuro(previousPurchasePriceHT)} puis ${formatEuro(purchase)}` : ''
      }${marginPercent !== null ? `, marge ${formatPercent(marginPercent)}` : ''}`;
  return (
    <PressableScale
      onPress={() => onOpen(result.productId)}
      scaleTo="card"
      style={[styles.row, !last && styles.rowDivider]}
      accessibilityRole="button"
      accessibilityLabel={`${a11y}. Ouvrir la fiche`}
      testID={`invoice-result-${index}`}
    >
      <View style={[styles.rowIcon, { backgroundColor: created ? palette.em50 : palette.surface2 }]}>
        <Ionicons name={created ? 'add' : 'sync-outline'} size={20} color={created ? palette.em700 : palette.text2} />
      </View>
      <View style={styles.rowTexts}>
        <View style={styles.rowHead}>
          <Text style={styles.rowTitle}>{name}</Text>
          {toReview ? (
            <Badge zone="orange" icon="eye-outline" label="À vérifier" size="sm" style={styles.rowBadge} accessibilityLabel="Prix à vérifier" />
          ) : marginPercent !== null ? (
            <Badge value={marginPercent} size="sm" style={styles.rowBadge} />
          ) : null}
        </View>
        {created ? (
          <Text style={styles.rowLine}>
            Créé · {formatEuro(result.sellingPriceTTC)} TTC{toReview ? <Text style={styles.derived}> · calculé ×4</Text> : null}
          </Text>
        ) : (
          <>
            {previousPurchasePriceHT !== null && purchase ? (
              <PurchaseChange before={previousPurchasePriceHT} after={purchase} style={styles.rowLineTight} />
            ) : null}
            <MarginChange before={previousMarginPercent} after={marginPercent} />
          </>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.text4} style={styles.chevron} />
    </PressableScale>
  );
}

export function ResultsStep({ summary, catalog, onOpenProduct, onAdjust, onReview, onFix, onSeeProducts, onNewInvoice }: ResultsStepProps) {
  const t = useMarginThresholds();
  const rounding = usePriceRounding();
  const ok = summary.createdCount + summary.updatedCount;
  const failed = summary.failedCount;
  const allFailed = ok === 0;
  const fixTitle = failed > 1 ? `Corriger les ${failed} lignes` : 'Corriger la ligne';
  const source = [summary.supplier || null, summary.dateLabel ?? null].filter(Boolean).join(' · ');

  // Products this invoice put (or pushed further) under the user's objective (UX audit n° 9: alert when a
  // margin DROPS): one entry per product, its last line (the price it ends with). A product whose margin did
  // not move with this invoice (the same invoice imported twice) is not news. A new product under the
  // objective (a low price typed) is.
  const under = useMemo(() => {
    const first = new Map<string, LineOutcome>();
    const last = new Map<string, LineOutcome>();
    for (const o of summary.outcomes) {
      if (!o.result.ok) continue;
      if (!first.has(o.result.productId)) first.set(o.result.productId, o);
      last.set(o.result.productId, o);
    }
    const out: LineOutcome[] = [];
    for (const [id, o] of last) {
      const f = first.get(id)!;
      const before = f.result.ok && f.result.action === 'created' ? null : f.previousMarginPercent;
      if (o.marginPercent === null || !(o.marginPercent < t.good)) continue;
      if (before !== null && !(o.marginPercent < before - 0.05)) continue;
      out.push(o);
    }
    return out;
  }, [summary.outcomes, t.good]);
  const underIds = under.map((o) => (o.result.ok ? o.result.productId : '')).filter(Boolean);
  const toReview = summary.outcomes.filter((o) => o.result.ok && o.result.action === 'created' && o.result.priceDerived);
  const reviewIds = toReview.map((o) => (o.result.ok ? o.result.productId : '')).filter(Boolean);
  const objective = formatPercent(t.good, Number.isInteger(t.good) ? 0 : 1);

  // « Jameson Irish Whiskey · Verre 5 cl 4,00 → 4,40 € » once the refetched product carries the new purchase price.
  const underLine = useMemo(() => {
    if (!under.length) return null;
    if (under.length > 1) return `${namesList(under.map((o) => o.productName))} · objectif ${objective}`;
    const o = under[0];
    if (!o.result.ok) return null;
    const p = catalog.byId.get(o.result.productId);
    const name = p?.name ?? o.productName;
    if (p && samePurchase(p.purchasePriceHT, o.line.purchasePriceHT) && p.sellingPriceTTC > 0) {
      const price = suggestedPrice(doseCost(p.purchasePriceHT, p.containerVolumeCl, p.doseVolumeCl), p.tvaRate, t.good, rounding);
      if (price !== null && price > p.sellingPriceTTC + 0.004) {
        return `${name} · ${p.primaryLabel} ${formatEuro(p.sellingPriceTTC, { bare: true })} → ${formatEuro(price)}`;
      }
    }
    return `${name} · marge ${formatPercent(o.marginPercent)} (objectif ${objective})`;
  }, [under, catalog, t.good, rounding, objective]);

  const panel = (
    <View>
      <HeroRings size={300} />
      <View style={styles.panelTop}>
        <View style={styles.panelIcon}>
          <Ionicons name="checkmark" size={22} color={palette.onLime} />
        </View>
        <View style={styles.flex}>
          <View style={styles.countRow}>
            {/* Counts up from 2 when there are several, so the label always agrees with the number on screen. */}
            <AnimatedNumber value={ok} from={ok >= 2 ? 2 : 0} format={(v) => String(Math.round(v))} style={styles.count} testID="invoice-results-count" />
            <Text style={styles.count}>{ok > 1 ? `${NBSP}produits importés` : `${NBSP}produit importé`}</Text>
          </View>
          <Text style={styles.panelMeta} numberOfLines={2}>
            {source || 'Import de la facture'}
          </Text>
        </View>
      </View>
      <View style={styles.badges}>
        {summary.createdCount > 0 ? <Badge variant="onEmerald" icon="add-circle-outline" label={plural(summary.createdCount, 'créé', 'créés')} /> : null}
        {summary.updatedCount > 0 ? <Badge variant="onEmerald" icon="sync-outline" label={plural(summary.updatedCount, 'mis à jour', 'mis à jour')} /> : null}
        {failed > 0 ? (
          <View style={styles.failPill} accessible accessibilityLabel={plural(failed, 'ligne en échec', 'lignes en échec')}>
            <Ionicons name="alert-circle" size={14} color={palette.badOnEmerald} />
            <Text style={styles.failPillText}>{plural(failed, 'en échec', 'en échec')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  const adjustTitle = `Ajuster ${plural(under.length, 'prix', 'prix')}`;
  const footer =
    failed > 0 ? (
      <StickyActionBar
        primary={{ title: fixTitle, icon: 'create-outline', onPress: onFix, testID: 'invoice-fix' }}
        secondary={ok > 0 ? { title: 'Mes produits', onPress: onSeeProducts, testID: 'invoice-see-products' } : undefined}
      />
    ) : under.length > 0 ? (
      <StickyActionBar
        primary={{ title: adjustTitle, icon: 'pricetag-outline', onPress: () => onAdjust(underIds), testID: 'invoice-adjust-primary' }}
        secondary={{ title: 'Mes produits', onPress: onSeeProducts, testID: 'invoice-see-products' }}
      />
    ) : (
      <StickyActionBar primary={{ title: 'Voir mes produits', trailingIcon: 'arrow-forward', onPress: onSeeProducts, testID: 'invoice-see-products' }} />
    );

  return (
    <Screen header={<NavBar title="Scanner une facture" />} testID="invoice-results" stickyFooter={footer}>
      <FadeIn offset={8}>
        {allFailed ? (
          <Card style={styles.hero} testID="invoice-results-none">
            <View style={styles.noneIcon}>
              <Ionicons name="alert-circle-outline" size={26} color={palette.bad} />
            </View>
            <Text style={styles.noneTitle} accessibilityRole="header">
              Aucun produit importé
            </Text>
            {source ? <Text style={styles.noneMeta}>{source}</Text> : null}
            <Text style={styles.noneText}>
              {failed > 1
                ? `Les ${failed} lignes ont été refusées. Corrigez-les à partir des messages ci-dessous, puis relancez l’import.`
                : 'La ligne a été refusée. Corrigez-la à partir du message ci-dessous, puis relancez l’import.'}
            </Text>
          </Card>
        ) : (
          <Card variant="emeraldPanel" panel={panel} style={styles.hero} testID="invoice-results-hero" />
        )}
      </FadeIn>

      {failed > 0 && !allFailed ? (
        <FadeIn delay={40} offset={8}>
          <View style={[styles.alert, { backgroundColor: palette.badBg }]} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={20} color={palette.bad} />
            <Text style={[styles.alertNote, { color: palette.bad }]}>
              {failed > 1
                ? `${failed} lignes n’ont pas été importées : corrigez-les, puis relancez l’import.`
                : '1 ligne n’a pas été importée : corrigez-la, puis relancez l’import.'}
            </Text>
          </View>
        </FadeIn>
      ) : null}

      {under.length > 0 ? (
        <FadeIn delay={60} offset={8}>
          <View style={[styles.alert, styles.alertWarn]} testID="invoice-under-target" accessibilityLiveRegion="polite">
            <View style={styles.alertIcon}>
              <Ionicons name="trending-down" size={20} color={palette.warn} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.alertTitle}>{plural(under.length, 'produit sous l’objectif', 'produits sous l’objectif')}</Text>
              {underLine ? <Text style={styles.alertText}>{underLine}</Text> : null}
            </View>
            <Button
              title="Ajuster"
              variant="secondary"
              size="sm"
              onPress={() => onAdjust(underIds)}
              style={styles.alertButton}
              accessibilityLabel={`Ajuster ${plural(under.length, 'prix', 'prix')} sous l’objectif`}
              testID="invoice-adjust"
            />
          </View>
        </FadeIn>
      ) : null}

      {toReview.length > 0 ? (
        <FadeIn delay={80} offset={8}>
          <Card padding={14} style={styles.reviewCard} testID="invoice-to-review">
            <View style={styles.reviewRow}>
              <View style={styles.reviewIcon}>
                <Ionicons name="calculator-outline" size={20} color={palette.text2} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.reviewTitle}>{plural(toReview.length, 'prix à vérifier', 'prix à vérifier')}</Text>
                <Text style={styles.reviewText}>Calculés ×4, à confirmer</Text>
              </View>
              <Button
                title="Vérifier"
                variant="secondary"
                size="sm"
                onPress={() => onReview(reviewIds)}
                style={styles.alertButton}
                accessibilityLabel={`Vérifier ${plural(toReview.length, 'prix calculé', 'prix calculés')} fois 4`}
                testID="invoice-review-prices"
              />
            </View>
          </Card>
        </FadeIn>
      ) : null}

      <SectionHeader title="Détail de l’import" style={styles.section} />
      <FadeIn delay={100} offset={8}>
        <Card noPadding>
          {summary.outcomes.map((o, i) => (
            <ResultRow key={o.line.id} outcome={o} index={i} last={i === summary.outcomes.length - 1} onOpen={onOpenProduct} />
          ))}
        </Card>
      </FadeIn>

      <FadeIn delay={140} offset={8}>
        {summary.updatedCount > 0 ? (
          <Text style={styles.footNote}>Les produits déjà suivis gardent leur prix de vente : seul leur prix d’achat est mis à jour.</Text>
        ) : null}
        <View style={styles.after}>
          <Button title="Scanner une autre facture" variant="text" icon="camera-outline" onPress={onNewInvoice} testID="invoice-new" />
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { marginTop: 8 },
  panelTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  panelIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  countRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  count: { ...type.title2, color: palette.onEmerald },
  panelMeta: { ...type.footnote, color: palette.onEmerald2, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  failPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: withAlpha(palette.badOnEmerald, 0.16),
    borderWidth: 1,
    borderColor: withAlpha(palette.badOnEmerald, 0.5),
  },
  failPillText: { ...type.footnoteStrong, color: palette.badOnEmerald },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.lg },
  alertWarn: { backgroundColor: palette.warnBg },
  alertIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: withAlpha(palette.warnSolid, 0.18), alignItems: 'center', justifyContent: 'center' },
  alertTitle: { ...type.calloutStrong, color: palette.warn },
  alertText: { ...type.footnote, color: palette.text2, marginTop: 1 },
  alertNote: { ...type.callout, flex: 1 },
  alertButton: { paddingHorizontal: 14 },
  reviewCard: { marginTop: 12 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reviewIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' },
  reviewTitle: { ...type.headline, color: palette.ink },
  reviewText: { ...type.footnote, color: palette.text2, marginTop: 1 },
  noneIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.badBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  noneTitle: { ...type.title3, color: palette.ink },
  noneMeta: { ...type.footnote, color: palette.text3, marginTop: 2 },
  noneText: { ...type.callout, color: palette.text2, marginTop: 8 },
  section: { marginTop: 24, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 14, minHeight: 64 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTexts: { flex: 1, minWidth: 0 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowTitle: { ...type.headline, color: palette.ink, flex: 1, minWidth: 0 },
  rowBadge: { marginTop: 1 },
  rowLine: { ...type.footnote, color: palette.text2, marginTop: 2 },
  rowLineTight: { marginTop: 2 },
  rowStrong: { ...type.footnoteStrong },
  derived: { ...type.footnoteStrong, color: palette.warn },
  chevron: { alignSelf: 'center' },
  footNote: { ...type.footnote, color: palette.text3, marginTop: 12, paddingHorizontal: 4 },
  after: { marginTop: 12, gap: 4 },
});
