/**
 * Full-width action card « Calculer les droits d’alcool » (spec §4.2):
 * gradient icon tile, title + « 13 catégories · Tarifs 2026 », chevron disc.
 * It needs no product data, so it also shows while the dashboard loads.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../../components/ui';
import { elevation, gradients, palette, type } from '../../../theme';
import { NBSP } from '../../../utils/format';

export const DutyActionCard = React.memo(function DutyActionCard({ onPress, categories, year }: { onPress: () => void; categories: number; year: string }) {
  return (
    <Card
      onPress={onPress}
      padding={0}
      style={styles.card}
      accessibilityLabel={`Calculer les droits d’alcool, ${categories} catégories, tarifs ${year}`}
      testID="dashboard-duty-card"
    >
      <View style={styles.row}>
        <View style={styles.iconGlow}>
          <View style={styles.iconWrap}>
            <LinearGradient {...gradients.iconTile} style={StyleSheet.absoluteFill} />
            <Ionicons name="calculator" size={23} color={palette.onEmerald} />
          </View>
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={2}>
            Calculer les droits d’alcool
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {`${categories} catégories · Tarifs${NBSP}${year}`}
          </Text>
        </View>
        <View style={styles.go}>
          <Ionicons name="chevron-forward" size={18} color={palette.em700} />
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'visible' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, paddingHorizontal: 14, paddingVertical: 12 },
  // Shadow on the outer view, gradient clipped by the inner one (iOS clips shadows with overflow hidden).
  iconGlow: { width: 48, height: 48, borderRadius: 14, backgroundColor: palette.em700, ...elevation.glow },
  iconWrap: { width: 48, height: 48, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.headline, color: palette.ink },
  meta: { ...type.footnote, color: palette.text3 },
  go: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
});
