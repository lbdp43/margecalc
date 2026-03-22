import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  suffix?: string;
}

export const Input = React.memo(function Input({ label, error, suffix, style, ...props }: InputProps) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, suffix ? styles.inputWithSuffix : null, style]}
          placeholderTextColor={colors.tabBarInactive}
          {...props}
        />
        {suffix && (
          <View style={styles.suffixWrap}>
            <Text style={styles.suffix}>{suffix}</Text>
          </View>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    ...typography.body,
    color: colors.text,
  },
  inputWithSuffix: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  suffixWrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderTopRightRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.border,
  },
  suffix: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  error: {
    ...typography.caption,
    color: colors.marginRed,
    marginTop: spacing.xs,
  },
});
