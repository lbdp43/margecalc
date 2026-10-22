/**
 * Product detail (Produits › ProductDetail).
 *
 *   NavBar (back · title once scrolled · « … » actions)
 *   hero: photo (GET /api/products/:id imageUrl, cross-fade) or emerald placeholder
 *   name · category badge · meta
 *   key numbers with count-up: Marge · Coefficient · Gain par dose · Gain par bouteille/fût
 *   services: Prix TTC / HT · Coût · Gain · margin badge (tap → quick price change)
 *   Achat & fiscalité facts · purchase-price history (sparkline)
 *   Modifier le produit · Supprimer le produit
 *
 * Opens instantly from the list cache (placeholder), then refreshes: detail and
 * history use staleTime 0 + refetchOnMount 'always', and refetch on focus, so an
 * edit made in the form shows at once (RC3).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { calculateServingMargin, ProductWithMargin } from '@margebar/shared';
import {
  Badge,
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
  useDelayedLoading,
} from '../../components/ui';
import type { IconName } from '../../components/ui';
import { marginColors, palette, type } from '../../theme';
import { formatCoeff, formatDegree, formatEuro, formatNumber, formatPercent, formatVolumeCl, NBSP, plural } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';
import { afterProductDeleted, goToProduct, goToProductList, openProductForm } from '../../navigation/routes';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as productService from '../../services/product.service';
import type { PriceHistoryEntry } from '../../services/product.service';
import { DetailHero, DetailSkeleton, formatShortDate, HERO_HEIGHT, KeyTile, PriceHistoryCard, ServiceFigures, ServiceRow } from './list/DetailParts';
import { PriceEditSheet, PriceEditTarget } from './list/PriceEditSheet';
import { apiErrorMessage, apiStatus, useProductActions } from './list/productActions';

type Props = NativeStackScreenProps<any, 'ProductDetail'>;

const SERVICE_ICONS: { test: RegExp; icon: IconName }[] = [
  { test: /shot/i, icon: 'flask-outline' },
  { test: /vin|verre de vin|coupe|champ/i, icon: 'wine-outline' },
  { test: /demi|pinte|bi[eè]re|galopin|pression/i, icon: 'beer-outline' },
  { test: /verre/i, icon: 'wine-outline' },
];
function serviceIcon(name: string, fallback: IconName): IconName {
  return SERVICE_ICONS.find((s) => s.test.test(name))?.icon ?? fallback;
}

/** « bouteille », or « fût » for kegs (10 L and more). */
function containerNoun(cl: number): string {
  return cl >= 1000 ? 'fût' : 'bouteille';
}

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
        icon: serviceIcon(s.servingType.name, categoryIcon(product.category?.slug)),
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
  const titleRef = useRef(false);

  // Open instantly with what the list already knows (no photo yet), then refresh.
  const fromList = useMemo(
    () => queryClient.getQueryData<ProductWithMargin[]>(['products'])?.find((p) => p.id === productId),
    [queryClient, productId],
  );

  const q = useOfflineQuery<ProductWithMargin>(['product', productId], () => productService.getProduct(productId as string), {
    enabled: !!productId && !deleted,
    staleTime: 0,
    refetchOnMount: 'always',
    placeholderData: fromList,
  });
  const history = useOfflineQuery<PriceHistoryEntry[]>(['priceHistory', productId], () => productService.getPriceHistory(productId as string), {
    enabled: !!productId && !deleted,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Keep the last known product on screen while leaving after a delete.
  const last = useRef<ProductWithMargin | undefined>(undefined);
  if (q.data) last.current = q.data;
  const product = q.data ?? last.current;
  const isFull = !!q.data && !q.isPlaceholderData;

  // Coming back from the form (or another tab): refresh at once.
  const refetchRef = useRef(() => {});
  refetchRef.current = () => {
    if (deleted || !productId) return;
    q.refetch();
    history.refetch();
  };
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
    const show = e.nativeEvent.contentOffset.y > HERO_HEIGHT + 56;
    if (show !== titleRef.current) {
      titleRef.current = show;
      setTitleShown(show);
    }
  }, []);

  const edit = useCallback(() => {
    if (product) openProductForm(navigation, { productId: product.id });
  }, [navigation, product]);
  const duplicate = useCallback(() => {
    if (product) actions.duplicate(product, { onOpen: (id) => goToProduct(navigation, id) });
  }, [actions, navigation, product]);
  const remove = useCallback(async () => {
    if (!product || deleting) return;
    setDeleting(true);
    const ok = await actions.remove(product, { beforeCacheUpdate: () => setDeleted(true) });
    if (ok) afterProductDeleted(navigation);
    else setDeleting(false);
  }, [actions, navigation, product, deleting]);

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
          <IconButton icon="ellipsis-horizontal" onPress={() => setActionsOpen(true)} accessibilityLabel="Plus d’actions" testID="detail-more" />
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
          text={apiErrorMessage(q.error, 'Le serveur ne répond pas. Réessayez dans un instant.')}
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
  const meta = [formatVolumeCl(product.containerVolumeCl), product.alcoholDegree > 0 ? formatDegree(product.alcoholDegree) : null, product.supplier || null]
    .filter(Boolean)
    .join(' · ');
  const tva = product.tvaRate * 100;
  const historyEntries = history.data ?? [];
  const waitingForPhoto = !isFull && !!(product.hasImage || product.thumbnailUrl);
  const updated = formatShortDate(product.updatedAt);

  return (
    <Screen header={header} onScroll={onScroll} refreshing={false} onRefresh={() => refetchRef.current()}>
      <FadeIn>
        <DetailHero
          imageUrl={isFull ? product.imageUrl : null}
          thumbnailUrl={product.thumbnailUrl}
          icon={categoryIcon(product.category?.slug)}
          waitingForPhoto={waitingForPhoto}
          name={product.name}
        />
      </FadeIn>

      <FadeIn delay={40} style={styles.identity}>
        <Text style={styles.name} accessibilityRole="header">
          {product.name}
        </Text>
        <View style={styles.metaRow}>
          {product.category ? <Badge variant="brand" icon={categoryIcon(product.category.slug)} label={product.category.name} size="sm" /> : null}
          {meta ? (
            <Text style={styles.meta} numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
        </View>
      </FadeIn>

      <FadeIn delay={80} style={styles.tiles}>
        <View style={styles.tileRow}>
          <KeyTile
            label="Marge"
            value={c.marginPercent}
            format={(n) => formatPercent(n)}
            zone={zone}
            highlight
            icon="pie-chart-outline"
            caption={`objectif ${formatPercent(t.good, 0)}`}
            a11y={`Marge ${formatPercent(c.marginPercent).replace(/ /g, ' ').replace('%', 'pour cent')}, ${marginColors[zone].label}`}
          />
          <KeyTile
            label="Coefficient"
            value={c.coefficient}
            format={(n) => formatCoeff(n)}
            icon="layers-outline"
            caption="prix HT ÷ coût"
            delay={60}
            a11y={`Coefficient ${formatNumber(c.coefficient, 2)}`}
          />
        </View>
        <View style={styles.tileRow}>
          <KeyTile
            label="Gain par dose"
            value={c.marginPerDoseHT}
            format={(n) => formatEuro(n, { sign: true })}
            valueColor={marginColors[zone].fg}
            icon="cash-outline"
            caption={primary ? `HT · ${primary.label}` : 'HT'}
            delay={120}
            a11y={`Gain par dose ${formatEuro(c.marginPerDoseHT)} hors taxes`}
          />
          <KeyTile
            label={`Gain par ${noun}`}
            value={c.marginPerContainer}
            format={(n) => formatEuro(n, { sign: true })}
            icon={noun === 'fût' ? 'beer-outline' : 'wine-outline'}
            caption={plural(Math.floor(c.glassesPerContainer + 1e-6), 'dose')}
            delay={180}
            a11y={`Gain par ${noun} ${formatEuro(c.marginPerContainer)} hors taxes, ${plural(Math.floor(c.glassesPerContainer + 1e-6), 'dose')}`}
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
              last={i === services.length - 1}
              onPress={
                hasRealServings
                  ? () => {
                      const ps = sortedServings(product).find((x) => x.servingTypeId === s.key);
                      if (ps?.servingType) setPriceTarget({ servingType: ps.servingType, label: s.label, price: ps.sellingPriceTTC });
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
          <ValueRow label="Fournisseur" value={product.supplier || 'Non renseigné'} valueColor={product.supplier ? undefined : palette.text3} last />
        </Card>
      </FadeIn>

      {historyEntries.length ? (
        <FadeIn delay={40}>
          <SectionHeader title="Prix d’achat" meta={plural(historyEntries.length, 'changement')} style={styles.section} />
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
  identity: { marginTop: 20 },
  name: { ...type.title1, color: palette.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  meta: { ...type.footnote, color: palette.text3, flexShrink: 1 },
  tiles: { marginTop: 20, gap: 10 },
  tileRow: { flexDirection: 'row', gap: 10 },
  section: { marginTop: 28, marginBottom: 10 },
  servicesCard: { overflow: 'hidden' },
  factsCard: { paddingVertical: 4 },
  actions: { marginTop: 28, gap: 6 },
  updated: { ...type.footnote, color: palette.text3, textAlign: 'center', marginTop: 6 },
});
