// First: listens for the browser's install prompt from the very first moment (web only).
import './src/utils/pwaInstall';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, LinkingOptions, Theme, getPathFromState, getStateFromPath } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';
import { ToastHost } from './src/components/ui/Toast';
import { DialogHost } from './src/components/ui/Dialog';
import { AppUpdatePrompt } from './src/components/ui/AppUpdatePrompt';
import { YinYangSpinner } from './src/components/ui/YinYangSpinner';
import { ROUTES } from './src/navigation/routes';
import { navigationRef, syncCurrentRoute } from './src/navigation/currentRoute';
import { useAuthStore } from './src/store/auth.store';
import { clearAllOfflineData } from './src/services/offline';
import { fontAssets, installWebFontAliases } from './src/theme/fonts';
import { palette } from './src/theme';

// Paint the app background before anything renders (no white flash on web).
if (Platform.OS === 'web') {
  const doc: any = (globalThis as any).document;
  if (doc?.body) {
    doc.body.style.backgroundColor = palette.bg;
    doc.documentElement.style.backgroundColor = palette.bg;
  }
  // Links from the previous version (/product/new, /product/:id) → current paths.
  const loc: any = (globalThis as any).location;
  const hist: any = (globalThis as any).history;
  const legacy = typeof loc?.pathname === 'string' ? loc.pathname.match(/^\/product\/([^/]+)\/?$/) : null;
  if (legacy && hist?.replaceState) {
    hist.replaceState(hist.state, '', legacy[1] === 'new' ? '/produits/nouveau' : `/produits/${legacy[1]}`);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // Never pause mutations offline forever: fire them and surface the
      // network error (RC6). Offline queueing is handled by services/offline.
      networkMode: 'always',
      retry: 0,
    },
  },
});

/**
 * Deep links / web URLs. One config per root navigator (they share paths such
 * as « / » and « /calculateur »), chosen from the auth state. Every level has
 * an `initialRouteName`, so opening or reloading a URL rebuilds the stack
 * underneath (ProductList under a product, Tabs under a form): « Retour » and
 * the browser back button stay inside the app (RC5).
 */
const PREFIXES = ['https://margebar.app', 'margebar://'];

/** A tab's stack: React Navigation 6 cannot type param lists two levels deep. */
const stackPaths = (initialRouteName: string, screens: Record<string, string>): any => ({ initialRouteName, screens });

/**
 * Only short scalar params belong in a URL. Object params (scanData prefill)
 * and photo URIs stay in memory: serialised they would read « [object Object] »
 * on reload, or blow up the URL with a data URI.
 */
function isUrlSafeParam(value: unknown): boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  return typeof value === 'string' && value.length <= 100 && !/^(data|blob|file|content|ph):/.test(value);
}

function stripUnsafeParams(state: any): any {
  return {
    ...state,
    routes: state.routes.map((route: any) => ({
      ...route,
      params: route.params
        ? Object.fromEntries(Object.entries(route.params).filter(([, value]) => isUrlSafeParam(value)))
        : route.params,
      state: route.state ? stripUnsafeParams(route.state) : route.state,
    })),
  };
}

const getSafePathFromState: typeof getPathFromState = (state, options) => getPathFromState(stripUnsafeParams(state), options);

/**
 * Create and edit share the ProductForm route, but not the URL: editing reads
 * /produits/:productId/modifier (creation stays /produits/nouveau). The edit
 * path is rewritten to the route's own form (?productId=…) when it is read.
 */
