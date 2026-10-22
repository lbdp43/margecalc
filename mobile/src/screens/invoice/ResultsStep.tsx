/**
 * Step 4 — what the import did: an emerald summary (count-up of the imported
 * products, created / updated / failed), then one row per line — created and
 * updated rows open the product, failed rows show the backend's error inline
 * and can be sent back to review with « Corriger ».
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
import type { LineOutcome } from './model';

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

  const panel = (
    <View>
      <HeroRings size={300} />
      <View style={styles.panelTop}>
        <View style={[styles.panelIcon, allFailed && styles.panelIconBad]}>
          <Ionicons name={allFailed ? 'alert' : 'checkmark'} size={22} color={palette.em900} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.panelKicker} numberOfLines={1}>
            {summary.supplier ? summary.supplier : 'Import de la facture'}
          </Text>
          {summary.dateLabel ? <Text style={styles.panelDate}>Facture du {summary.dateLabel}</Text> : null}
        </View>
      </View>
      <View style={styles.countRow}>
        <AnimatedNumber value={ok} format={(v) => String(Math.round(v))} style={styles.count} />
        <Text style={styles.countLabel}>{ok > 1 ? 'produits importés' : 'produit importé'}</Text>
      </View>
      <View style={styles.badges}>
        {summary.createdCount > 0 ? <Badge variant="onEmerald" icon="add-circle-outline" label={plural(summary.createdCount, 'créé', 'créés')} /> : null}
        {summary.updatedCount > 0 ? <Badge variant="onEmerald" icon="sync-outline" label={plural(summary.updatedCount, 'mis à jour', 'mis à jour')} /> : null}
        {failed > 0 ? <Badge variant="onEmerald" icon="alert-circle-outline" label={plural(failed, 'en échec', 'en échec')} /> : null}
      </View>
    </View>
  );

  return (
    <Screen
      header={<NavBar title="Scanner une facture" />}
      testID="invoice-results"
      stickyFooter={
        <StickyActionBar primary={{ title: 'Voir mes produits', trailingIcon: 'arrow-forward', onPress: onSeeProducts, testID: 'invoice-see-products' }} />
      }
    >
      <FadeIn offset={8}>
        <Card variant="emeraldPanel" panel={panel} padding={14} style={styles.hero}>
          <Text style={styles.heroNote}>
            {allFailed
              ? 'Aucun produit n’a été importé : corrigez les lignes ci-dessous, puis relancez l’import.'
              : summary.updatedCount > 0
                ? 'Les produits déjà suivis gardent leur prix de vente : seul leur prix d’achat est mis à jour.'
                : 'Les prix de vente calculés ×4 se modifient à tout moment dans chaque fiche.'}
          </Text>
        </Card>
      </FadeIn>

      <SectionHeader title="Détail de l’import" style={styles.section} />
      <FadeIn delay={80} offset={8}>
        <ListGroup>
          {summary.outcomes.map(({ line, result }, i) => {
            if (result.ok) {
              const created = result.action === 'created';
              const subtitle = created
                ? `Créé · ${formatEuro(result.sellingPriceTTC)} TTC${result.priceDerived ? ' · calculé ×4' : ''}`
                : `Mis à jour · achat ${formatEuro(line.purchasePriceHT)} HT`;
              return (
                <ListRow
                  key={line.id}
                  icon={created ? 'checkmark-circle-outline' : 'sync-outline'}
                  iconTone={created ? 'brand' : 'neutral'}
                  title={result.name || line.name}
                  subtitle={subtitle}
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
                subtitleLines={3}
                right="none"
                testID={`invoice-result-${i}`}
              />
            );
          })}
        </ListGroup>
      </FadeIn>

      <FadeIn delay={120} offset={8}>
        <View style={styles.after}>
          {failed > 0 ? (
            <Button
              title={failed > 1 ? `Corriger les ${failed} lignes` : 'Corriger la ligne'}
              variant="secondary"
              icon="create-outline"
              onPress={onFix}
              testID="invoice-fix"
            />
          ) : null}
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
  panelIconBad: { backgroundColor: palette.badOnEmerald },
  flex: { flex: 1, minWidth: 0 },
  panelKicker: { ...type.calloutStrong, color: palette.onEmerald },
  panelDate: { ...type.footnote, color: palette.onEmerald2 },
  countRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 14 },
  count: { ...type.numHero, color: palette.onEmerald },
  countLabel: { ...type.title3, color: palette.onEmerald, marginBottom: 6, flexShrink: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  heroNote: { ...type.footnote, color: palette.text2 },
  section: { marginTop: 24, marginBottom: 10 },
  after: { marginTop: 16, gap: 4 },
});
