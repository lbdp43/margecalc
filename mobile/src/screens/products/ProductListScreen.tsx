/**
 * « Mes produits » (D1 §3, FOUNDATION §8 list recipe).
 *
 *   LargeTitleHeader « Mes produits » · « 14 produits · marge moy. 69,0 % » + FAB
 *   search (scan shortcut) · MarginLegend with counts · category ChipRow · sort
 *   ScreenList of kit ProductCards (40 ms stagger, memoised rows, stable keys)
 *   long press → ProductActionsSheet (Modifier · Dupliquer · Supprimer)
 *
 * States: skeleton (after 150 ms, never over cached data; the header placeholders
 * mirror the legend, chips and sort row so nothing shifts), fresh account, no
 * search result, offline without cache, load error with « Réessayer ».
 *
 * Rendering: rows mount page by page as the user scrolls (see `usePages`), so a
 * catalogue of hundreds of products costs one page per filter change.
 */
import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Skeleton,
  SkeletonList,
  SkeletonProductCard,
  TextField,
  countByZone,
  toast,
  useDelayedLoading,
  useReduceMotion,
} from '../../components/ui';
import { fontFamily, layout, marginColors, motion, palette, radius, type } from '../../theme';
import { formatPercent, plural } from '../../utils/format';
import { getMarginZone, useMarginThresholds } from '../../utils/marginThresholds';
import { goToProduct, openInvoiceScan, openProductForm } from '../../navigation/routes';
import { useOfflineQuery } from '../../hooks/useOfflineQuery';
import * as productService from '../../services/product.service';
import { ALL_KEY, SortKey, averageMargin, categoryChips, matchesQuery, sortProducts } from './list/listModel';
import { SortSheet, SortTrigger } from './list/SortSheet';
import { loadErrorMessage, useProductActions } from './list/productActions';
import { pruneDetailCaches } from './list/detailCache';

type Props = NativeStackScreenProps<any, 'ProductList'>;

const SORT_KEY = 'margebar_products_sort';
const SORT_KEYS: SortKey[] = ['recent', 'marginAsc', 'marginDesc', 'name'];
/** Rows mounted within this window after a (re)load get the staggered entrance. */
const ENTRANCE_WINDOW = 700;
/** Rows replaying the entrance after a filter change (the stagger caps at 8). */
const STAGGERED = 8;
/** First page fills a tall phone; each next page is mounted ~2 screens ahead. */
const FIRST_PAGE = 12;
const PAGE = 12;
const AHEAD_SCREENS = 2;
/** A toast (up to two lines) plus its gap, above the floating tab bar. */
const TOAST_ROOM = 84;

const Separator = () => <View style={styles.sep} />;

// ─── Row ───────────────────────────────────────────────────────────────────
interface RowProps {
  product: ProductWithMargin;
  index: number;
  animate: boolean;
  /** Changes after a filter / sort change: replays the entrance (first rows only). */
  epoch: number;
  flash: boolean;
  onOpen: (id: string) => void;
  onActions: (p: ProductWithMargin) => void;
  onReveal: (top: number, bottom: number, index: number) => void;
}

const ProductRow = React.memo(function ProductRow({ product, index, animate, epoch, flash, onOpen, onActions, onReveal }: RowProps) {
  const ref = useRef<View>(null);
  // A copy just landed here: make sure it is on screen once the list has settled.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => {
      ref.current?.measureInWindow((_x, y, _w, h) => onReveal(y, y + h, index));
    }, 320);
    return () => clearTimeout(t);
  }, [flash, index, onReveal]);
  return (
    <View ref={ref} collapsable={false}>
      <FadeIn key={epoch} index={index} skip={!animate}>
        <ProductCard product={product} onPress={() => onOpen(product.id)} onLongPress={() => onActions(product)} testID={`product-${product.id}`} />
        {flash ? <Flash /> : null}
      </FadeIn>
    </View>
  );
});

/**
 * goodBg wash that fades out over 600 ms on a card that was just created
 * (held while the list scrolls to it).
 */