const EDIT_PATH = /^\/?produits\/([^/?#]+)\/modifier\/?(?:\?(.*))?$/;

/** The focused leaf of a (partial) navigation state. */
function focusedLeaf(state: any): any {
  let route: any;
  let s = state;
  for (let i = 0; s?.routes?.length && i < 8; i++) {
    route = s.routes[s.index ?? s.routes.length - 1];
    s = route?.state;
  }
  return route;
}

const getAppStateFromPath: typeof getStateFromPath = (path, options) => {
  const m = path.match(EDIT_PATH);
  if (m && m[1] !== 'nouveau') {
    const state = getStateFromPath(`/produits/nouveau?productId=${m[1]}${m[2] ? `&${m[2]}` : ''}`, options);
    // React Navigation keeps the path it parsed on the leaf route and writes it
    // back to the address bar: keep the edit URL there, not the rewritten one.
    const leaf = focusedLeaf(state);
    if (leaf) leaf.path = path;
    return state;
  }
  return getStateFromPath(path, options);
};

const getAppPathFromState: typeof getPathFromState = (state, options) => {
  const path = getSafePathFromState(state, options);
  const m = path.match(/^\/produits\/nouveau\?(.*)$/);
  if (!m) return path;
  const pairs = m[1].split('&').filter(Boolean);
  const idPair = pairs.find((kv) => kv.startsWith('productId='));
  if (!idPair) return path;
  const rest = pairs.filter((kv) => kv !== idPair);
  return `/produits/${idPair.slice('productId='.length)}/modifier${rest.length ? `?${rest.join('&')}` : ''}`;
};

const appLinking: LinkingOptions<{ Tabs: undefined; ProductForm: undefined; InvoiceScan: undefined }> = {
  prefixes: PREFIXES,
  getPathFromState: getAppPathFromState,
  getStateFromPath: getAppStateFromPath,
  config: {
    initialRouteName: ROUTES.tabs,
    screens: {
      [ROUTES.tabs]: {
        initialRouteName: ROUTES.dashboardTab,
        screens: {
          [ROUTES.dashboardTab]: stackPaths(ROUTES.dashboardMain, {
            [ROUTES.dashboardMain]: '',
            [ROUTES.dutyCalculator]: 'calculateur',
            // A product opened from the dashboard (Top & flop, Meilleur produit).
            [ROUTES.dashboardProductDetail]: 'tableau-de-bord/produits/:productId',
          }),
          [ROUTES.productsTab]: stackPaths(ROUTES.productList, {
            [ROUTES.productList]: 'produits',
            // Static segment: React Navigation ranks it above produits/:productId.
            [ROUTES.underTarget]: 'produits/sous-objectif',
            [ROUTES.productDetail]: 'produits/:productId',
          }),
          [ROUTES.settingsTab]: stackPaths(ROUTES.settingsMain, { [ROUTES.settingsMain]: 'reglages', [ROUTES.adminProducts]: 'reglages/produits' }),
        },
      } as any,
      // Create: /produits/nouveau · edit: /produits/:productId/modifier (see getAppPathFromState).
      [ROUTES.productForm]: 'produits/nouveau',
      [ROUTES.invoiceScan]: 'facture',
    },
  },
};

const authLinking: LinkingOptions<{ Landing: undefined; Login: undefined; Register: undefined; DutyCalculator: undefined }> = {
  prefixes: PREFIXES,
  getPathFromState: getSafePathFromState,
  config: {
    initialRouteName: ROUTES.landing,
    screens: {
      [ROUTES.landing]: '',
      [ROUTES.login]: 'connexion',
      [ROUTES.register]: 'inscription',
      [ROUTES.dutyCalculator]: 'calculateur',
    },
  },
};

// ─── Session changes and the web URL ───────────────────────────────────────
//
// - Logged out on an app URL (a shared or bookmarked /produits/<id>): the
//   landing opens, and the URL is kept to be reopened after sign-in.
// - A forced sign-out (« Session expirée ») also remembers where the user was.
// - Signing in puts that URL back in the address bar BEFORE the app navigator
//   reads it (the NavigationContainer is remounted per session), so the stack
//   is rebuilt underneath it like any deep link. Form URLs are never reopened.
// - Logged out, the browser back button never shows an app URL with the
//   landing on screen: such an entry is rewritten to « / ».
const webLoc: any = Platform.OS === 'web' ? (globalThis as any).location : undefined;
const webHist: any = Platform.OS === 'web' ? (globalThis as any).history : undefined;
const AUTH_PATHS = new Set(['', 'connexion', 'inscription', 'calculateur']);
/** A brand-new account goes to its dashboard (and the welcome sheet), never to an old link. */
const NEW_ACCOUNT_MS = 2 * 60 * 1000;

const currentWebPath = (): string | null =>
  webLoc && typeof webLoc.pathname === 'string' ? `${webLoc.pathname}${webLoc.search ?? ''}` : null;
const bareRoute = (path: string) => path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');

/** An app URL worth reopening after sign-in: an app screen, not an auth one, not a form. */
function isResumablePath(path: string | null): path is string {
  if (!path) return false;
  const route = bareRoute(path);
  if (AUTH_PATHS.has(route)) return false;
  if (/^produits\/nouveau$/.test(route) || /^produits\/[^/]+\/modifier$/.test(route)) return false;
  try {
    return !!getAppStateFromPath(`/${route}`, appLinking.config as any);
  } catch {
    return false;
  }
}

const initialWebPath = currentWebPath();
let pendingPath: string | null = null;
let lastSignedInPath: string | null = null;

if (webLoc && webHist?.replaceState) {
  useAuthStore.subscribe((state, prev) => {
    // The stored session was read: logged out on an app URL → keep it for later.
    if (prev.isLoading && !state.isLoading && !state.isAuthenticated && isResumablePath(initialWebPath)) {
      pendingPath = initialWebPath;
    }
    if (prev.isAuthenticated && !state.isAuthenticated) {
      lastSignedInPath = currentWebPath();
      pendingPath = null;
    }
    // A forced sign-out explains itself with a notice: offer the page back after sign-in.
    if (state.notice && state.notice !== prev.notice && state.notice.kind === 'expired' && isResumablePath(lastSignedInPath)) {
      pendingPath = lastSignedInPath;
    }
    if (!prev.isAuthenticated && state.isAuthenticated && !prev.isLoading) {
      const created = Date.parse(state.user?.createdAt ?? '');
      const brandNew = isFinite(created) && Date.now() - created < NEW_ACCOUNT_MS;
      if (pendingPath && !brandNew) webHist.replaceState(webHist.state, '', pendingPath);
      pendingPath = null;
    }
  });

  // Dev only: lets Playwright check the remembered URL.
  if (__DEV__) (globalThis as any).__mbPendingPath = () => ({ pendingPath, lastSignedInPath });

  (globalThis as any).addEventListener?.('popstate', () => {
    const auth = useAuthStore.getState();
    if (auth.isLoading || auth.isAuthenticated) return;
    if (!AUTH_PATHS.has(bareRoute(String(webLoc.pathname ?? '')))) webHist.replaceState(webHist.state, '', '/');
  });
}

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: palette.em700,
    background: palette.bg,
    card: palette.surface,
    text: palette.ink,
    border: palette.line,
    notification: palette.lime,
  },
};

