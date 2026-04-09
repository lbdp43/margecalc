import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigationState } from '@react-navigation/native';
import { FeedbackModal } from './FeedbackModal';
import { colors, spacing, borderRadius, shadows } from '../../theme';

const DASHBOARD_ROUTE_NAME = 'Tableau de bord';

function getActiveRouteName(state: any): string {
  if (!state || typeof state.index !== 'number') return '';
  const route = state.routes[state.index];
  if (route.state) return getActiveRouteName(route.state);
  return route.name;
}

/**
 * Floating feedback button displayed in the top-left on every authenticated
 * screen. Users can dismiss it with the "×" on any page EXCEPT the dashboard,
 * where it remains always visible.
 *
 * The dismissal is tracked in-memory via a module-level flag so it survives
 * navigation but resets on page reload. Exposed via setDismissed so that
 * entering the Dashboard implicitly re-enables it.
 */
let dismissedThisSession = false;
const dismissalListeners = new Set<(value: boolean) => void>();
function setDismissedGlobal(value: boolean) {
  dismissedThisSession = value;
  dismissalListeners.forEach((cb) => cb(value));
}

export function FeedbackButton() {
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [dismissed, setDismissed] = useState(dismissedThisSession);

  // Subscribe to global dismissal changes so all mounted instances stay in sync.
  React.useEffect(() => {
    dismissalListeners.add(setDismissed);
    return () => { dismissalListeners.delete(setDismissed); };
  }, []);

  // Get the currently active route name to know if we're on the dashboard.
  const activeRoute = useNavigationState((state) => (state ? getActiveRouteName(state) : ''));
  const isOnDashboard = activeRoute === DASHBOARD_ROUTE_NAME || activeRoute === 'DashboardHome';

  // On the dashboard, force visibility back on so the button is always shown.
  React.useEffect(() => {
    if (isOnDashboard && dismissedThisSession) {
      setDismissedGlobal(false);
    }
  }, [isOnDashboard]);

  const visible = isOnDashboard || !dismissed;
  if (!visible || modalVisible) {
    return (
      <>
        <FeedbackModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          screenName={activeRoute || undefined}
        />
      </>
    );
  }

  const topOffset = (insets.top || 0) + spacing.sm + 4;

  return (
    <>
      <View
        style={[styles.wrap, { top: topOffset, left: spacing.sm + 4 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.button}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Signaler un retour"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.white} />
        </TouchableOpacity>

        {/* Dismiss button — hidden on the dashboard */}
        {!isOnDashboard && (
          <TouchableOpacity
            style={styles.dismiss}
            onPress={() => setDismissedGlobal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Masquer le bouton de retour"
          >
            <Ionicons name="close" size={10} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>

      <FeedbackModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        screenName={activeRoute || undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 1000,
    ...(Platform.OS === 'web' ? ({ pointerEvents: 'box-none' } as any) : {}),
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
    ...shadows.md,
  },
  dismiss: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.background,
  },
});
