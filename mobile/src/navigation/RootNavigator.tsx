import React, { useEffect, useState } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/auth.store';
import { useSystemParamsStore } from '../store/systemParams.store';
import { useRatesStore } from '../store/rates.store';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { YinYangSpinner } from '../components/ui/YinYangSpinner';
import { OfflineBannerInsets } from '../components/ui/OfflineBanner';
import { WelcomeModal } from '../components/ui/WelcomeModal';
import { initOfflineMode, cleanupOfflineMode } from '../services/offline';
import { loadMarginThresholds } from '../utils/marginThresholds';
import { palette } from '../theme';

const WELCOME_SEEN_KEY = 'margebar_welcome_seen';

export function RootNavigator() {
  // The stored session is read by App.tsx before the NavigationContainer
  // mounts (so deep links resolve against the right linking config).
  const { isAuthenticated, isLoading } = useAuthStore();
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  useEffect(() => {
    initOfflineMode();
    loadMarginThresholds();
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

  // Show welcome modal once for authenticated users
  useEffect(() => {
    let mounted = true;
    if (isAuthenticated) {
      AsyncStorage.getItem(WELCOME_SEEN_KEY).then((seen) => {
        if (mounted && !seen) setWelcomeVisible(true);
      }).catch(() => {});
    } else {
      setWelcomeVisible(false);
    }
    return () => { mounted = false; };
  }, [isAuthenticated]);

  const handleCloseWelcome = () => {
    setWelcomeVisible(false);
    AsyncStorage.setItem(WELCOME_SEEN_KEY, '1').catch(() => {});
  };

  if (isLoading) {
    return (
      <View style={[rootStyles.fullScreen, rootStyles.center]}>
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

  // App is free — all authenticated users get full access, no paywall,
  // no data wipe. Subscription infrastructure is kept dormant for later.
  // Feedback moved to Réglages (« Aide & retours ») and the dashboard header:
  // no floating « Signaler un bug » pill any more.
  return (
    <View style={rootStyles.fullScreen}>
      <OfflineBannerInsets>
        <AppNavigator />
      </OfflineBannerInsets>
      <WelcomeModal visible={welcomeVisible} onClose={handleCloseWelcome} />
    </View>
  );
}

const rootStyles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: palette.bg,
    ...(Platform.OS === 'web' ? { height: '100%' as any } : {}),
  },
  center: { justifyContent: 'center', alignItems: 'center' },
});
