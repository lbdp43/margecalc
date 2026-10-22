/**
 * Tableau de bord (D1 « Émeraude Signature », spec §4.2, FOUNDATION §8).
 *
 *   HeroHeader  avatar · « Bonjour, » / « Bonsoir, » + établissement · Aide & retours
 *               « Marge moyenne » count-up · gap to the objective · distribution bar
 *   StatTiles   Produits · Meilleur produit (overlap the hero by 28)
 *   Card        « Calculer les droits d’alcool » → Calculateur (Tableau de bord stack)
 *   Meters      « Marge par catégorie » with objective ticks + legend
 *   Top & flop  SegmentedControl, rows open the product
 *
 * States: skeletons on first load (never for cached data), empty account
 * (three entry points), error (backend message + Réessayer), offline without
 * cache. Entrances are mount-only, so refetches never replay them.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductWithMargin } from '@margebar/shared';
import {
  Button,
  Card,
  EmptyState,
  ErrorBoundary,
  FadeIn,
  Screen,
  Skeleton,
  SkeletonStatTile,
  countByZone,
  useDelayedLoading,
} from '../../components/ui';
import { FeedbackModal } from '../../components/ui/FeedbackModal';
import { palette, type } from '../../theme';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as productService from '../../services/product.service';
import { useAuthStore } from '../../store/auth.store';
import { useRatesStore } from '../../store/rates.store';
import { useSystemParamsStore } from '../../store/systemParams.store';
import { useMarginThresholds } from '../../utils/marginThresholds';
import { goToProduct, goToProductList, openDutyCalculator, openInvoiceScan, openProductForm } from '../../navigation/routes';
import { DashboardHero, HeroKpi } from './parts/DashboardHero';
import { KpiTiles } from './parts/KpiTiles';
import { DutyActionCard } from './parts/DutyActionCard';
import { CategoryMeters } from './parts/CategoryMeters';
import { TopFlopCard } from './parts/TopFlopCard';
import { averageMargin, categoryStats, errorMessage, greeting as greetingFor, topFlop, withMargin } from './parts/dashboardData';

const OVERLAP = 28;

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const thresholds = useMarginThresholds();
  const rateCount = useRatesStore((s) => s.rates.length) || 13;
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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
    const { top, flop } = topFlop(list, 5);
    return {
      list,
      counts,
      kpi: avg !== null ? ({ avg, total: list.length, counts } as HeroKpi) : null,
      stats: categoryStats(list),
      top,
      flop,
      best: top[0] ?? null,
    };
  }, [hasData, products, thresholds]);

  const state: 'ready' | 'loading' | 'empty' | 'error' | 'offline' = hasData
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
  const { refetch } = query;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <Screen safeTop={false} padded={false} refreshing={query.isRefetching} onRefresh={retry} testID="dashboard-screen">
      <DashboardHero
        greeting={hello}
        businessName={businessName}
        thresholds={thresholds}
        kpi={state === 'ready' ? view.kpi : null}
        state={state === 'offline' ? 'error' : state}
        onFeedback={openFeedback}
        paddingBottom={OVERLAP + 20}
      />

      <View style={styles.body}>
        {state === 'ready' ? (
          <>
            <KpiTiles count={view.list.length} best={view.best} onProducts={openList} onBest={openProduct} />
            <FadeIn delay={180} style={styles.gap12}>
              <DutyActionCard onPress={openCalculator} categories={rateCount} year={year} />
            </FadeIn>
            <ErrorBoundary fallbackMessage="La marge par catégorie n’a pas pu s’afficher.">
              <FadeIn delay={240} style={styles.section}>
                <CategoryMeters stats={view.stats} thresholds={thresholds} counts={view.counts} delay={300} onDetails={openList} />
              </FadeIn>
            </ErrorBoundary>
            <ErrorBoundary fallbackMessage="Le classement n’a pas pu s’afficher.">
              <FadeIn delay={300} style={styles.section}>
                <TopFlopCard top={view.top} flop={view.flop} thresholds={thresholds} onOpen={openProduct} onSeeAll={openList} />
              </FadeIn>
            </ErrorBoundary>
          </>
        ) : state === 'loading' ? (
          showSkeleton ? <DashboardSkeleton /> : <View style={styles.loadingSpacer} />
        ) : (
          <>
            <FadeIn delay={60}>
              <DutyActionCard onPress={openCalculator} categories={rateCount} year={year} />
            </FadeIn>
            {state === 'empty' ? (
              <EmptyState
                marquee
                style={styles.empty}
                title="Aucun produit pour l’instant"
                text="Scannez une bouteille ou une facture : vos marges apparaîtront ici."
                primary={{ label: 'Scanner une bouteille', icon: 'scan', onPress: scanBottle }}
                secondary={[
                  { label: 'Facture', icon: 'receipt-outline', onPress: scanInvoice },
                  { label: 'À la main', icon: 'create-outline', onPress: addManually },
                ]}
              />
            ) : state === 'offline' ? (
              <EmptyState variant="offline" style={styles.empty} primary={{ label: 'Réessayer', icon: 'refresh', onPress: retry }} />
            ) : (
              <FadeIn delay={120} style={styles.section}>
                <ErrorCard
                  message={errorMessage(query.error, 'Le serveur ne répond pas pour le moment. Réessayez dans un instant.')}
                  onRetry={retry}
                  retrying={query.isFetching}
                />
              </FadeIn>
            )}
          </>
        )}
      </View>

      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} screenName="Tableau de bord" />
    </Screen>
  );
}

function ErrorCard({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) {
  return (
    <Card accessibilityLabel={`Impossible de charger vos produits. ${message}`}>
      <View style={styles.errorHead}>
        <View style={styles.errorIcon}>
          <Ionicons name="cloud-offline-outline" size={20} color={palette.bad} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.errorTitle}>Impossible de charger vos produits</Text>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      </View>
      <Button title="Réessayer" icon="refresh" variant="secondary" size="sm" onPress={onRetry} loading={retrying} style={styles.errorBtn} />
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <View accessibilityLabel="Chargement du tableau de bord">
      <View style={styles.skeletonTiles}>
        <SkeletonStatTile style={{ flex: 1 }} />
        <SkeletonStatTile style={{ flex: 1.25 }} />
      </View>
      <View style={[styles.skeletonCard, styles.gap12]}>
        <Skeleton width={48} height={48} radius={14} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton height={14} width="70%" />
          <Skeleton height={10} width="45%" />
        </View>
      </View>
      <View style={styles.section}>
        <Skeleton height={18} width={180} radius={6} style={{ marginBottom: 14 }} />
        <View style={[styles.skeletonCard, { flexDirection: 'column', alignItems: 'stretch', gap: 18 }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Skeleton height={14} width={100} />
              <Skeleton height={6} style={{ flex: 1 }} radius={3} />
              <Skeleton height={14} width={52} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, marginTop: -OVERLAP },
  gap12: { marginTop: 12 },
  section: { marginTop: 24 },
  empty: { marginTop: 8 },
  loadingSpacer: { height: 120 },
  errorHead: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  errorIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.badBg, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { ...type.headline, color: palette.ink },
  errorText: { ...type.callout, color: palette.text2, marginTop: 4 },
  errorBtn: { marginTop: 16, alignSelf: 'flex-start' },
  skeletonTiles: { flexDirection: 'row', gap: 12 },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
  },
});
