/**
 * Tableau de bord (D1 « Émeraude Signature », spec §4.2, FOUNDATION §8).
 *
 *   HeroHeader  avatar · « Bonjour, » / « Bonsoir, » + établissement · Aide & retours
 *               « Marge moyenne » count-up · gap to the objective · distribution bar
 *   StatTiles   Produits · Meilleur produit (overlap the hero by 28)
 *   Install     « Installer MargeBar Pro » (web only, while installable; InstallAppCardSlot)
 *   Card        « Calculer les droits d’alcool » → Calculateur (Tableau de bord stack)
 *   Meters      « Marge par catégorie » with objective ticks + legend
 *   Top & flop  SegmentedControl (split at the objective), rows open the product
 *
 * States:
 * - loading: skeleton tiles with the real tiles' height, then the real duty
 *   card (it needs no product data), then a meters skeleton. Never for cached
 *   data. The duty card keeps its position when the data arrives.
 * - empty (first run): the hero becomes a welcome block with the lime
 *   « Scanner une bouteille »; below it, the two other ways to add products
 *   (led by « Reprendre votre calcul » when a calculation was kept from the
 *   calculator before signing up, ./parts/savedCalcs) and the duty card.
 * - error: the backend message + Réessayer (network icon only for network
 *   failures). Offline without cache: the offline EmptyState.
 * Entrances are mount-only, so refetches never replay them.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductWithMargin } from '@margebar/shared';
import {
  Button,
  Card,
  EmptyState,
  ErrorBoundary,
  FadeIn,
  InstallAppCardSlot,
  ListGroup,
  ListRow,
  Screen,
  Skeleton,
  SkeletonStatTile,
  countByZone,
  useDelayedLoading,
} from '../../components/ui';
import { FeedbackModal } from '../../components/ui/FeedbackModal';
import { palette, radius, type } from '../../theme';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import { isNetworkError } from '../../services/offline';
import * as productService from '../../services/product.service';
import { useAuthStore } from '../../store/auth.store';
import { useRatesStore } from '../../store/rates.store';
import { useSystemParamsStore } from '../../store/systemParams.store';
import { formatDegree, formatEuro, formatVolumeCl, NBSP } from '../../utils/format';
import { useMarginThresholds } from '../../utils/marginThresholds';
import { goToProduct, goToProductList, openDutyCalculator, openInvoiceScan, openProductForm } from '../../navigation/routes';
import { DashboardHero, HeroKpi } from './parts/DashboardHero';
import { KpiTiles, kpiTileLayout } from './parts/KpiTiles';
import { DutyActionCard } from './parts/DutyActionCard';
import { CategoryMeters } from './parts/CategoryMeters';
import { TopFlopCard } from './parts/TopFlopCard';
import { averageMargin, byMargin, categoryStats, errorMessage, greeting as greetingFor, topFlop, withMargin } from './parts/dashboardData';
import { calcPrefill, loadSavedCalcs } from './parts/savedCalcs';
import type { SavedCalc } from '../products/form/SavedCalcsSheet';

const OVERLAP = 28;

type DashState = 'ready' | 'loading' | 'empty' | 'error' | 'offline';

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const thresholds = useMarginThresholds();
  const rates = useRatesStore((s) => s.rates);
  const rateCount = rates.length || 13;
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // The calculation made before signing up (« Gardez ce calcul »), newest first.
  const [savedCalc, setSavedCalc] = useState<SavedCalc | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      loadSavedCalcs().then((list) => {
        if (alive) setSavedCalc(list[0] ?? null);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const query = useOfflineQuery<ProductWithMargin[]>(['products'], () => productService.getProducts());
  const products = query.data as ProductWithMargin[] | undefined;
  const hasData = Array.isArray(products);
  const showSkeleton = useDelayedLoading(!hasData && query.isLoading);

  const businessName = user?.businessName?.trim() || 'Mon établissement';
  // Recomputed on every render: the dashboard stays mounted across 18 h.
  const hello = greetingFor();

  const view = useMemo(() => {
    const list = hasData ? withMargin(products as ProductWithMargin[]) : [];
    const avg = averageMargin(list);
    const counts = countByZone(list, thresholds);
    const { top, flop } = topFlop(list, thresholds.good, 5);
    return {
      list,
      kpi: avg !== null ? ({ avg, total: list.length, counts } as HeroKpi) : null,
      stats: categoryStats(list),
      top,
      flop,
      best: byMargin(list)[0] ?? null,
    };
  }, [hasData, products, thresholds]);

  const state: DashState = hasData
    ? view.list.length > 0
      ? 'ready'
      : 'empty'
    : query.isOffline
      ? 'offline'
      : query.isError
        ? 'error'
        : 'loading';

  // Navigation callbacks (stable, rows are memoised)
  const openProduct = useCallback((id: string) => goToProduct(navigation, id), [navigation]);
  const openList = useCallback(() => goToProductList(navigation), [navigation]);
  const openCalculator = useCallback(() => openDutyCalculator(navigation), [navigation]);
  const openFeedback = useCallback(() => setFeedbackOpen(true), []);
  const scanBottle = useCallback(() => openProductForm(navigation, {}), [navigation]);
  const scanInvoice = useCallback(() => openInvoiceScan(navigation), [navigation]);
  const addManually = useCallback(() => openProductForm(navigation, { start: 'form' }), [navigation]);
  const resumeCalc = useCallback(() => {
    if (savedCalc) openProductForm(navigation, { scanData: calcPrefill(savedCalc) });
  }, [navigation, savedCalc]);
  const savedCalcLabel = savedCalc
    ? [rates.find((r) => r.slug === savedCalc.fiscalCategory)?.label, formatVolumeCl(savedCalc.volumeCl), savedCalc.degree ? formatDegree(savedCalc.degree) : null]
        .filter(Boolean)
        .join(' · ')
    : '';
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const tiles = kpiTileLayout(width);
  // What overlaps the hero, above the duty card (null: the duty card does).
  const lead =
    state === 'ready' ? (
      <KpiTiles count={view.list.length} categories={view.stats.length} best={view.best} onProducts={openList} onBest={openProduct} />
    ) : state === 'loading' ? (
      <View style={{ height: tiles.height }}>{showSkeleton ? <SkeletonTiles height={tiles.height} flexBest={tiles.flexBest} /> : null}</View>
    ) : state === 'empty' ? (
      <FadeIn delay={120}>
        <ListGroup>
          {savedCalc ? (
            <ListRow
              icon="calculator-outline"
              title="Reprendre votre calcul"
              subtitle={savedCalcLabel}
              detail={`${formatEuro(savedCalc.prixHTAvecDroits)} HT avec droits`}
              onPress={resumeCalc}
              testID="dashboard-resume-calc"
            />
          ) : null}
          <ListRow
            icon="receipt-outline"
            title="Importer une facture"
            subtitle={`Plusieurs produits d’un${NBSP}coup`}
            onPress={scanInvoice}
            testID="dashboard-add-invoice"
          />
          <ListRow
            icon="create-outline"
            title="Saisir à la main"
            subtitle={`Nom, prix d’achat et prix de${NBSP}vente`}
            onPress={addManually}
            testID="dashboard-add-manual"
          />
        </ListGroup>
      </FadeIn>
    ) : null;

  return (
    <Screen safeTop={false} padded={false} refreshing={query.isRefetching} onRefresh={retry} testID="dashboard-screen">
      <DashboardHero
        greeting={hello}
        businessName={businessName}
        thresholds={thresholds}
        kpi={state === 'ready' ? view.kpi : null}
        state={state === 'offline' ? 'error' : state}
        onFeedback={openFeedback}
        onScan={scanBottle}
        paddingBottom={OVERLAP + 20}
      />

      <View style={styles.body}>
        {lead}
        {/* « Installer MargeBar Pro » (web, installable, not snoozed): between the
            tiles and the duty card; it expands / collapses with its own gap. */}
        <InstallAppCardSlot topGap={lead ? 12 : 0} bottomGap={lead ? 0 : 12} delay={state === 'ready' ? 150 : 60} />
        {/* Same tree position in every state: it never remounts or jumps. */}
        <FadeIn delay={state === 'ready' ? 180 : 60} style={lead ? styles.gap12 : null}>
          <DutyActionCard onPress={openCalculator} categories={rateCount} year={year} />
        </FadeIn>
        {state === 'ready' ? (
          <>
            <ErrorBoundary fallbackMessage="La marge par catégorie n’a pas pu s’afficher.">
              <FadeIn delay={240} style={styles.section}>
                <CategoryMeters stats={view.stats} thresholds={thresholds} delay={300} onDetails={openList} />
              </FadeIn>
            </ErrorBoundary>
            <ErrorBoundary fallbackMessage="Le classement n’a pas pu s’afficher.">
              <FadeIn delay={300} style={styles.section}>
                <TopFlopCard top={view.top} flop={view.flop} thresholds={thresholds} onOpen={openProduct} onSeeAll={openList} />
              </FadeIn>
            </ErrorBoundary>
          </>
        ) : state === 'loading' ? (
          showSkeleton ? <MetersSkeleton /> : null
        ) : state === 'offline' ? (
          // The banner says « Hors ligne · vos données restent consultables »: say
          // why nothing shows here (never loaded on this device) instead of repeating it.
          <EmptyState
            variant="offline"
            title="Pas encore de données hors ligne"
            text="Vos produits s’afficheront dès le retour du réseau, puis resteront consultables sans connexion."
            style={styles.empty}
            primary={{ label: 'Réessayer', icon: 'refresh', onPress: retry }}
          />
        ) : state === 'error' ? (
          <FadeIn delay={120} style={styles.section}>
            <ErrorCard
              message={errorMessage(query.error, 'Le serveur ne répond pas pour le moment. Réessayez dans un instant.')}
              network={isNetworkError(query.error)}
              onRetry={retry}
              retrying={query.isFetching}
            />
          </FadeIn>
        ) : null}
      </View>

      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} screenName="Tableau de bord" />
    </Screen>
  );
}

