/** Placeholder of the form while « Modifier le produit » loads (mirrors the real layout). */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Skeleton, SkeletonText } from '../../../components/ui';

export function FormSkeleton() {
  return (
    <View accessibilityLabel="Chargement du produit" accessible>
      <Skeleton width={110} height={22} radius={8} style={styles.title} />
      <Card padding={12}>
        <View style={styles.row}>
          <Skeleton width={88} height={88} radius={16} />
          <View style={styles.flex}>
            <SkeletonText lines={2} />
            <Skeleton width={120} height={36} radius={12} style={{ marginTop: 10 }} />
          </View>
        </View>
      </Card>
      <Skeleton width={120} height={14} radius={6} style={styles.label} />
      <Skeleton height={56} radius={16} />
      <Skeleton width={90} height={14} radius={6} style={styles.label} />
      <View style={styles.chips}>
        <Skeleton width={110} height={44} radius={22} />
        <Skeleton width={84} height={44} radius={22} />
        <Skeleton width={96} height={44} radius={22} />
      </View>
      <Skeleton width={180} height={22} radius={8} style={styles.title2} />
      <Skeleton height={190} radius={20} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { marginTop: 14, marginBottom: 14 },
  title2: { marginTop: 32, marginBottom: 14 },
  label: { marginTop: 22, marginBottom: 10 },
  chips: { flexDirection: 'row', gap: 8 },
});
