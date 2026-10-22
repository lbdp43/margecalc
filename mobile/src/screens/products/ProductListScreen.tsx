/**
 * « Mes produits » (D1 §3, FOUNDATION §8 list recipe).
 *
 *   LargeTitleHeader « Mes produits » · « 14 produits · marge moy. 69,0 % » + FAB
 *   search (scan shortcut) · MarginLegend with counts · category ChipRow · sort
 *   ScreenList of kit ProductCards (40 ms stagger, memoised rows)
 *   long press → ProductActionsSheet (Modifier · Dupliquer · Supprimer)
 *
 * States: skeleton (after 150 ms, never over cached data), fresh account,
 * no search result, offline without cache, load error with « Réessayer ».
 */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ProductWithMargin } from '@margebar/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import {
  AnimatedNumber,
  ChipRow,
  EmptyState,
  FAB,
  FadeIn,
  IconButton,
  LargeTitleHeader,
  MarginLegend,
  ProductActionsSheet,
  ProductCard,
  Screen,
  ScreenList,
  SkeletonList,
  TextField,
  countByZone,
  useDelayedLoading,
  useReduceMotion,
} from '../../components/ui';
import { fontFamily, marginColors, motion, palette, radius, type } from '../../theme';
import { formatPercent, plural } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';
import { goToProduct, openInvoiceScan, openProductForm } from '../../navigation/routes';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as productService from '../../services/product.service';
import { useAuthStore } from '../../store/auth.store';
import { ALL_KEY, SortKey, averageMargin, categoryChips, matchesQuery, sortProducts } from './list/listModel';
import { SortSheet, SortTrigger } from './list/SortSheet';
import { apiErrorMessage, useProductActions } from './list/productActions';

type Props = NativeStackScreenProps<any, 'ProductList'>;

const SORT_KEY = 'margebar_products_sort';
const SORT_KEYS: SortKey[] = ['recent', 'marginAsc', 'marginDesc', 'name'];
/** Rows mounted within this window after a (re)load get the staggered entrance. */
const ENTRANCE_WINDOW = 700;

const Separator = () => <View style={styles.sep} />;

// ─── Row ───────────────────────────────────────────────────────────────────
interface RowProps {
  product: ProductWithMargin;
  index: number;
  animate: boolean;
  flash: boolean;
  onOpen: (id: string) => void;
  onActions: (p: ProductWithMargin) => void;
}

const ProductRow = React.memo(function ProductRow({ product, index, animate, flash, onOpen, onActions }: RowProps) {
  return (
    <FadeIn index={index} skip={!animate}>
      <ProductCard product={product} onPress={() => onOpen(product.id)} onLongPress={() => onActions(product)} testID={`product-${product.id}`} />
      {flash ? <Flash /> : null}
    </FadeIn>
  );
});

