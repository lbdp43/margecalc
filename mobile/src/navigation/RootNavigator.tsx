import React, { useEffect } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { useAuthStore } from '../store/auth.store';
import { useSystemParamsStore } from '../store/systemParams.store';
import { useRatesStore } from '../store/rates.store';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { YinYangSpinner } from '../components/ui/YinYangSpinner';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { initOfflineMode, cleanupOfflineMode } from '../services/offline';
import { colors } from '../theme';

export function RootNavigator() {
  const { isAuthenticated, isLoading, loadStoredAuth } = useAuthStore();

  useEffect(() => {
    loadStoredAuth();
    initOfflineMode();
    return () => { cleanupOfflineMode(); };
  }, []);

  // Load system params and rates when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      useSystemParamsStore.getState().loadParams();
      useRatesStore.getState().loadRates();
    }
  }, [isAuthenticated]);

  // Also load rates for landing page (before auth)
  useEffect(() => {
    useRatesStore.getState().loadRates();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <YinYangSpinner size={80} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={rootStyles.fullScreen}>
        <AuthNavigator />
      </View>
    );
  }

  return (
    <View style={rootStyles.fullScreen}>
      <OfflineBanner />
      <AppNavigator />
    </View>
  );
}

const rootStyles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    ...(Platform.OS === 'web' ? { height: '100vh' as any } : {}),
  },
});
