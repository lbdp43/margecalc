import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ErrorBoundary } from './src/components/ui/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30,   // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

const linking = {
  prefixes: ['https://margebar.app', 'margebar://'],
  config: {
    screens: {
      Produits: {
        screens: {
          ProductDetail: 'product/:productId',
          ProductForm: 'product/new',
        },
      },
      Cocktails: {
        screens: {
          CocktailDetail: 'cocktail/:recipeId',
        },
      },
    },
  },
};

export default function App() {
  return (
    <ErrorBoundary fallbackMessage="L'application a rencontré une erreur. Veuillez la redémarrer.">
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer linking={linking}>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