function Flash() {
  const reduce = useReduceMotion();
  const o = useSharedValue(0.85);
  useEffect(() => {
    o.value = withDelay(reduce ? 400 : 800, withTiming(0, { duration: reduce ? motion.duration.fast : 600, easing: motion.easing.standard }));
  }, [o, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.flash, style]} />;
}

/**
 * ScreenList takes no ref: capture its scroll view through renderScrollComponent
 * (the list clones the element with its own ref, which is forwarded here too).
 */
function useCapturedScroll() {
  const node = useRef<ScrollView | null>(null);
  const render = useMemo(() => {
    const Captured = React.forwardRef<ScrollView, ScrollViewProps>(function Captured(props, ref) {
      // Stable, so the list's own ref is not detached / re-attached on every render.
      const setRef = React.useCallback(
        (n: ScrollView | null) => {
          node.current = n;
          if (typeof ref === 'function') ref(n);
          else if (ref) (ref as React.MutableRefObject<ScrollView | null>).current = n;
        },
        [ref],
      );
      return <ScrollView {...props} ref={setRef} />;
    });
    return (props: ScrollViewProps) => <Captured {...props} />;
  }, []);
  const scrollTo = useCallback((y: number) => node.current?.scrollTo({ y: Math.max(0, y), animated: true }), []);
  return { render, scrollTo };
}

/**
 * Page-by-page rendering. Every row of the slice is rendered
 * (initialNumToRender = slice length), and the next page is added when the
 * user scrolls within two screens of the end. This is measured here, not by
 * VirtualizedList's own windowing or onEndReached: both wait on
 * InteractionManager, which a looping animation can hold for good.
 */
function usePages(total: number, resetKey: string) {
  const [limit, setLimit] = useState(FIRST_PAGE);
  const metrics = useRef({ offset: 0, viewport: 0, content: 0 });
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const totalRef = useRef(total);
  totalRef.current = total;

  // A new filter, search or sort starts again from the first page.
  const lastReset = useRef(resetKey);
  if (lastReset.current !== resetKey) {
    lastReset.current = resetKey;
    if (limit !== FIRST_PAGE) {
      limitRef.current = FIRST_PAGE;
      setLimit(FIRST_PAGE);
    }
  }

  const maybeGrow = useCallback(() => {
    const { offset, viewport, content } = metrics.current;
    if (!viewport || limitRef.current >= totalRef.current) return;
    if (content - (offset + viewport) < viewport * AHEAD_SCREENS) {
      const next = Math.min(totalRef.current, limitRef.current + PAGE);
      limitRef.current = next;
      // Low priority: React yields to scrolling while the new cards mount.
      startTransition(() => setLimit((l) => Math.max(l, next)));
    }
  }, []);

  const handlers = useMemo(
    () => ({
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        metrics.current.offset = e.nativeEvent.contentOffset.y;
        maybeGrow();
      },
      onLayout: (e: LayoutChangeEvent) => {
        metrics.current.viewport = e.nativeEvent.layout.height;
        maybeGrow();
      },
      onContentSizeChange: (_w: number, h: number) => {
        metrics.current.content = h;
        maybeGrow();
      },
    }),
    [maybeGrow],
  );

  /** Make sure row `index` is mounted (a copy inserted past the current page). */
  const ensure = useCallback((index: number) => {
    if (index >= limitRef.current) {
      const next = Math.min(totalRef.current, index + PAGE);
      limitRef.current = next;
      setLimit((l) => Math.max(l, next));
    }
  }, []);
  const offset = useCallback(() => metrics.current.offset, []);

  return { limit: Math.min(limit, Math.max(total, 0)), handlers, offset, ensure };
}

