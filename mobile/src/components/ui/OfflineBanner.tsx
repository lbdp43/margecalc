import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isOnline, onConnectivityChange, getPendingCount } from '../../services/offline';
import { colors, spacing, typography } from '../../theme';

export function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return onConnectivityChange((state) => {
      setOnline(state);
    });
  }, []);

  // Debounced pending count refresh
  useEffect(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      getPendingCount().then(setPending);
    }, 500);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [online]);

  if (online && pending === 0) return null;

  return (
    <View style={[styles.banner, online ? styles.syncing : styles.offline]}>
      <Ionicons
        name={online ? 'sync-outline' : 'cloud-offline-outline'}
        size={16}
        color={colors.white}
      />
      <Text style={styles.text}>
        {!online
          ? `Mode hors-ligne${pending > 0 ? ` — ${pending} modification${pending > 1 ? 's' : ''} en attente` : ''}`
          : `Synchronisation de ${pending} opération${pending > 1 ? 's' : ''}...`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  offline: {
    backgroundColor: colors.marginOrange,
  },
  syncing: {
    backgroundColor: colors.accent,
  },
  text: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
});
