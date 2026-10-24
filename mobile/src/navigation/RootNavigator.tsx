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
import { getProducts } from '../services/product.service';
import { setWelcomeGate } from '../utils/pwaInstall';
import { palette } from '../theme';

const WELCOME_SEEN_KEY = 'margebar_welcome_seen';
/** An account created this recently is a new sign-up (RegisterScreen also clears the seen flag). */
const NEW_ACCOUNT_MS = 30 * 60 * 1000;

/**
 * The first-run sheet is for people who are starting: a fresh sign-up, or an
 * account that has no product yet. A returning user signing in on a new
 * device or browser (no « seen » flag there) does not get it again.
 */
async function shouldWelcome(): Promise<boolean> {
  const user = useAuthStore.getState().user;
  const created = Date.parse(user?.createdAt ?? '');
  if (isFinite(created) && Date.now() - created < NEW_ACCOUNT_MS) return true;
  try {
    const products = await getProducts();
    return products.length === 0;
  } catch {
    return false; // unknown: never interrupt a returning user
  }
}

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

  // Welcome sheet: once per device, and only for new accounts (or empty ones).
  // Otherwise the « seen » flag is set silently.
  useEffect(() => {
    let mounted = true;
    if (!isAuthenticated) {
      setWelcomeVisible(false);
      return () => { mounted = false; };
    }
    (async () => {
      const seen = await AsyncStorage.getItem(WELCOME_SEEN_KEY).catch(() => '1');
      if (!mounted) return;
      if (seen) {
        setWelcomeGate('done');
        return;
      }
      // The install card (dashboard) waits until the welcome sheet is decided and closed.
      setWelcomeGate('pending');
      const welcome = await shouldWelcome();
      if (!mounted) return;
      if (welcome) {
        setWelcomeGate('open');
        setWelcomeVisible(true);
      } else {
        setWelcomeGate('done');
        AsyncStorage.setItem(WELCOME_SEEN_KEY, '1').catch(() => {});
      }
    })();
    return () => { mounted = false; };
  }, [isAuthenticated]);

  const handleCloseWelcome = () => {
    setWelcomeVisible(false);
    AsyncStorage.setItem(WELCOME_SEEN_KEY, '1').catch(() => {});
    // Let the sheet slide away before the install card fades in.
    setTimeout(() => setWelcomeGate('done'), 450);
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
