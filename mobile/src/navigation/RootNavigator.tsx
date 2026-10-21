import React, { useEffect, useState } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/auth.store';
import { useSystemParamsStore } from '../store/systemParams.store';
import { useRatesStore } from '../store/rates.store';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { YinYangSpinner } from '../components/ui/YinYangSpinner';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { WelcomeModal } from '../components/ui/WelcomeModal';
import { FeedbackButton } from '../components/ui/FeedbackButton';
import { initOfflineMode, cleanupOfflineMode } from '../services/offline';
import { colors } from '../theme';

const WELCOME_SEEN_KEY = 'margebar_welcome_seen';

export function RootNavigator() {
  const { isAuthenticated, isLoading, loadStoredAuth, user } = useAuthStore();
  const [welcomeVisible, setWelcomeVisible] = useState(false);

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

  // App is free — all authenticated users get full access, no paywall,
  // no data wipe. Subscription infrastructure is kept dormant for later.
  return (
    <View style={rootStyles.fullScreen}>
      <OfflineBanner />
      <AppNavigator />
      <FeedbackButton />
      <WelcomeModal visible={welcomeVisible} onClose={handleCloseWelcome} />
    </View>
  );
}

const rootStyles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    ...(Platform.OS === 'web' ? { height: '100vh' as any } : {}),
  },
});
