/**
 * Product detail (Produits › ProductDetail).
 *
 *   NavBar (back · title once the name scrolls away · « … » actions)
 *   with a photo: the whole bottle (contain) over its blurred thumbnail, then the name
 *   without one: icon tile · name · category · meta · « Ajouter une photo »
 *   key numbers with count-up: Marge · Coefficient · Gain par dose · Gain par bouteille/fût
 *   services: Prix TTC / HT · Coût · Gain · margin badge (tap → quick price change)
 *   Achat & fiscalité facts · purchase-price history (sparkline)
 *   Modifier le produit · Supprimer le produit
 *
 * Opens instantly from the list cache (placeholder), then refreshes: detail and
 * history use staleTime 0 + refetchOnMount 'always', and refetch on focus, so an
 * edit made in the form shows at once (RC3). What the detail learns is merged
 * back into the list, so the two never disagree. The offline copy never holds
 * the full photo (list/detailCache).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { calculateServingMargin, ProductWithMargin } from '@margebar/shared';
import {
  Button,
  Card,
  EmptyState,
  FadeIn,
  IconButton,
  NavBar,
  ProductActionsSheet,
  Screen,
  SectionHeader,
  ValueRow,
  categoryIcon,
  servingLabel,
  sortedServings,
  toast,
  useDelayedLoading,
} from '../../components/ui';
import { servingIconName } from '../../components/ui/ServingTypeIcon';
import { layout, marginColors, palette, type } from '../../theme';
import { formatCoeff, formatDegree, formatEuro, formatNumber, formatPercent, formatVolumeCl, NBSP, plural } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';
import { afterProductDeleted, goToProduct, goToProductList, openProductForm } from '../../navigation/routes';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as productService from '../../services/product.service';
import type { PriceHistoryEntry } from '../../services/product.service';
import {
  DetailIdentity,
  DetailSkeleton,
  dosesLabel,
  formatShortDate,
  KeyTile,
  keyValueSize,
  PhotoHero,
  PriceHistoryCard,
  ServiceFigures,
  ServiceRow,
} from './list/DetailParts';
import { persistableProduct, pruneDetailCaches, useLeanOfflineQuery } from './list/detailCache';
import { PriceEditSheet, PriceEditTarget } from './list/PriceEditSheet';
import { apiStatus, loadErrorMessage, useProductActions } from './list/productActions';

type Props = NativeStackScreenProps<any, 'ProductDetail'>;

/** « bouteille », or « fût » for kegs (10 L and more). */
function containerNoun(cl: number): string {
  return cl >= 1000 ? 'fût' : 'bouteille';
}

/** A long supplier reads better under its label than squeezed beside it. */
const LONG_VALUE = 24;

function servicesOf(product: ProductWithMargin): ServiceFigures[] {
  const list = sortedServings(product);
  const out: ServiceFigures[] = [];
  list.forEach((s, i) => {
    if (!s.servingType) return;
    try {
      const r = calculateServingMargin(product.purchasePriceHT, product.containerVolumeCl, product.tvaRate, s.servingType, s.sellingPriceTTC);
      out.push({
        key: s.servingTypeId,
        label: servingLabel(s.servingType.name, s.servingType.volumeCl),
        // The one service-icon mapping (form chips, Réglages, here).
        icon: servingIconName(s.servingType.name, s.servingType.volumeCl),
        priceTTC: r.sellingPriceTTC,
        priceHT: r.sellingPriceHT,
        cost: r.costPerServingHT,
        gain: r.marginPerServingHT,
        gainPerContainer: r.marginPerContainer,
        perContainer: r.servingsPerContainer,
        margin: r.marginPercent,
        primary: i === 0 && list.length > 1,
      });
    } catch {
      // A service priced at 0 € cannot be computed: skip it rather than crash.
    }
  });
  if (out.length) return out;
  const c = product.computed;
  return [
    {
      key: 'dose',
      label: `Dose${NBSP}${formatVolumeCl(product.doseVolumeCl)}`,
      icon: categoryIcon(product.category?.slug),
      priceTTC: c.sellingPriceTTC,
      priceHT: c.sellingPriceHT,
      cost: c.costPerDoseHT,
      gain: c.marginPerDoseHT,
      gainPerContainer: c.marginPerContainer,
      perContainer: c.glassesPerContainer,
      margin: c.marginPercent,
      primary: false,
    },
  ];
}

/** What the list card shows: when it differs, the list entry is refreshed from the detail. */
function listSignature(p: ProductWithMargin): string {
  const servings = (p.servings ?? []).map((s) => `${s.servingTypeId}:${s.sellingPriceTTC}`).join(',');
  return [p.updatedAt, p.name, p.categoryId, p.purchasePriceHT, p.sellingPriceTTC, p.containerVolumeCl, p.computed?.marginPercent, servings, p.thumbnailUrl?.length ?? 0].join('|');
}

