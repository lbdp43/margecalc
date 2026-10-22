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
 *   │   └─ Tableau de bord → DashboardMain [/], DutyCalculator [/calculateur]
 *   ├─ ProductForm   [/produits/nouveau] (create / edit — no tab bar)
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
  productForm: 'ProductForm',
  invoiceScan: 'InvoiceScan',
  // AuthNavigator (logged out)
  landing: 'Landing',
  login: 'Login',
  register: 'Register',
} as const;

/** Routes that never show the floating tab bar (defensive: forms live in the root stack). */
export const TAB_BAR_HIDDEN_ROUTES = new Set<string>(['ProductForm', 'InvoiceScan', 'CocktailForm', 'Scan']);

type Nav = {
  navigate: (...args: any[]) => void;
  getState?: () => { routeNames?: string[] } | undefined;
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

/** Product detail (Produits stack, ProductList kept underneath). */
export function goToProduct(navigation: Nav, productId: string) {
  navigateInTab(navigation, ROUTES.productsTab, ROUTES.productDetail, { productId });
}

export function goToProductList(navigation: Nav) {
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

/**
 * After a successful save from the form: close the form and land on the
 * product detail inside Produits (ProductList underneath), whatever tab the
 * flow started from (Scanner, Dashboard…).
 */
export function afterProductSaved(navigation: Nav, productId: string) {
  goToProduct(navigation, productId);
}

/** After deleting from the form or the detail: back to the list. */
export function afterProductDeleted(navigation: Nav) {
  goToProductList(navigation);
}
