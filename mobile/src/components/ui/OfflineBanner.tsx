import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isOnline, onConnectivityChange, getPendingCount } from '../../services/offline';
import { colors, spacing, typography } from '../../theme';

export function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    return onConnectivityChange((state) => {
      setOnline(state);
      if (state) {
        // Refresh pending count when coming online
        getPendingCount().then(setPending);
      }
    });
  }, []);

  useEffect(() => {
    getPendingCount().then(setPending);
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
          ? 'Mode hors-ligne — Les données sont en cache'
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