export function ProductDetailScreen({ route, navigation: nav }: Props) {
  const navigation = nav as any;
  const productId = (route.params as { productId?: string } | undefined)?.productId;
  const queryClient = useQueryClient();
  const t = useMarginThresholds();
  const actions = useProductActions();
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [priceTarget, setPriceTarget] = useState<PriceEditTarget | null>(null);
  const [titleShown, setTitleShown] = useState(false);
  const [pulling, setPulling] = useState(false);
  const titleRef = useRef(false);
  /** Scroll offset past which the name is hidden under the NavBar (measured). */
  const titleAfter = useRef(Number.POSITIVE_INFINITY);
  const { width } = useWindowDimensions();
  // Narrow phones: the tile labels need the room the decorative icons take.
  const tileIcons = width >= 380;
  // The content column (Screen gutters), and the text width inside one of the two
  // tile columns (gap 10, padding 14, border 1).
  const contentWidth = width - layout.gutter * 2;
  const tileTextWidth = (contentWidth - 10) / 2 - 30;

  useEffect(() => {
    pruneDetailCaches();
  }, []);

  // Open instantly with what the list already knows (no photo yet), then refresh.
  const fromList = useMemo(
    () => queryClient.getQueryData<ProductWithMargin[]>(productService.productKeys.list)?.find((p) => p.id === productId),
    [queryClient, productId],
  );

  const q = useLeanOfflineQuery<ProductWithMargin>(
    productService.productKeys.detail(productId ?? ''),
    () => productService.getProduct(productId as string),
    persistableProduct,
    {
      enabled: !!productId && !deleted,
      staleTime: 0,
      refetchOnMount: 'always',
      placeholderData: fromList,
    },
  );
  const history = useOfflineQuery<PriceHistoryEntry[]>(productService.productKeys.priceHistory(productId ?? ''), () => productService.getPriceHistory(productId as string), {
    enabled: !!productId && !deleted,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Keep the last known product on screen while leaving after a delete.
  const last = useRef<ProductWithMargin | undefined>(undefined);
  if (q.data) last.current = q.data;
  const product = q.data ?? last.current;
  const isFull = !!q.data && !q.isPlaceholderData && !q.isCachedData;

  // The detail just learnt something the list card does not show yet (a price
  // changed on another device): update that card, so the two never disagree.
  useEffect(() => {
    const d = q.data;
    if (!d || !isFull || deleted || !q.isFetchedAfterMount) return;
    const list = queryClient.getQueryData<ProductWithMargin[]>(productService.productKeys.list);
    const i = list ? list.findIndex((p) => p.id === d.id) : -1;
    if (!list || i < 0 || listSignature(list[i]) === listSignature(d)) return;
    const next = [...list];
    next[i] = { ...list[i], ...persistableProduct(d) };
    queryClient.setQueryData(productService.productKeys.list, next);
  }, [q.data, isFull, deleted, q.isFetchedAfterMount, queryClient]);

  // Coming back from the form (or another tab): refresh at once.
  const refetchRef = useRef(() => {});
  refetchRef.current = () => {
    if (deleted || !productId) return;
    q.refetch();
    history.refetch();
  };
  const onPull = useCallback(async () => {
    setPulling(true);
    try {
      await Promise.all([q.refetch(), history.refetch()]);
    } finally {
      setPulling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.refetch, history.refetch]);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetchRef.current();
    }, []),
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const show = e.nativeEvent.contentOffset.y > titleAfter.current;
    if (show !== titleRef.current) {
      titleRef.current = show;
      setTitleShown(show);
    }
  }, []);
  // Show the NavBar title once the name has scrolled under the bar (above
  // « Ajouter une photo » when there is no photo).
  const belowName = useRef(0);
  const onTopLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    titleAfter.current = y + height - 24 - belowName.current;
  }, []);

  const edit = useCallback(() => {
    if (product) openProductForm(navigation, { productId: product.id });
  }, [navigation, product]);
  const duplicate = useCallback(() => {
    if (product) actions.duplicate(product, { onOpen: (id) => goToProduct(navigation, id) });
  }, [actions, navigation, product]);
  const remove = useCallback(async () => {
    if (!product || deleting) return;
    const ok = await actions.remove(product, { onConfirmed: () => setDeleting(true), beforeCacheUpdate: () => setDeleted(true) });
    if (ok) afterProductDeleted(navigation);
    else setDeleting(false);
  }, [actions, navigation, product, deleting]);

  // A toast left over from an earlier action must not come back after a sheet.
  const openActions = useCallback(() => {
    toast.clear();
    setActionsOpen(true);
  }, []);

  const services = useMemo(() => (product ? servicesOf(product) : []), [product]);
  const hasRealServings = !!product?.servings?.length;

  // ── states without a product ──
  const showSkeleton = useDelayedLoading(!product && (q.isLoading || q.isFetching));
  const offlineEmpty = useDelayedLoading(!product && !!q.isOffline, 400);
  const notFound = !productId || (!product && apiStatus(q.error) === 404);
  const loadError = !product && !!q.error && !q.isFetching && !notFound;

  const header = (
    <NavBar
      title={titleShown && product ? product.name : ''}
      trailing={
        product && !deleted ? (
          <IconButton icon="ellipsis-horizontal" onPress={openActions} accessibilityLabel="Plus d’actions" testID="detail-more" />
        ) : null
      }
    />
  );

  if (!product) {
    let body: React.ReactNode = null;
    if (notFound) {
      body = (
        <EmptyState
          icon="search"
          title="Produit introuvable"
          text="Il a peut-être été supprimé, ou le lien n’est plus valable."
          primary={{ label: 'Voir mes produits', icon: 'grid-outline', onPress: () => goToProductList(navigation) }}
        />
      );
    } else if (offlineEmpty) {
      body = <EmptyState variant="offline" text="Ce produit s’affichera dès le retour du réseau." />;
    } else if (loadError) {
      body = (
        <EmptyState
          icon="alert-circle-outline"
          title="Impossible d’afficher ce produit"
          text={loadErrorMessage(q.error)}
          primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => q.refetch() }}
        />
      );
    } else if (showSkeleton) {
      body = <DetailSkeleton />;
    }
    return <Screen header={header}>{body}</Screen>;
  }

  const c = product.computed;
  const zone = getMarginZone(c.marginPercent, t);
  const noun = containerNoun(product.containerVolumeCl);
  const primary = services[0];
  const icon = categoryIcon(product.category?.slug);
  const meta = [formatVolumeCl(product.containerVolumeCl), product.alcoholDegree > 0 ? formatDegree(product.alcoholDegree) : null, product.supplier || null]
    .filter(Boolean)
    .join(' · ');
  const tva = product.tvaRate * 100;
  const historyEntries = history.data ?? [];
  // A photo is known from the detail (imageUrl) or already from the list (thumbnail / hasImage).
  const hasPhoto = !!(product.imageUrl || product.thumbnailUrl || product.hasImage);
  const updated = formatShortDate(product.updatedAt);
  const doses = dosesLabel(c.glassesPerContainer);
  // A free product (tap water…) has no cost: a coefficient means nothing there.
  const coeffKnown = c.costPerDoseHT > 0 && isFinite(c.coefficient);
  const fmtMargin = (n: number) => formatPercent(n);
  const fmtCoeff = (n: number) => formatCoeff(n);
  const fmtGain = (n: number) => formatEuro(n, { sign: true });
  const tileSize = keyValueSize(
    [fmtMargin(c.marginPercent), coeffKnown ? fmtCoeff(c.coefficient) : '—', fmtGain(c.marginPerDoseHT), fmtGain(c.marginPerContainer)],
    tileTextWidth,
  );
  const supplierLong = (product.supplier ?? '').length > LONG_VALUE;
  belowName.current = hasPhoto ? 0 : 58; // the tonal button (44) and its margin (14)

  return (
    <Screen header={header} onScroll={onScroll} refreshing={pulling} onRefresh={onPull}>
      <FadeIn>
        <View onLayout={onTopLayout}>
          {hasPhoto ? (
            <View style={styles.photo}>
              <PhotoHero
                imageUrl={isFull ? product.imageUrl : null}
                thumbnailUrl={product.thumbnailUrl}
                name={product.name}
                pending={!isFull && !q.isOffline && q.isFetching}
              />
            </View>
          ) : null}
          <DetailIdentity
            name={product.name}
            categoryName={product.category?.name}
            icon={icon}
            meta={meta}
            withTile={!hasPhoto}
            onAddPhoto={!hasPhoto && !deleted ? edit : undefined}
          />
        </View>
      </FadeIn>

      <FadeIn delay={60} style={styles.tiles}>
        <View style={styles.tileRow}>
          <KeyTile
            label="Marge"
            value={c.marginPercent}
            format={fmtMargin}
            size={tileSize}
            zone={zone}
            highlight
            icon={tileIcons ? 'pie-chart-outline' : undefined}
            caption={`objectif ${formatPercent(t.good, 0)}`}
            a11y={`Marge ${formatNumber(c.marginPercent, 1)} pour cent, ${marginColors[zone].label}, objectif ${formatNumber(t.good, 0)} pour cent`}
          />
          <KeyTile
            label="Coefficient"
            value={coeffKnown ? c.coefficient : null}
            format={fmtCoeff}
            size={tileSize}
            icon={tileIcons ? 'layers-outline' : undefined}
            caption={coeffKnown ? 'prix HT ÷ coût' : 'coût nul'}
            delay={60}
            a11y={coeffKnown ? `Coefficient ${formatNumber(c.coefficient, 2)}, prix hors taxes divisé par le coût` : 'Coefficient non calculable, coût nul'}
          />
        </View>
        <View style={styles.tileRow}>
          <KeyTile
            label="Gain par dose"
            value={c.marginPerDoseHT}
            format={fmtGain}
            size={tileSize}
            valueColor={marginColors[zone].fg}
            icon={tileIcons ? 'cash-outline' : undefined}
            caption={primary ? `HT · ${primary.label}` : 'HT'}
            delay={120}
            a11y={`Gain par dose ${formatEuro(c.marginPerDoseHT)} hors taxes${primary ? `, ${primary.label}` : ''}`}
          />
          <KeyTile
            label={`Gain par ${noun}`}
            value={c.marginPerContainer}
            format={fmtGain}
            size={tileSize}
            icon={tileIcons ? (noun === 'fût' ? 'beer-outline' : 'wine-outline') : undefined}
            caption={doses}
            delay={180}
            a11y={`Gain par ${noun} ${formatEuro(c.marginPerContainer)} hors taxes, ${doses}`}
          />
        </View>
      </FadeIn>

      <FadeIn delay={120}>
        <SectionHeader
          title={hasRealServings ? 'Services' : 'Service'}
          meta={hasRealServings ? plural(services.length, 'service') : 'dose du produit'}
          style={styles.section}
        />
        <Card noPadding style={styles.servicesCard}>
          {services.map((s, i) => (
            <ServiceRow
              key={s.key}
              s={s}
              zone={getMarginZone(s.margin, t)}
              containerNoun={noun}
              contentWidth={contentWidth}
              last={i === services.length - 1}
              onPress={
                hasRealServings
                  ? () => {
                      const ps = sortedServings(product).find((x) => x.servingTypeId === s.key);
                      if (!ps?.servingType) return;
                      toast.clear();
                      setPriceTarget({ servingType: ps.servingType, label: s.label, price: ps.sellingPriceTTC });
                    }
                  : edit
              }
            />
          ))}
        </Card>
      </FadeIn>

      <FadeIn delay={160}>
        <SectionHeader title="Achat et fiscalité" style={styles.section} />
        <Card padding={16} style={styles.factsCard}>
          <ValueRow label="Prix d’achat HT" qualifier={`par ${noun}`} value={formatEuro(product.purchasePriceHT)} />
          <ValueRow label="Contenance" value={formatVolumeCl(product.containerVolumeCl)} />
          <ValueRow label="Degré d’alcool" value={product.alcoholDegree > 0 ? formatDegree(product.alcoholDegree) : 'Sans alcool'} />
          <ValueRow label="TVA" value={formatPercent(tva, Number.isInteger(Math.round(tva * 10) / 10) ? 0 : 1)} />
          <ValueRow
            label="Fournisseur"
            value={product.supplier || 'Non renseigné'}
            valueColor={product.supplier ? undefined : palette.text3}
            style={supplierLong ? styles.stackedRow : undefined}
            last
          />
        </Card>
      </FadeIn>

      {historyEntries.length ? (
        <FadeIn delay={40}>
          <SectionHeader title="Historique du prix d’achat" meta={plural(historyEntries.length, 'changement')} style={styles.section} />
          <PriceHistoryCard entries={historyEntries} />
        </FadeIn>
      ) : null}

      <View style={styles.actions}>
        <Button title="Modifier le produit" icon="create-outline" onPress={edit} fullWidth testID="detail-edit" />
        <Button title="Supprimer le produit" icon="trash-outline" variant="destructive" onPress={remove} loading={deleting} fullWidth testID="detail-delete" />
        {updated ? <Text style={styles.updated}>Modifié le {updated}</Text> : null}
      </View>

      <ProductActionsSheet
        product={actionsOpen ? product : null}
        onClose={() => setActionsOpen(false)}
        onEdit={edit}
        onDuplicate={duplicate}
        onDelete={remove}
      />
      <PriceEditSheet product={product} target={priceTarget} onClose={() => setPriceTarget(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { marginBottom: 20 },
  tiles: { marginTop: 20, gap: 10 },
  tileRow: { flexDirection: 'row', gap: 10 },
  section: { marginTop: 28, marginBottom: 10 },
  servicesCard: { overflow: 'hidden' },
  factsCard: { paddingVertical: 4 },
  // ValueRow with its value under the label (a long supplier never truncates the label).
  stackedRow: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2 },
  actions: { marginTop: 28, gap: 6 },
  updated: { ...type.footnote, color: palette.text3, textAlign: 'center', marginTop: 6 },
});
