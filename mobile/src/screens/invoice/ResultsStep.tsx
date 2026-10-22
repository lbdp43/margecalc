/**
 * Step 4 — what the import did.
 *  - Something was imported: an emerald summary (count-up, created / updated /
 *    failed), then one row per line with the margin each product now has.
 *  - Nothing was imported: a calm white card (never the celebratory emerald one).
 * Failed rows show the backend's error inline; when any line failed, the sticky
 * primary is « Corriger les N lignes » (back to review), « Voir mes produits »
 * becomes the secondary.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  FadeIn,
  HeroRings,
  ListGroup,
  ListRow,
  NavBar,
  Screen,
  SectionHeader,
  StickyActionBar,
} from '../../components/ui';
import { palette, type } from '../../theme';
import { formatEuro, plural } from '../../utils/format';
import { priceDecimals, type LineOutcome } from './model';
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
  onOpenProduct: (productId: string) => void;
  onFix: () => void;
  onSeeProducts: () => void;
  onNewInvoice: () => void;
}

export function ResultsStep({ summary, onOpenProduct, onFix, onSeeProducts, onNewInvoice }: ResultsStepProps) {
  const ok = summary.createdCount + summary.updatedCount;
  const failed = summary.failedCount;
  const allFailed = ok === 0;
  const anyDerived = summary.outcomes.some((o) => o.result.ok && o.result.action === 'created' && o.result.priceDerived);
  const fixTitle = failed > 1 ? `Corriger les ${failed} lignes` : 'Corriger la ligne';
  const source = [summary.supplier || null, summary.dateLabel ? `facture du ${summary.dateLabel}` : null].filter(Boolean).join(' · ');

  const heroNote =
    failed > 0
      ? failed > 1
        ? `${failed} lignes n’ont pas été importées : corrigez-les, puis relancez l’import.`
        : '1 ligne n’a pas été importée : corrigez-la, puis relancez l’import.'
      : summary.updatedCount > 0
        ? 'Les produits déjà suivis gardent leur prix de vente : seul leur prix d’achat est mis à jour.'
        : anyDerived
          ? 'Les prix de vente calculés ×4 se modifient à tout moment dans chaque fiche.'
          : 'Retrouvez-les dans Mes produits, avec leur marge.';

  const panel = (
    <View>
      <HeroRings size={300} />
      <View style={styles.panelTop}>
        <View style={styles.panelIcon}>
          <Ionicons name="checkmark" size={22} color={palette.onLime} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.panelKicker} numberOfLines={1}>
            {summary.supplier ? summary.supplier : 'Import de la facture'}
          </Text>
          {summary.dateLabel ? <Text style={styles.panelDate}>Facture du {summary.dateLabel}</Text> : null}
        </View>
      </View>
      <View style={styles.countRow}>
        {/* Counts up from 2 when there are several, so the label always agrees with the number on screen. */}
        <AnimatedNumber value={ok} from={ok >= 2 ? 2 : 0} format={(v) => String(Math.round(v))} style={styles.count} testID="invoice-results-count" />
        <Text style={styles.countLabel}>{ok > 1 ? 'produits importés' : 'produit importé'}</Text>
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

  return (
    <Screen
      header={<NavBar title="Scanner une facture" />}
      testID="invoice-results"
      stickyFooter={
        failed > 0 ? (
          <StickyActionBar primary={{ title: fixTitle, icon: 'create-outline', onPress: onFix, testID: 'invoice-fix' }}>
            {ok > 0 ? <Button title="Voir mes produits" variant="secondary" size="sm" trailingIcon="arrow-forward" onPress={onSeeProducts} testID="invoice-see-products" /> : null}
          </StickyActionBar>
        ) : (
          <StickyActionBar primary={{ title: 'Voir mes produits', trailingIcon: 'arrow-forward', onPress: onSeeProducts, testID: 'invoice-see-products' }} />
        )
      }
    >
      <FadeIn offset={8}>
        {allFailed ? (
          <Card style={styles.hero} testID="invoice-results-none">
            <View style={styles.noneIcon}>
              <Ionicons name="alert-circle-outline" size={26} color={palette.bad} />
            </View>
            <Text style={styles.noneTitle} accessibilityRole="header">
              Aucun produit importé
            </Text>
            {source ? <Text style={styles.noneMeta}>{source.charAt(0).toUpperCase() + source.slice(1)}</Text> : null}
            <Text style={styles.noneText}>
              {failed > 1
                ? `Les ${failed} lignes ont été refusées. Corrigez-les à partir des messages ci-dessous, puis relancez l’import.`
                : 'La ligne a été refusée. Corrigez-la à partir du message ci-dessous, puis relancez l’import.'}
            </Text>
          </Card>
        ) : (
          <Card variant="emeraldPanel" panel={panel} padding={14} style={styles.hero} testID="invoice-results-hero">
            <Text style={styles.heroNote}>{heroNote}</Text>
          </Card>
        )}
      </FadeIn>

      <SectionHeader title="Détail de l’import" style={styles.section} />
      <FadeIn delay={80} offset={8}>
        <ListGroup>
          {summary.outcomes.map(({ line, result, marginPercent }, i) => {
            if (result.ok) {
              const created = result.action === 'created';
              const subtitle = created
                ? `Créé · ${formatEuro(result.sellingPriceTTC)} TTC${result.priceDerived ? ' · calculé ×4' : ''}`
                : `Mis à jour · achat ${formatEuro(line.purchasePriceHT, { decimals: priceDecimals(line.purchasePriceHT) })} HT · vente ${formatEuro(result.sellingPriceTTC)} conservée`;
              return (
                <ListRow
                  key={line.id}
                  icon={created ? 'checkmark-circle-outline' : 'sync-outline'}
                  iconTone={created ? 'brand' : 'neutral'}
                  title={result.name || line.name}
                  subtitle={subtitle}
                  subtitleLines={3}
                  right={
                    <View style={styles.rowRight}>
                      {marginPercent !== null ? <Badge value={marginPercent} size="sm" /> : null}
                      <Ionicons name="chevron-forward" size={18} color={palette.text4} />
                    </View>
                  }
                  onPress={() => onOpenProduct(result.productId)}
                  testID={`invoice-result-${i}`}
                />
              );
            }
            return (
              <ListRow
                key={line.id}
                icon="alert-circle-outline"
                iconTone="bad"
                title={result.name || line.name || 'Produit sans nom'}
                subtitle={result.error}
                subtitleLines={6}
                right="none"
                testID={`invoice-result-${i}`}
              />
            );
          })}
        </ListGroup>
      </FadeIn>

      <FadeIn delay={120} offset={8}>
        <View style={styles.after}>
          <Button title="Scanner une autre facture" variant="text" icon="camera-outline" onPress={onNewInvoice} testID="invoice-new" />
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 8 },
  panelTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panelIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  panelKicker: { ...type.calloutStrong, color: palette.onEmerald },
  panelDate: { ...type.footnote, color: palette.onEmerald2 },
  countRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 14 },
  count: { ...type.numHero, color: palette.onEmerald },
  countLabel: { ...type.title3, color: palette.onEmerald, marginBottom: 6, flexShrink: 1 },
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
  heroNote: { ...type.callout, color: palette.text2 },
  noneIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.badBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  noneTitle: { ...type.title3, color: palette.ink },
  noneMeta: { ...type.footnote, color: palette.text3, marginTop: 2 },
  noneText: { ...type.callout, color: palette.text2, marginTop: 8 },
  section: { marginTop: 24, marginBottom: 10 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  after: { marginTop: 16, gap: 4 },
});
