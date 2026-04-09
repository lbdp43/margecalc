import React, { useEffect, useState } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/auth.store';
import { useSystemParamsStore } from '../store/systemParams.store';
import { useRatesStore } from '../store/rates.store';
import { api } from '../services/api';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import { YinYangSpinner } from '../components/ui/YinYangSpinner';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { WelcomeModal } from '../components/ui/WelcomeModal';
import { initOfflineMode, cleanupOfflineMode } from '../services/offline';
import { colors } from '../theme';

const PAYWALL_SEEN_KEY = 'margebar_paywall_seen';
const WELCOME_SEEN_KEY = 'margebar_welcome_seen';

export function RootNavigator() {
  const { isAuthenticated, isLoading, loadStoredAuth, user, logout } = useAuthStore();
  const [paywallSeen, setPaywallSeen] = useState<boolean | null>(null);
  // Track if user skipped paywall this session (in-memory only, not persisted)
  const [skippedPaywall, setSkippedPaywall] = useState(false);
  // One-time beta welcome modal
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  useEffect(() => {
    loadStoredAuth();
    initOfflineMode();
    return () => { cleanupOfflineMode(); };
  }, []);

  // On app start: if user has no active subscription, clear their persisted
  // session so they must re-authenticate. This ensures no data lingers
  // between sessions for non-subscribers.
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const isAdmin = user.role === 'admin';
      const hasSubscription = user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing';
      if (!isAdmin && !hasSubscription) {
        // Delete all server-side data (products, recipes, etc.) for non-subscribers
        api.delete('/users/me/data').catch(() => {});
        // Clear local session
        AsyncStorage.multiRemove(['margebar_token', 'margebar_user', PAYWALL_SEEN_KEY, 'margebar_saved_calcs']).catch(() => {});
      }
    }
  }, [isLoading, isAuthenticated, user]);

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

  useEffect(() => {
    let mounted = true;
    if (isAuthenticated) {
      const isAdmin = user?.role === 'admin';
      const hasSubscription = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
      if (isAdmin || hasSubscription) {
        // Admins and subscribers always get through
        setPaywallSeen(true);
        // Check whether the one-time beta welcome should be shown
        AsyncStorage.getItem(WELCOME_SEEN_KEY).then((seen) => {
          if (mounted && !seen) setWelcomeVisible(true);
        }).catch(() => {});
      } else {
        // Non-subscribers always see the paywall on load
        setPaywallSeen(false);
      }
    } else {
      setPaywallSeen(null);
      setSkippedPaywall(false);
      setWelcomeVisible(false);
    }
    return () => { mounted = false; };
  }, [isAuthenticated, user?.subscriptionStatus]);

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

  // Show paywall if user has no active subscription and hasn't skipped it this session
  const isAdmin = user?.role === 'admin';
  const hasActiveSubscription = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
  if (!isAdmin && !hasActiveSubscription && !skippedPaywall) {
    return (
      <View style={rootStyles.fullScreen}>
        <SubscriptionScreen
          onDismiss={() => {
            setSkippedPaywall(true);
            setPaywallSeen(true);
          }}
        />
      </View>
    );
  }

  // Still loading paywall preference
  if (paywallSeen === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <YinYangSpinner size={80} />
      </View>
    );
  }

  return (
    <View style={rootStyles.fullScreen}>
      <OfflineBanner />
      <AppNavigator />
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
