/** Small building blocks shared by the form sections (labels, errors, rows). */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette, type } from '../../../theme';

/** Field label (13/600 text2) with an optional meta on the right. */
export function FieldLabel({ label, meta, error, style }: { label: string; meta?: string | null; error?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.labelRow, style]}>
      <Text style={[styles.label, error ? { color: palette.bad } : null]}>{label}</Text>
      {meta ? (
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/** Error line under a field: alert icon + 13 px bad text. */
export function FieldError({ message, style }: { message?: string | null; style?: StyleProp<ViewStyle> }) {
  if (!message) return null;
  return (
    <View style={[styles.errorRow, style]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Ionicons name="alert-circle" size={16} color={palette.bad} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/** Row inside a card: title + caption on the left, a control on the right (wraps on narrow screens). */
export function ControlRow({
  title,
  caption,
  children,
  error,
  divider = true,
  stacked = false,
  testID,
}: {
  title: string;
  caption?: string | null;
  children: React.ReactNode;
  error?: string | null;
  divider?: boolean;
  /** Title and caption on one line, the control full width below. */
  stacked?: boolean;
  testID?: string;
}) {
  if (stacked) {
    return (
      <View style={[styles.controlRow, divider && styles.divider]} testID={testID}>
        <View style={styles.stackedHead}>
          <Text style={[styles.controlTitle, error ? { color: palette.bad } : null]}>{title}</Text>
          {caption ? (
            <Text style={styles.stackedCaption} numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </View>
        {children}
        <FieldError message={error} style={{ marginTop: 8 }} />
      </View>
    );
  }
  return (
    <View style={[styles.controlRow, divider && styles.divider]} testID={testID}>
      <View style={styles.controlInner}>
        <View style={styles.controlTexts}>
          <Text style={[styles.controlTitle, error ? { color: palette.bad } : null]}>{title}</Text>
          {caption ? <Text style={styles.controlCaption}>{caption}</Text> : null}
        </View>
        {children}
      </View>
      <FieldError message={error} style={{ marginTop: 8 }} />
    </View>
  );
}

/** Section title (title3) with optional meta, 28 above / 10 below. */
export function FormSection({
  title,
  meta,
  first,
  children,
  onLayout,
}: {
  title: string;
  meta?: string | null;
  first?: boolean;
  children: React.ReactNode;
  onLayout?: (y: number) => void;
}) {
  return (
    <View style={first ? styles.sectionFirst : styles.section} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {meta ? (
          <Text style={styles.sectionMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  label: { ...type.label, color: palette.text2 },
  meta: { ...type.footnote, color: palette.text3, flexShrink: 1 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  errorText: { ...type.footnote, color: palette.bad, flexShrink: 1 },
  controlRow: { paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  controlInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  controlTexts: { flexGrow: 1, flexShrink: 1, flexBasis: 104, minWidth: 96 },
  controlTitle: { ...type.calloutStrong, color: palette.ink },
  controlCaption: { ...type.footnote, color: palette.text3, marginTop: 1 },
  stackedHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  stackedCaption: { ...type.footnote, color: palette.text3, flexShrink: 1, textAlign: 'right' },
  section: { marginTop: 28 },
  sectionFirst: { marginTop: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36, marginBottom: 10 },
  sectionTitle: { ...type.title3, color: palette.ink, flexShrink: 0 },
  sectionMeta: { ...type.footnoteStrong, color: palette.text3, flexShrink: 1, textAlign: 'right' },
});
