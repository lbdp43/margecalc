/**
 * Route names + navigation helpers. Always go through these when navigating
 * into a nested stack: they pass `initial: false` so the stack keeps its root
 * (ProductList) under the target screen (RC5).
 *
 * Structure (web paths in brackets, see the linking configs in App.tsx):
 *   Root stack
 *   ├─ Tabs (bottom tabs, floating TabBar, back → Tableau de bord)
 *   │   ├─ Réglages        → SettingsMain [/reglages], AdminProducts [/reglages/produits]
 *   │   ├─ Produits        → ProductList [/produits], ProductDetail [/produits/:productId]
 *   │   └─ Tableau de bord → DashboardMain [/], DutyCalculator [/calculateur],
 *   │                        DashboardProductDetail [/tableau-de-bord/produits/:productId]
 *   │                        (a product opened from the dashboard stays in its tab:
 *   │                        « Retour » goes back to the dashboard)
 *   ├─ ProductForm   [/produits/nouveau] (create) · [/produits/:productId/modifier] (edit) — no tab bar
 *   └─ InvoiceScan   [/facture] (no tab bar)
 *   Logged out (AuthNavigator):
 *     Landing [/], Login [/connexion], Register [/inscription], DutyCalculator [/calculateur]
 */
export const ROUTES = {
  tabs: 'Tabs',
  settingsTab: 'Réglages',
  productsTab: 'Produits',
  dashboardTab: 'Tableau de bord',
  settingsMain: 'SettingsMain',
  adminProducts: 'AdminProducts',
  productList: 'ProductList',
  productDetail: 'ProductDetail',
  dashboardMain: 'DashboardMain',
  dutyCalculator: 'DutyCalculator',
  /** The same ProductDetail screen, inside the Tableau de bord stack. */
  dashboardProductDetail: 'DashboardProductDetail',
  productForm: 'ProductForm',
  invoiceScan: 'InvoiceScan',
  // AuthNavigator (logged out)
  landing: 'Landing',
  login: 'Login',
  register: 'Register',
} as const;

/** Routes that never show the floating tab bar (defensive: forms live in the root stack). */
export const TAB_BAR_HIDDEN_ROUTES = new Set<string>([ROUTES.productForm, ROUTES.invoiceScan]);

type NavState = { routeNames?: string[]; index?: number; routes?: { name: string; params?: any; state?: NavState }[] };
type Nav = {
  navigate: (...args: any[]) => void;
  getState?: () => NavState | undefined;
  getParent?: (id?: string) => Nav | undefined;
};

/** Route names of this navigator and every parent (innermost first). */
function routeNamesUp(navigation: Nav): string[] {
  const names: string[] = [];
  let nav: Nav | undefined = navigation;
  for (let i = 0; nav && i < 8; i++) {
    names.push(...(nav.getState?.()?.routeNames ?? []));
    nav = nav.getParent?.();
  }
  return names;
}

/** Open a screen of a tab's stack, keeping the stack's root underneath. */
export function navigateInTab(navigation: Nav, tab: string, screen?: string, params?: object) {
  navigation.navigate(ROUTES.tabs, {
    screen: tab,
    params: screen ? { screen, params, initial: false } : undefined,
  });
}

/** True when `navigation` is the Tableau de bord stack (or a screen in it). */
function inDashboardStack(navigation: Nav): boolean {
  return !!navigation.getState?.()?.routeNames?.includes(ROUTES.dashboardProductDetail);
}

/**
 * Product detail. From the Tableau de bord stack (Top & flop, Meilleur
 * produit…) it opens in that stack, so « Retour » returns to the dashboard and
 * the tab bar keeps « Tableau de bord » selected. From anywhere else: Produits
 * stack, ProductList kept underneath.
 */
export function goToProduct(navigation: Nav, productId: string) {
  if (inDashboardStack(navigation)) {
    navigation.navigate(ROUTES.dashboardProductDetail, { productId });
    return;
  }
  navigateInTab(navigation, ROUTES.productsTab, ROUTES.productDetail, { productId });
}

/**
 * Filters « Mes produits » can be opened with (dashboard counters, « Marge par
 * catégorie », « Tout voir »): zone good | medium | bad, a category id, a sort.
 * Readable in the URL too: /produits?zone=bad&sort=marginAsc.
 */
