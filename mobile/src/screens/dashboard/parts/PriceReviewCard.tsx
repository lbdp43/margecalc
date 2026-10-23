/**
 * « 3 prix à vérifier · Achat ×4, à confirmer  [Vérifier] »
 * (polish n° 2): the selling prices an invoice computed (purchase ×4) that
 * nobody confirmed yet (`priceToReview`). Shown under the tiles only while
 * there are some; « Vérifier » opens Mes produits on them
 * (`goToProductList(nav, { review: true })`, chip « Prix à vérifier · 3 ✕ »).
 * Amber like the cards' « Prix à vérifier » badge. The card itself is not
 * pressable (the button is the one target: no nested buttons on web).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from '../../../components/ui';
import { marginColors, palette, type } from '../../../theme';
import { plural } from '../../../utils/format';

export const PriceReviewCard = React.memo(function PriceReviewCard({ count, onReview }: { count: number; onReview: () => void }) {
  const c = marginColors.orange;
  return (
    <Card padding={14} testID="dashboard-review-prices">
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.bg }]}>
          <Ionicons name="alert-circle-outline" size={22} color={c.fg} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title}>{plural(count, 'prix à vérifier', 'prix à vérifier')}</Text>
          <Text style={styles.meta}>{`Achat ×4, à\u00A0confirmer`}</Text>
        </View>
        <Button
          title="Vérifier"
          variant="secondary"
          size="sm"
          onPress={onReview}
          style={styles.button}
          accessibilityLabel={`Vérifier ${plural(count, 'prix calculé', 'prix calculés')} fois 4`}
          testID="dashboard-review-prices-open"
        />
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0 },
  title: { ...type.headline, color: palette.ink },
  meta: { ...type.footnote, color: palette.text2, marginTop: 1 },
  button: { paddingHorizontal: 14 },
});
