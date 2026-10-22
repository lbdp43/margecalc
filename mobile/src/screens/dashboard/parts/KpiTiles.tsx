/**
 * The two StatTiles that overlap the hero: « Produits » (count-up) and
 * « Meilleur produit » (thumb + name + margin badge). Both are pressable.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ProductWithMargin } from '@margebar/shared';
import { Badge, FadeIn, StatTile } from '../../../components/ui';
import { palette, type } from '../../../theme';
import { formatPercent } from '../../../utils/format';
import { ProductThumb } from './ProductThumb';
import { spoken } from './dashboardData';

export interface KpiTilesProps {
  count: number;
  best: ProductWithMargin | null;
  onProducts: () => void;
  onBest: (id: string) => void;
}

export const KpiTiles = React.memo(function KpiTiles({ count, best, onProducts, onBest }: KpiTilesProps) {
  return (
    <View style={styles.row}>
      <FadeIn delay={60} style={styles.small}>
        <StatTile
          label="Produits"
          value={count}
          unit={count > 1 ? 'suivis' : 'suivi'}
          icon="cube-outline"
          delay={60}
          onPress={onProducts}
          style={styles.fill}
          accessibilityLabel={`${count} produit${count > 1 ? 's' : ''} suivi${count > 1 ? 's' : ''}. Ouvrir Mes produits`}
        />
      </FadeIn>
      <FadeIn delay={120} style={styles.wide}>
        <StatTile
          label="Meilleur produit"
          icon="trophy-outline"
          iconTone="trophy"
          onPress={best ? () => onBest(best.id) : undefined}
          style={styles.fill}
          accessibilityLabel={best ? `Meilleur produit : ${best.name}, marge ${spoken(formatPercent(best.computed.marginPercent))}` : 'Meilleur produit : aucun'}
        >
          {best ? (
            <View style={styles.best}>
              <ProductThumb product={best} size={36} radius={10} />
              <View style={styles.bestText}>
                <Text style={styles.bestName} numberOfLines={1}>
                  {best.name}
                </Text>
                <Badge value={best.computed.marginPercent} size="sm" style={styles.badge} />
              </View>
            </View>
          ) : (
            <Text style={styles.none}>–</Text>
          )}
        </StatTile>
      </FadeIn>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  small: { flex: 1, minWidth: 0 },
  wide: { flex: 1.25, minWidth: 0 },
  fill: { flex: 1 },
  best: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bestText: { flex: 1, minWidth: 0 },
  bestName: { ...type.headline, color: palette.ink },
  badge: { marginTop: 2 },
  none: { ...type.numL, color: palette.text4 },
});