export interface ProductListFilter {
  zone?: 'good' | 'medium' | 'bad';
  category?: string;
  sort?: 'recent' | 'marginAsc' | 'marginDesc' | 'name';
  /**
   * '1': open the whole list (no zone, all categories, no search) with the
   * user's own sort, whatever filter an earlier link left on the list
   * (« Produits · 14 suivis », « Détails »). Applied once, like the others.
   */
  reset?: '1';
}

/**
 * « Mes produits ». With a filter, the list opens filtered and sorted (applied
 * once: the user can then change or clear it), ProductList kept as the root of
 * the Produits stack (`initial: false`), even from another tab. `{ reset: '1' }`
 * opens it unfiltered with the user's sort. Without a filter the list keeps
 * the state it was left in (the Produits tab, after a delete).
 */
export function goToProductList(navigation: Nav, filter?: ProductListFilter) {
  if (filter && (filter.zone || filter.category || filter.sort || filter.reset)) {
    navigateInTab(navigation, ROUTES.productsTab, ROUTES.productList, filter);
    return;
  }
  navigation.navigate(ROUTES.tabs, { screen: ROUTES.productsTab, params: { screen: ROUTES.productList } });
}

/** Create (no productId) or edit a product. Full-screen, tab bar hidden. */
export function openProductForm(navigation: Nav, params: { productId?: string; [k: string]: unknown } = {}) {
  navigation.navigate(ROUTES.productForm, params);
}

export function openInvoiceScan(navigation: Nav) {
  navigation.navigate(ROUTES.invoiceScan, {});
}

/**
 * « Calculateur de droits ». Works logged in (Tableau de bord stack, tab bar
 * visible) AND logged out (AuthNavigator route, e.g. from the landing teaser).
 */
export function openDutyCalculator(navigation: Nav) {
  const names = routeNamesUp(navigation);
  if (names.includes(ROUTES.tabs)) navigateInTab(navigation, ROUTES.dashboardTab, ROUTES.dutyCalculator);
  else navigation.navigate(ROUTES.dutyCalculator);
}

/**
 * Where « Retour » goes when there is nothing to go back to (a URL opened
 * directly): the dashboard when logged in, the landing when logged out.
 */
export function goHome(navigation: Nav) {
  const names = routeNamesUp(navigation);
  if (names.includes(ROUTES.tabs)) {
    navigation.navigate(ROUTES.tabs, { screen: ROUTES.dashboardTab, params: { screen: ROUTES.dashboardMain } });
  } else if (names.includes(ROUTES.landing)) {
    navigation.navigate(ROUTES.landing);
  }
}

/** The tab stack shown under the root-stack screens: { tab name, top route of its stack }. */
function focusedTabTop(navigation: Nav): { tab: string; name: string; params?: any } | null {
  let nav: Nav | undefined = navigation;
  for (let i = 0; nav && i < 8; i++) {
    const state = nav.getState?.();
    const tabsRoute = state?.routeNames?.includes(ROUTES.tabs) ? state.routes?.find((r) => r.name === ROUTES.tabs) : undefined;
    if (tabsRoute) {
      const tabs = tabsRoute.state;
      const tab = tabs?.routes?.[tabs.index ?? 0];
      const stack = tab?.state;
      const top = stack?.routes?.[stack.index ?? (stack.routes?.length ?? 1) - 1];
      return tab && top ? { tab: tab.name, name: top.name, params: top.params } : null;
    }
    nav = nav.getParent?.();
  }
  return null;
}

/**
 * After a successful save from the form: close the form and land on the
 * product detail inside Produits (ProductList underneath), whatever tab the
 * flow started from (Scanner, Réglages…). Exception: the form was opened from
 * this product's detail in the Tableau de bord stack — go back to it there.
 */
export function afterProductSaved(navigation: Nav, productId: string) {
  const under = focusedTabTop(navigation);
  if (under?.name === ROUTES.dashboardProductDetail && under.params?.productId === productId) {
    navigateInTab(navigation, ROUTES.dashboardTab, ROUTES.dashboardProductDetail, { productId });
    return;
  }
  navigateInTab(navigation, ROUTES.productsTab, ROUTES.productDetail, { productId });
}

/**
 * After deleting from the form or the detail: back to the list — or to the
 * dashboard when the product was opened from it.
 */
export function afterProductDeleted(navigation: Nav) {
  const fromDashboard = inDashboardStack(navigation) || focusedTabTop(navigation)?.name === ROUTES.dashboardProductDetail;
  if (fromDashboard) {
    navigation.navigate(ROUTES.tabs, { screen: ROUTES.dashboardTab, params: { screen: ROUTES.dashboardMain } });
    return;
  }
  goToProductList(navigation);
}
