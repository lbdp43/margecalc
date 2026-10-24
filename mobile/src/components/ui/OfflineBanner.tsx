/**
 * OfflineBanner — a slim strip below the status bar, in the layout flow
 * (it pushes the app down instead of overlapping it). When it shows, it
 * consumes the top safe-area inset for the screens below (via
 * `OfflineBannerInsets`), so nothing is double-padded.
 *
 *   <OfflineBannerInsets>{app}</OfflineBannerInsets>  (RootNavigator)
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getPendingCount, isOnline, onConnectivityChange } from '../../services/offline';
import { palette, type } from '../../theme';
import { FadeIn } from './motion';

function useOfflineState() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onConnectivityChange((state) => setOnline(state)), []);

  useEffect(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      getPendingCount().then(setPending).catch(() => {});
    }, 500);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [online]);

  return { online, pending, visible: !online || pending > 0 };
}

export function OfflineBanner() {
  const state = useOfflineState();
  if (!state.visible) return null;
  return <OfflineBannerView online={state.online} pending={state.pending} />;
}

function OfflineBannerView({ online, pending }: { online: boolean; pending: number }) {
  const insets = useSafeAreaInsets();
  const text = !online
    ? `Hors ligne${pending > 0 ? ` · ${pending} modification${pending > 1 ? 's' : ''} en attente` : ' · reconnexion automatique'}`
    : `Synchronisation de ${pending} modification${pending > 1 ? 's' : ''}…`;
  return (
    <View style={[styles.wrap, { paddingTop: insets.top }, online ? styles.syncing : styles.offline]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <FadeIn offset={-6} duration={200} style={styles.row}>
        <Ionicons name={online ? 'sync-outline' : 'cloud-offline-outline'} size={15} color={online ? '#FFFFFF' : palette.em300} />
        <Text style={styles.text} numberOfLines={1}>
          {text}
        </Text>
      </FadeIn>
    </View>
  );
}

/**
 * Renders the banner above `children` and, while it is visible, gives the
 * children a top safe-area inset of 0 (the banner already covers it).
 */
export function OfflineBannerInsets({ children }: { children: React.ReactNode }) {
  const { visible, online, pending } = useOfflineState();
  const insets = useSafeAreaInsets();
  const childInsets = React.useMemo(() => (visible ? { ...insets, top: 0 } : insets), [visible, insets]);
  return (
    <View style={{ flex: 1 }}>
      {visible ? <OfflineBannerView online={online} pending={pending} /> : null}
      <View style={{ flex: 1 }}>
        <SafeAreaInsetsContext.Provider value={childInsets}>{children}</SafeAreaInsetsContext.Provider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  offline: { backgroundColor: palette.ink },
  syncing: { backgroundColor: palette.em700 },
  row: { height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  text: { ...type.footnoteStrong, color: '#FFFFFF', flexShrink: 1 },
});
