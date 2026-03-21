import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  suffix?: string;
}

export function Input({ label, error, suffix, style, ...props }: InputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, suffix ? styles.inputWithSuffix : null, style]}
          placeholderTextColor={colors.grayMedium}
          {...props}
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    ...typography.body,
    color: colors.text,
  },
  inputWithSuffix: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  suffix: {
    backgroundColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderTopRightRadius: borderRadius.sm,
    borderBottomRightRadius: borderRadius.sm,
    ...typography.body,
    color: colors.textSecondary,
  },
  error: {
    ...typography.caption,
    color: colors.marginRed,
    marginTop: spacing.xs,
  },
});
