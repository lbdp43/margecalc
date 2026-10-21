import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';
import { ToastHost } from './src/components/ui/Toast';
import { DialogHost } from './src/components/ui/Dialog';
import { fontAssets, installWebFontAliases } from './src/theme/fonts';
import { palette } from './src/theme';

// Paint the app background before anything renders (no white flash on web).
if (Platform.OS === 'web') {
  const doc: any = (globalThis as any).document;
  if (doc?.body) {
    doc.body.style.backgroundColor = palette.bg;
    doc.documentElement.style.backgroundColor = palette.bg;
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

const linking = {
  prefixes: ['https://margebar.app', 'margebar://'],
  config: {
    screens: {
      Tabs: {
        screens: {
          Produits: {
            screens: {
              ProductDetail: 'product/:productId',
            },
          },
        },
      },
      ProductForm: 'product/new',
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
          {DevGallery ? (
            <DevGallery />
          ) : (
            <NavigationContainer linking={linking as any} theme={navTheme}>
              <StatusBar style="dark" />
              <RootNavigator />
            </NavigationContainer>
          )}
          {/* Global overlay hosts — available on auth screens too */}
          <ToastHost />
          <DialogHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
});
