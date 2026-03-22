import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/auth.store';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { SubscriptionScreen } from '../screens/subscription/SubscriptionScreen';
import { YinYangSpinner } from '../components/ui/YinYangSpinner';
import { OfflineBanner } from '../components/ui/OfflineBanner';
import { initOfflineMode, cleanupOfflineMode } from '../services/offline';
import { colors } from '../theme';

const PAYWALL_SEEN_KEY = 'margebar_paywall_seen';

export function RootNavigator() {
  const { isAuthenticated, isLoading, loadStoredAuth, user } = useAuthStore();
  const [paywallSeen, setPaywallSeen] = useState<boolean | null>(null);

  useEffect(() => {
    loadStoredAuth();
    initOfflineMode();
    return () => { cleanupOfflineMode(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (isAuthenticated) {
      AsyncStorage.getItem(PAYWALL_SEEN_KEY).then((val) => {
        if (mounted) setPaywallSeen(val === 'true');
      });
    } else {
      setPaywallSeen(null);
    }
    return () => { mounted = false; };
  }, [isAuthenticated]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <YinYangSpinner size={80} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthNavigator />;
  }

  // Show paywall if user has no active subscription and hasn't dismissed it
  const hasActiveSubscription = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
  if (!hasActiveSubscription && paywallSeen === false) {
    return (
      <SubscriptionScreen
        onDismiss={() => {
          AsyncStorage.setItem(PAYWALL_SEEN_KEY, 'true');
          setPaywallSeen(true);
        }}
      />
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
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <AppNavigator />
    </View>
  );
}
