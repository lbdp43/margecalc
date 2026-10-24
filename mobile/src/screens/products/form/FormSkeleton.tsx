/**
 * Placeholder of the form while « Modifier le produit » loads. It uses the real
 * section headers and the same blocks, row for row, so nothing shifts when the
 * product arrives (the screen also shows the sticky bar, disabled).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Skeleton, SkeletonText } from '../../../components/ui';
import { FormSection } from './FieldBits';

function LabelBlock({ width }: { width: number }) {
  return <Skeleton width={width} height={14} radius={6} style={styles.label} />;
}

function Chips({ widths }: { widths: number[] }) {
  return (
    <View style={styles.chips}>
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} height={44} radius={22} />
      ))}
    </View>
  );
}

export function FormSkeleton() {
  return (
    <View accessibilityLabel="Chargement du produit" accessible>
      <FormSection title="Produit" first>
        <Card padding={12}>
          <View style={styles.row}>
            <Skeleton width={88} height={88} radius={16} />
            <View style={styles.flex}>
              <SkeletonText lines={2} />
              <Skeleton width={120} height={36} radius={12} style={{ marginTop: 10 }} />
            </View>
          </View>
        </Card>
        <View style={styles.field}>
          <LabelBlock width={120} />
          <Skeleton height={56} radius={16} />
        </View>
        <View style={styles.field}>
          <LabelBlock width={80} />
          <Chips widths={[128, 84, 96]} />
        </View>
        <View style={styles.field}>
          <LabelBlock width={90} />
          <Skeleton height={56} radius={16} />
        </View>
      </FormSection>
      <FormSection title="Contenant & achat">
        <LabelBlock width={84} />
        <Chips widths={[72, 72, 72, 72]} />
        <Skeleton height={190} radius={20} style={styles.card} />
      </FormSection>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  field: { marginTop: 16 },
  label: { marginBottom: 10 },
  chips: { flexDirection: 'row', gap: 8, overflow: 'hidden' },
  card: { marginTop: 16 },
});
