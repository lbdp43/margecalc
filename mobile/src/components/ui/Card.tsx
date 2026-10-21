import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, shadows } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'flat' | 'paper';
  noPadding?: boolean;
}

export const Card = React.memo(function Card({
  children, style, variant = 'paper', noPadding,
}: CardProps) {
  return (
    <View style={[
      styles.base,
      variant === 'paper' && styles.paper,
      variant === 'flat' && styles.flat,
      variant === 'default' && styles.default,
      noPadding && { padding: 0 },
      style,
    ]}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  paper: {
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.paper,
  },
  flat: {
    borderWidth: 1,
    borderColor: colors.borderHi,
  },
  default: {
    ...shadows.md,
  },
});
