/**
 * Route names + navigation helpers. Always go through these when navigating
 * into a nested stack: they pass `initial: false` so the stack keeps its root
 * (ProductList) under the target screen (RC5).
 *
 * Structure:
 *   Root stack
 *   ├─ Tabs (bottom tabs, floating TabBar)
 *   │   ├─ Réglages        → SettingsMain, AdminProducts
 *   │   ├─ Produits        → ProductList, ProductDetail
 *   │   └─ Tableau de bord → DashboardMain, DutyCalculator
 *   ├─ ProductForm   (create / edit — no tab bar)
 *   └─ InvoiceScan   (no tab bar)
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
} as const;

/** Routes that never show the floating tab bar (defensive: forms live in the root stack). */
export const TAB_BAR_HIDDEN_ROUTES = new Set<string>(['ProductForm', 'InvoiceScan', 'CocktailForm', 'Scan']);

type Nav = { navigate: (...args: any[]) => void };

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

export function openDutyCalculator(navigation: Nav) {
  navigateInTab(navigation, ROUTES.dashboardTab, ROUTES.dutyCalculator);
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
