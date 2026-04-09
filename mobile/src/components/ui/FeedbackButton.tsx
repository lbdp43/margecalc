import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigationState } from '@react-navigation/native';
import { FeedbackModal } from './FeedbackModal';
import { useAuthStore } from '../../store/auth.store';
import * as ticketService from '../../services/ticket.service';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

const DASHBOARD_ROUTE_NAME = 'Tableau de bord';

function getActiveRouteName(state: any): string {
  if (!state || typeof state.index !== 'number') return '';
  const route = state.routes[state.index];
  if (route.state) return getActiveRouteName(route.state);
  return route.name;
}

/**
 * Floating feedback button displayed in the top-right on every authenticated
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [modalVisible, setModalVisible] = useState(false);
  const [dismissed, setDismissed] = useState(dismissedThisSession);
  const [unreadCount, setUnreadCount] = useState(0);

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

  // Load the unread-reply count for the authenticated user.
  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    try {
      const tickets = await ticketService.getMyTickets();
      const n = tickets.filter((t) => !!t.adminReply && !t.readByUser).length;
      setUnreadCount(n);
    } catch {
      // silent — don't let the button break the whole UI
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  // Refresh after closing the modal (the user may have just read replies or sent a new ticket).
  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  const visible = isOnDashboard || !dismissed;
  if (!visible || modalVisible) {
    return (
      <>
        <FeedbackModal
          visible={modalVisible}
          onClose={handleCloseModal}
          screenName={activeRoute || undefined}
        />
      </>
    );
  }

  const topOffset = (insets.top || 0) + spacing.sm + 4;

  return (
    <>
      <View
        style={[styles.wrap, { top: topOffset, right: spacing.sm + 4 }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.button}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Signaler un bug (${unreadCount} nouvelle reponse)` : 'Signaler un bug'}
        >
          <Ionicons name="bug-outline" size={16} color={colors.white} />
          <Text style={styles.buttonText}>Signaler un bug</Text>
        </TouchableOpacity>

        {/* Unread-reply badge — right side of the pill */}
        {unreadCount > 0 && (
          <View style={styles.unreadBadge} pointerEvents="none">
            <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}

        {/* Dismiss button — placed on the left of the pill, hidden on the dashboard */}
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
        onClose={handleCloseModal}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent,
    opacity: 0.92,
    ...shadows.md,
  },
  buttonText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.white,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  dismiss: {
    position: 'absolute',
    top: -5,
    left: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.marginRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  unreadBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
});