/** goodBg wash that fades out over 600 ms (a card that was just created). */
function Flash() {
  const reduce = useReduceMotion();
  const o = useSharedValue(0.85);
  useEffect(() => {
    o.value = withDelay(reduce ? 0 : 280, withTiming(0, { duration: reduce ? motion.duration.fast : 600, easing: motion.easing.standard }));
  }, [o, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[styles.flash, style]} />;
}

// ─── Screen ────────────────────────────────────────────────────────────────
export function ProductListScreen({ navigation: nav }: Props) {
  const navigation = nav as any;
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const thresholds = useMarginThresholds();
  const actions = useProductActions();

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<string>(ALL_KEY);
  const [sort, setSort] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<ProductWithMargin | null>(null);
  const [pulling, setPulling] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const animateUntil = useRef(0);

  const { data, isLoading, isFetching, error, refetch, isOffline } = useOfflineQuery<ProductWithMargin[]>(['products'], () =>
    productService.getProducts(),
  );
  const products = useMemo(() => data ?? [], [data]);
  const hasData = data !== undefined;

  // Remember the sort choice on this device (a convenience, never required).
  useEffect(() => {
    AsyncStorage.getItem(SORT_KEY)
      .then((v) => {
        if (v && (SORT_KEYS as string[]).includes(v)) setSort(v as SortKey);
      })
      .catch(() => {});
  }, []);

  // Stagger the rows that mount right after the first data and after each filter / sort change.
  const firstData = useRef(false);
  if (hasData && !firstData.current) {
    firstData.current = true;
    animateUntil.current = Date.now() + ENTRANCE_WINDOW;
  }
  const restagger = useCallback(() => {
    animateUntil.current = Date.now() + ENTRANCE_WINDOW;
    setEpoch((e) => e + 1);
  }, []);

  // ── derived data ──
  const chips = useMemo(() => categoryChips(products, category), [products, category]);
  const zoneCounts = useMemo(() => countByZone(products, thresholds), [products, thresholds]);
  const avg = useMemo(() => averageMargin(products), [products]);
  const visible = useMemo(() => {
    const inCategory = category === ALL_KEY ? products : products.filter((p) => p.categoryId === category);
    return sortProducts(inCategory.filter((p) => matchesQuery(p, deferredQuery)), sort);
  }, [products, category, deferredQuery, sort]);
  const filtering = category !== ALL_KEY || deferredQuery.trim().length > 0;

  // ── navigation ──
  const openProduct = useCallback((id: string) => goToProduct(navigation, id), [navigation]);
  const addProduct = useCallback(() => openProductForm(navigation), [navigation]);
  const scanBottle = useCallback(() => openProductForm(navigation), [navigation]);
  const addManually = useCallback(() => openProductForm(navigation, { manual: true }), [navigation]);
  const importInvoice = useCallback(() => openInvoiceScan(navigation), [navigation]);
  const showActions = useCallback((p: ProductWithMargin) => setActionsFor(p), []);

  const onCategory = useCallback(
    (key: string) => {
      if (key === category) return;
      setCategory(key);
      restagger();
    },
    [category, restagger],
  );
  const onSort = useCallback(
    (key: SortKey) => {
      if (key === sort) return;
      setSort(key);
      AsyncStorage.setItem(SORT_KEY, key).catch(() => {});
      restagger();
    },
    [sort, restagger],
  );
  const clearSearch = useCallback(() => setQuery(''), []);
  const showAll = useCallback(() => {
    setQuery('');
    setCategory(ALL_KEY);
    restagger();
  }, [restagger]);

  const onRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  }, [refetch]);

  const onDuplicate = useCallback(
    async (p: ProductWithMargin) => {
      const created = await actions.duplicate(p, { onOpen: openProduct });
      if (created) {
        // New copy on screen: recent-first, all categories cleared of filters that would hide it.
        if (category !== ALL_KEY && created.categoryId !== category) setCategory(ALL_KEY);
        if (query && !matchesQuery(created, query)) setQuery('');
        if (sort !== 'recent') onSort('recent');
        setFlashId(created.id);
        setTimeout(() => setFlashId((id) => (id === created.id ? null : id)), 1400);
      }
    },
    [actions, openProduct, category, query, sort, onSort],
  );
  const onDelete = useCallback((p: ProductWithMargin) => {
    actions.remove(p);
  }, [actions]);

  // Re-keying the rows (not the list) replays the stagger after a filter / sort change.
  const keyExtractor = useCallback((p: ProductWithMargin) => `${epoch}:${p.id}`, [epoch]);

  const renderItem = useCallback(
    ({ item, index }: { item: ProductWithMargin; index: number }) => (
      <ProductRow
        product={item}
        index={index}
        animate={Date.now() < animateUntil.current}
        flash={item.id === flashId}
        onOpen={openProduct}
        onActions={showActions}
      />
    ),
    [flashId, openProduct, showActions],
  );

  // ── states ──
  const showSkeleton = useDelayedLoading(!hasData && (isLoading || isFetching));
  const loadError = !hasData && !!error && !isFetching;
  // The offline cache is read asynchronously: wait a beat before saying « hors ligne ».
  const offlineEmpty = useDelayedLoading(!hasData && !!isOffline, 400);
  const freshAccount = hasData && products.length === 0;

  const zone = avg !== null ? getMarginZone(avg, thresholds) : 'green';
  const subline = hasData ? (
    products.length ? (
      <>
        {plural(products.length, 'produit')}
        {avg !== null ? ' · marge moy. ' : ''}
        {avg !== null ? (
          <AnimatedNumber value={avg} format={(n) => formatPercent(n)} style={[styles.avg, { color: marginColors[zone].fg }]} />
        ) : null}
      </>
    ) : (
      'Aucun produit pour l’instant'
    )
  ) : offlineEmpty || loadError ? (
    'Vos produits et leurs marges'
  ) : (
    'Chargement de vos produits…'
  );

  const searchRight = (
    <View style={styles.searchRight}>
      {query ? (
        <IconButton icon="close-circle" variant="plain" size={36} iconSize={20} color={palette.text4} onPress={clearSearch} accessibilityLabel="Effacer la recherche" />
      ) : null}
      <IconButton icon="scan-outline" variant="sunken" size={40} iconSize={20} onPress={scanBottle} accessibilityLabel="Scanner une bouteille" />
    </View>
  );

  const header = (
    <View>
      <LargeTitleHeader
        title="Mes produits"
        subline={subline}
        trailing={<FAB onPress={addProduct} accessibilityLabel="Ajouter un produit" testID="products-add" />}
      />
      {freshAccount ? null : (
        <>
          <TextField
            variant="search"
            leftIcon="search"
            placeholder="Rechercher un produit…"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Rechercher un produit"
            right={searchRight}
            testID="products-search"
          />
          {products.length ? (
            <>
              <MarginLegend counts={zoneCounts} thresholds={thresholds} style={styles.legend} />
              <ChipRow items={chips} selectedKey={category} onSelect={onCategory} style={styles.chips} accessibilityLabel="Catégories" />
              <View style={styles.toolbar}>
                <SortTrigger
                  value={sort}
                  onPress={() => setSortOpen(true)}
                  right={
                    filtering ? (
                      <Text style={styles.count} accessibilityLiveRegion="polite">
                        {visible.length ? `${visible.length} sur ${products.length}` : 'Aucun résultat'}
                      </Text>
                    ) : null
                  }
                />
              </View>
            </>
          ) : (
            <View style={{ height: 16 }} />
          )}
        </>
      )}
    </View>
  );

  let empty: React.ReactElement | null = null;
  if (showSkeleton) {
    empty = <SkeletonList count={5} />;
  } else if (!hasData && offlineEmpty) {
    empty = <EmptyState variant="offline" text="Vos produits s’afficheront dès le retour du réseau." />;
  } else if (loadError) {
    empty = (
      <EmptyState
        icon="alert-circle-outline"
        title="Impossible d’afficher vos produits"
        text={apiErrorMessage(error, 'Le serveur ne répond pas. Réessayez dans un instant.')}
        primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => refetch() }}
      />
    );
  } else if (freshAccount) {
    empty = (
      <EmptyState
        marquee
        title="Votre carte est vide"
        text={
          isAdmin
            ? 'Scannez une bouteille ou une facture : vos marges apparaîtront ici.'
            : 'Scannez une bouteille ou ajoutez-la à la main : vos marges apparaîtront ici.'
        }
        primary={{ label: 'Scanner une bouteille', icon: 'scan', onPress: scanBottle }}
        secondary={[
          ...(isAdmin ? [{ label: 'Facture', icon: 'receipt-outline' as const, onPress: importInvoice }] : []),
          { label: 'À la main', icon: 'create-outline' as const, onPress: addManually },
        ]}
      />
    );
  } else if (hasData && visible.length === 0) {
    empty = deferredQuery.trim() ? (
      <EmptyState
        variant="noResults"
        query={deferredQuery.trim()}
        text={category !== ALL_KEY ? 'Aucun produit de cette catégorie ne correspond. Essayez un autre mot.' : undefined}
        primary={{ label: 'Effacer la recherche', icon: 'close', onPress: clearSearch }}
        secondary={category !== ALL_KEY ? { label: 'Voir tous les produits', onPress: showAll } : undefined}
      />
    ) : (
      <EmptyState
        icon="file-tray-outline"
        title="Aucun produit dans cette catégorie"
        text="Choisissez une autre catégorie ou ajoutez un produit."
        primary={{ label: 'Voir tous les produits', onPress: showAll }}
      />
    );
  }

  return (
    <Screen scroll={false} refreshing={pulling} onRefresh={onRefresh}>
      <ScreenList
        data={visible}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={flashId}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        testID="products-list"
      />
      <ProductActionsSheet
        product={actionsFor}
        onClose={() => setActionsFor(null)}
        onEdit={() => actionsFor && openProductForm(navigation, { productId: actionsFor.id })}
        onDuplicate={() => actionsFor && onDuplicate(actionsFor)}
        onDelete={() => actionsFor && onDelete(actionsFor)}
      />
      <SortSheet visible={sortOpen} value={sort} onSelect={onSort} onClose={() => setSortOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sep: { height: 10 },
  avg: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 18 },
  searchRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  legend: { marginTop: 14 },
  chips: { marginTop: 14 },
  toolbar: { marginTop: 6, marginBottom: 4 },
  count: { ...type.footnote, color: palette.text3 },
  flash: { ...StyleSheet.absoluteFillObject, borderRadius: radius.lg, backgroundColor: palette.goodBg },
});
