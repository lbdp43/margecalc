/**
 * Small product thumbnail for dashboard rows and tiles: the product photo
 * (`thumbnailUrl`, cover) or the category icon in em700 on em50.
 */
import React from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ProductWithMargin } from '@margebar/shared';
import { categoryIcon } from '../../../components/ui';
import { palette } from '../../../theme';

export const ProductThumb = React.memo(function ProductThumb({ product, size = 40, radius = 12 }: { product: ProductWithMargin; size?: number; radius?: number }) {
  const uri = product.thumbnailUrl;
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: uri ? palette.surface2 : palette.em50, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Ionicons name={categoryIcon(product.category?.slug)} size={Math.round(size * 0.5)} color={palette.em700} />
      )}
    </View>
  );
});
