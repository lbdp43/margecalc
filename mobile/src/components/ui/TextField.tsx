/**
 * TextField (spec §3.3): label + optional meta on the same row, 56 tall,
 * radius 16, 1 px lineStrong → focus 2 px em700 + 4 px focus ring, error line.
 *
 *   <TextField label="Prix d’achat HT" meta="hors droits" value={v} onChangeText={setV}
 *              keyboardType="decimal-pad" suffix="€" error={err} />
 *   <TextField variant="search" leftIcon="search" placeholder="Rechercher un produit…"
 *              right={<IconButton icon="scan-outline" variant="plain" … />} />
 *
 * Numeric keyboards (decimal-pad / numeric / number-pad) use the `inputValue`
 * style (Jakarta 700 20, tabular); text fields use a calmer 17 px medium.
 * Every TextInput prop is forwarded. `style` goes to the TextInput (legacy).
 */
import React, { forwardRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputFocusEventData,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevation, fontFamily, palette, radius, type } from '../../theme';
import { IconName } from './Icon';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  /** Trailing text on the label row (text3), e.g. « 13 catégories ». */
  meta?: string;
  suffix?: string;
  prefix?: string;
  leftIcon?: IconName;
  /** Trailing accessory inside the field (e.g. a scan IconButton). */
  right?: React.ReactNode;
  error?: string | null;
  helper?: string;
  /** default: bordered field · search: white + hairline + e1 (list screens) · sunken: surface2 (sheets). */
  variant?: 'default' | 'search' | 'sunken';
  /** Field height (default 56; search 52; sunken 48). */
  height?: number;
  containerStyle?: StyleProp<ViewStyle>;
  fieldStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  /** Force the numeric value style. */
  numeric?: boolean;
}

const NUMERIC_KEYBOARDS = new Set(['decimal-pad', 'numeric', 'number-pad', 'phone-pad']);

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    meta,
    suffix,
    prefix,
    leftIcon,
    right,
    error,
    helper,
    variant = 'default',
    height,
    containerStyle,
    fieldStyle,
    inputStyle,
    style,
    numeric,
    onFocus,
    onBlur,
    editable = true,
    keyboardType,
    accessibilityLabel,
    ...props
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const isSearch = variant !== 'default';
  const isSunken = variant === 'sunken';
  const isNumeric = numeric ?? (keyboardType ? NUMERIC_KEYBOARDS.has(keyboardType) : false);
  const h = height ?? (variant === 'search' ? 52 : isSunken ? 48 : 56);
  const hasError = !!error;
  const borderW = focused || hasError ? 2 : isSunken ? 0 : 1;
  const borderColor = hasError ? palette.bad : focused ? palette.em700 : variant === 'search' ? palette.line : palette.lineStrong;

  const handleFocus = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View style={containerStyle}>
      {label || meta ? (
        <View style={styles.labelRow}>
          {label ? (
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
          ) : (
            <View />
          )}
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.ring,
          { borderRadius: radius.md + 4, borderColor: focused && !hasError ? palette.focusRing : 'transparent' },
          hasError && focused ? { borderColor: 'rgba(179,52,42,0.12)' } : null,
        ]}
      >
        <View
          style={[
            styles.field,
            {
              height: h,
              borderWidth: borderW,
              borderColor,
              paddingHorizontal: 16 - borderW,
              backgroundColor: isSunken && !focused ? palette.surface2 : palette.surface,
              opacity: editable ? 1 : 0.6,
            },
            variant === 'search' && !focused ? elevation.e1 : null,
            fieldStyle,
          ]}
        >
          {leftIcon ? <Ionicons name={leftIcon} size={20} color={palette.text3} style={{ marginRight: 10 }} /> : null}
          {prefix ? <Text style={[styles.affix, { marginRight: 6 }]}>{prefix}</Text> : null}
          <TextInput
            ref={ref}
            {...props}
            editable={editable}
            keyboardType={keyboardType}
            accessibilityLabel={accessibilityLabel ?? label ?? props.placeholder}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholderTextColor={palette.text4}
            selectionColor={palette.em700}
            cursorColor={palette.em700 as any}
            style={[
              styles.input,
              isNumeric ? type.inputValue : isSearch ? styles.searchText : styles.textValue,
              Platform.OS === 'web' ? (styles.webInput as any) : null,
              inputStyle,
              style,
            ]}
          />
          {suffix ? <Text style={[styles.affix, { marginLeft: 8 }]}>{suffix}</Text> : null}
          {right ? <View style={{ marginLeft: 8, marginRight: -8 }}>{right}</View> : null}
        </View>
      </View>
      {hasError ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={15} color={palette.bad} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  label: { ...type.label, color: palette.text2, flexShrink: 1 },
  meta: { ...type.footnote, color: palette.text3 },
  ring: {
    borderWidth: 4,
    margin: -4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: palette.ink,
    paddingVertical: 0,
    height: '100%',
  },
  textValue: { fontFamily: fontFamily.medium, fontSize: 17, lineHeight: 22 },
  searchText: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22 },
  webInput: { outlineWidth: 0, outlineStyle: 'none' } as any,
  affix: { ...type.calloutStrong, color: palette.text3 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errorText: { ...type.footnote, color: palette.bad, flex: 1 },
  helper: { ...type.footnote, color: palette.text3, marginTop: 8 },
});