// Dev-only component gallery: http://localhost:8090/?gallery=1
// Guarded by __DEV__ + web and lazily required, so it never ships in the
// production bundle (the branch is constant-folded away).
let DevGallery: React.ComponentType | null = null;
if (__DEV__) {
  if (Platform.OS === 'web' && /[?&]gallery=1/.test(String((globalThis as any).location?.search ?? ''))) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DevGallery = require('./src/dev/Gallery').Gallery;
  }
}

export default function App() {
  const [loaded, error] = useFonts(fontAssets);

  React.useEffect(() => {
    if (loaded) installWebFontAliases();
  }, [loaded]);

  if (!loaded && !error) return null;

  return (
    <ErrorBoundary fullScreen fallbackMessage="L’application a rencontré une erreur. Réessayez, ou rechargez la page.">
      <SafeAreaProvider style={styles.root}>
        <QueryClientProvider client={queryClient}>
          {DevGallery ? <DevGallery /> : <Navigation />}
          {/* Global overlay hosts — available on auth screens too */}
          <ToastHost />
          <DialogHost />
          {/* « Nouvelle version disponible » (web production builds only) */}
          <AppUpdatePrompt />
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

/**
 * The NavigationContainer mounts only once the stored session is read: the
 * URL is resolved against the right linking config (auth or app) on the
 * first frame, so a deep link or a reload lands on the right screen.
 */
function Navigation() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  React.useEffect(() => {
    useAuthStore.getState().loadStoredAuth();
  }, []);

  // A different account, or none: nothing cached for the previous one may
  // show (React Query and the offline cache). Runs after the commit, so the
  // signed-out navigator is already gone and nothing refetches without a token.
  const previousUser = React.useRef<string | null>(null);
  React.useEffect(() => {
    const previous = previousUser.current;
    previousUser.current = userId;
    if (!previous || previous === userId) return;
    queryClient.clear();
    // Sign-out already wipes the offline cache (auth.store); a direct switch does not.
    if (userId) clearAllOfflineData().catch(() => {});
  }, [userId]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <YinYangSpinner size={80} />
      </View>
    );
  }

  return (
    // One container per session (keyed): signing in or out rebuilds the state
    // from the URL with the right linking config, and replaces the history
    // entry instead of pushing one (back never leads into the other session).
    <NavigationContainer
      key={isAuthenticated ? 'app' : 'auth'}
      ref={navigationRef}
      onReady={syncCurrentRoute}
      onStateChange={syncCurrentRoute}
      linking={(isAuthenticated ? appLinking : authLinking) as LinkingOptions<any>}
      theme={navTheme}
    >
      <StatusBar style="dark" />
      <RootNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg },
});