function ErrorCard({ message, network, onRetry, retrying }: { message: string; network: boolean; onRetry: () => void; retrying: boolean }) {
  return (
    <Card accessibilityLabel={`Impossible de charger vos produits. ${message}`}>
      <View style={styles.errorHead}>
        <View style={styles.errorIcon}>
          <Ionicons name={network ? 'cloud-offline-outline' : 'alert-circle-outline'} size={20} color={palette.bad} />
        </View>
        <View style={styles.errorTexts}>
          <Text style={styles.errorTitle}>Impossible de charger vos produits</Text>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      </View>
      <Button title="Réessayer" icon="refresh" variant="secondary" size="sm" onPress={onRetry} loading={retrying} style={styles.errorBtn} />
    </Card>
  );
}

/** Mirrors KpiTiles: same height and flex ratio, so nothing moves when the data arrives. */
function SkeletonTiles({ height, flexBest }: { height: number; flexBest: number }) {
  return (
    <View style={styles.skeletonTiles} accessibilityLabel="Chargement du tableau de bord">
      <SkeletonStatTile style={{ flex: 1, height }} />
      <SkeletonStatTile style={{ flex: flexBest, height }} />
    </View>
  );
}

/** Mirrors CategoryMeters (header + 48 px rows). */
function MetersSkeleton() {
  return (
    <View style={styles.section}>
      <View style={styles.skeletonHeader}>
        <Skeleton height={18} width={180} radius={6} />
      </View>
      <View style={styles.skeletonCard}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonRow}>
            <Skeleton height={14} width={100} />
            <Skeleton height={6} style={styles.skeletonMeter} radius={3} />
            <Skeleton height={14} width={52} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, marginTop: -OVERLAP },
  gap12: { marginTop: 12 },
  section: { marginTop: 24 },
  empty: { marginTop: 8 },
  errorHead: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  errorIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.badBg, alignItems: 'center', justifyContent: 'center' },
  errorTexts: { flex: 1, minWidth: 0 },
  errorTitle: { ...type.headline, color: palette.ink },
  errorText: { ...type.callout, color: palette.text2, marginTop: 4 },
  errorBtn: { marginTop: 16, alignSelf: 'flex-start' },
  skeletonTiles: { flexDirection: 'row', gap: 12 },
  skeletonHeader: { height: 40, justifyContent: 'center', marginBottom: 4 },
  skeletonCard: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48 },
  skeletonMeter: { flex: 1 },
});
