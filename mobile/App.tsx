import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme, LinkingOptions, Theme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';
import { ToastHost } from './src/components/ui/Toast';
import { DialogHost } from './src/components/ui/Dialog';
import { YinYangSpinner } from './src/components/ui/YinYangSpinner';
import { ROUTES } from './src/navigation/routes';
import { useAuthStore } from './src/store/auth.store';
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

const appLinking: LinkingOptions<{ Tabs: undefined; ProductForm: undefined; InvoiceScan: undefined }> = {
  prefixes: PREFIXES,
  config: {
    initialRouteName: ROUTES.tabs,
    screens: {
      [ROUTES.tabs]: {
        initialRouteName: ROUTES.dashboardTab,
        screens: {
          [ROUTES.dashboardTab]: stackPaths(ROUTES.dashboardMain, { [ROUTES.dashboardMain]: '', [ROUTES.dutyCalculator]: 'calculateur' }),
          [ROUTES.productsTab]: stackPaths(ROUTES.productList, { [ROUTES.productList]: 'produits', [ROUTES.productDetail]: 'produits/:productId' }),
          [ROUTES.settingsTab]: stackPaths(ROUTES.settingsMain, { [ROUTES.settingsMain]: 'reglages', [ROUTES.adminProducts]: 'reglages/produits' }),
        },
      } as any,
      [ROUTES.productForm]: 'produits/nouveau',
      [ROUTES.invoiceScan]: 'facture',
    },
  },
};

const authLinking: LinkingOptions<{ Landing: undefined; Login: undefined; Register: undefined; DutyCalculator: undefined }> = {
  prefixes: PREFIXES,
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

  React.useEffect(() => {
    useAuthStore.getState().loadStoredAuth();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <YinYangSpinner size={80} />
      </View>
    );
  }

  return (
    <NavigationContainer linking={(isAuthenticated ? appLinking : authLinking) as LinkingOptions<any>} theme={navTheme}>
      <StatusBar style="dark" />
      <RootNavigator />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg },
});