// ─── Screen ────────────────────────────────────────────────────────────────
export function ProductListScreen({ navigation: nav }: Props) {
  const navigation = nav as any;
  const thresholds = useMarginThresholds();
  const actions = useProductActions();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

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
  const scroller = useCapturedScroll();

  const { data, isLoading, isFetching, error, refetch, isOffline } = useOfflineQuery<ProductWithMargin[]>(productService.productKeys.list, () =>
    productService.getProducts(),
  );
  const products = useMemo(() => data ?? [], [data]);
  const hasData = data !== undefined;

  useEffect(() => {
    pruneDetailCaches();
  }, []);

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
  const chips = useMemo(() => categoryChips(products), [products]);
  // The selected category lost its last product (deleted): back to « Tous ».
  useEffect(() => {
    if (hasData && category !== ALL_KEY && !products.some((p) => p.categoryId === category)) setCategory(ALL_KEY);
  }, [hasData, products, category]);
  const zoneCounts = useMemo(() => countByZone(products, thresholds), [products, thresholds]);
  const avg = useMemo(() => averageMargin(products), [products]);
  const visible = useMemo(() => {
    const inCategory = category === ALL_KEY ? products : products.filter((p) => p.categoryId === category);
    return sortProducts(inCategory.filter((p) => matchesQuery(p, deferredQuery)), sort);
  }, [products, category, deferredQuery, sort]);
  const filtering = category !== ALL_KEY || deferredQuery.trim().length > 0;

  const pages = usePages(visible.length, `${category}|${deferredQuery.trim()}|${sort}`);
  const rows = useMemo(() => (pages.limit >= visible.length ? visible : visible.slice(0, pages.limit)), [visible, pages.limit]);

  // ── navigation ──
  const openProduct = useCallback((id: string) => goToProduct(navigation, id), [navigation]);
  const addProduct = useCallback(() => openProductForm(navigation), [navigation]);
  const scanBottle = useCallback(() => openProductForm(navigation), [navigation]);
  const addManually = useCallback(() => openProductForm(navigation, { manual: true }), [navigation]);
  const importInvoice = useCallback(() => openInvoiceScan(navigation), [navigation]);
  const showActions = useCallback((p: ProductWithMargin) => {
    // A toast left over from an earlier action must not come back after this sheet.
    toast.clear();
    setActionsFor(p);
  }, []);

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
  const openSort = useCallback(() => {
    toast.clear();
    setSortOpen(true);
  }, []);
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

  // A copy keeps the user's sort, search and category (it matches them: same
  // category, supplier and name + « (copie) »). It lands where the sort puts it,
  // flashes, and the list scrolls just enough to show it.
  const onDuplicate = useCallback(
    async (p: ProductWithMargin) => {
      const created = await actions.duplicate(p, { onOpen: openProduct });
      if (created) {
        setFlashId(created.id);
        setTimeout(() => setFlashId((id) => (id === created.id ? null : id)), 2000);
      }
    },
    [actions, openProduct],
  );
  // The copy may sort past the mounted page: mount up to it.
  const { ensure: ensureRow, offset: scrollOffset } = pages;
  useEffect(() => {
    if (!flashId) return;
    const i = visible.findIndex((x) => x.id === flashId);
    if (i >= 0) ensureRow(i);
  }, [flashId, visible, ensureRow]);

  const topBound = insets.top + layout.compactBarHeight + 8;
  // The « … créé · Voir » toast shows above the tab bar at that moment: keep the copy above it.
  const bottomBound = windowHeight - layout.floatingBottom(insets.bottom) - TOAST_ROOM;
  const { scrollTo } = scroller;
  const onReveal = useCallback(
    (top: number, bottom: number, index: number) => {
      if (index === 0) {
        if (top < topBound || bottom > bottomBound) scrollTo(0);
        return;
      }
      if (top < topBound) scrollTo(scrollOffset() - (topBound - top));
      else if (bottom > bottomBound) scrollTo(scrollOffset() + (bottom - bottomBound));
    },
    [topBound, bottomBound, scrollTo, scrollOffset],
  );

  const onDelete = useCallback(
    (p: ProductWithMargin) => {
      actions.remove(p);
    },
    [actions],
  );

  const keyExtractor = useCallback((p: ProductWithMargin) => p.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: ProductWithMargin; index: number }) => (
      <ProductRow
        product={item}
        index={index}
        animate={Date.now() < animateUntil.current}
        // Only the first rows replay the entrance: re-keying a row remounts its card.
        epoch={index < STAGGERED ? epoch : 0}
        flash={item.id === flashId}
        onOpen={openProduct}
        onActions={showActions}
        onReveal={onReveal}
      />
    ),
    [epoch, flashId, openProduct, showActions, onReveal],
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
        <IconButton icon="close-circle" variant="plain" size={44} iconSize={20} color={palette.text3} onPress={clearSearch} accessibilityLabel="Effacer la recherche" />
      ) : null}
      <IconButton icon="scan-outline" variant="sunken" size={44} iconSize={20} onPress={scanBottle} accessibilityLabel="Scanner une bouteille" />
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
                  onPress={openSort}
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
          ) : showSkeleton && !hasData ? (
            <HeaderSkeleton />
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
        text={loadErrorMessage(error)}
        primary={{ label: 'Réessayer', icon: 'refresh', onPress: () => refetch() }}
      />
    );
  } else if (freshAccount) {
    empty = (
      <EmptyState
        marquee
        title="Votre carte est vide"
        text="Scannez une bouteille ou une facture : vos marges apparaîtront ici."
        // Graft 14: the same three ways in as the empty dashboard, for every account.
        primary={{ label: 'Scanner une bouteille', icon: 'scan', onPress: scanBottle }}
        secondary={[
          { label: 'Facture', icon: 'receipt-outline', onPress: importInvoice },
          { label: 'À la main', icon: 'create-outline', onPress: addManually },
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

  // Whole-screen states sit in the middle of the free space (the search result one stays near the field).
  if (empty && (freshAccount || loadError || (!hasData && offlineEmpty))) {
    empty = <View style={styles.emptyFill}>{empty}</View>;
  }

  // More rows than mounted: one quiet placeholder card at the end (rarely seen, mounted 2 screens ahead).
  const footer = rows.length < visible.length ? <SkeletonProductCard style={styles.more} still /> : null;

  return (
    <Screen scroll={false} refreshing={pulling} onRefresh={onRefresh}>
      <ScreenList
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderScrollComponent={scroller.render}
        extraData={flashId}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        // The whole slice is rendered: usePages decides how much that is.
        initialNumToRender={rows.length}
        onScroll={pages.handlers.onScroll}
        onLayout={pages.handlers.onLayout}
        onContentSizeChange={pages.handlers.onContentSizeChange}
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

/** Legend, chips and sort row while the first load runs: the cards appear where the skeleton cards were. */
function HeaderSkeleton() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.legend, styles.legendSkel]}>
        <Skeleton height={12} width={230} radius={6} />
      </View>
      <View style={[styles.chips, styles.chipsSkel]}>
        <Skeleton height={44} width={78} radius={22} />
        <Skeleton height={44} width={118} radius={22} />
        <Skeleton height={44} width={92} radius={22} />
      </View>
      <View style={[styles.toolbar, styles.sortSkel]}>
        <Skeleton height={14} width={170} radius={7} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sep: { height: 10 },
  more: { marginTop: 10 },
  avg: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 18 },
  searchRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  legend: { marginTop: 14 },
  legendSkel: { height: 18, justifyContent: 'center' },
  chips: { marginTop: 14 },
  chipsSkel: { flexDirection: 'row', gap: 8, height: 44, overflow: 'hidden' },
  toolbar: { marginTop: 6, marginBottom: 4 },
  sortSkel: { height: 44, justifyContent: 'center' },
  count: { ...type.footnote, color: palette.text3 },
  // Fresh account / offline / error: centred in the space left under the title.
  emptyFill: { flex: 1, minHeight: 420, justifyContent: 'center', paddingBottom: 40 },
  flash: { ...StyleSheet.absoluteFillObject, borderRadius: radius.lg, backgroundColor: palette.goodBg, pointerEvents: 'none' },
});
