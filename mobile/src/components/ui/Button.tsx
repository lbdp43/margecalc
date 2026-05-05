import React, { ReactNode } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: ReactNode;
}

export const Button = React.memo(function Button({
  title, onPress, variant = 'primary', loading, disabled, style, icon,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], isDisabled && styles.disabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline'
            ? colors.primary
            : variant === 'danger' ? colors.marginRed : colors.textLight}
        />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text style={[
            styles.text,
            variant === 'outline' && styles.textOutline,
            variant === 'danger' && styles.textDanger,
          ]}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primary: {
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    ...shadows.paper,
  },
  secondary: {
    backgroundColor: colors.secondary,
    borderWidth: 1.5,
    borderColor: colors.secondary,
    ...shadows.paper,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  danger: {
    backgroundColor: colors.marginRed + '10',
    borderWidth: 1.5,
    borderColor: colors.marginRed + '40',
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginRight: spacing.sm,
  },
  text: {
    ...typography.button,
    color: colors.textLight,
  },
  textOutline: {
    color: colors.primary,
  },
  textDanger: {
    color: colors.marginRed,
  },
});
