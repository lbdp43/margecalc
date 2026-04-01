import React, { useEffect, useState } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/auth.store';
import { useSystemParamsStore } from '../store/systemParams.store';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import { YinYangSpinner } from '../components/ui/YinYangSpinner';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { initOfflineMode, cleanupOfflineMode } from '../services/offline';
import { colors } from '../theme';

const PAYWALL_SEEN_KEY = 'margebar_paywall_seen';

export function RootNavigator() {
  const { isAuthenticated, isLoading, loadStoredAuth, user, logout } = useAuthStore();
  const [paywallSeen, setPaywallSeen] = useState<boolean | null>(null);
  // Track if user skipped paywall this session (in-memory only, not persisted)
  const [skippedPaywall, setSkippedPaywall] = useState(false);

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
        AsyncStorage.multiRemove(['margebar_token', 'margebar_user', PAYWALL_SEEN_KEY]).catch(() => {});
      }
    }
  }, [isLoading, isAuthenticated, user]);

  // Load system params when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      useSystemParamsStore.getState().loadParams();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let mounted = true;
    if (isAuthenticated) {
      const isAdmin = user?.role === 'admin';
      const hasSubscription = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
      if (isAdmin || hasSubscription) {
        // Admins and subscribers always get through
        setPaywallSeen(true);
      } else {
        // Non-subscribers always see the paywall on load
        setPaywallSeen(false);
      }
    } else {
      setPaywallSeen(null);
      setSkippedPaywall(false);
    }
    return () => { mounted = false; };
  }, [isAuthenticated, user?.subscriptionStatus]);

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
    </View>
  );
}

const rootStyles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    ...(Platform.OS === 'web' ? { height: '100vh' as any } : {}),
  },
});
