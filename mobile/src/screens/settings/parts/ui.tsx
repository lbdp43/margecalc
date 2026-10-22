/**
 * Small building blocks shared by the Réglages sections and sheets.
 * Everything is composed from the D1 kit (tokens + components); nothing here
 * re-implements a kit component.
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, FadeIn, IconName, SectionHeader, Skeleton } from '../../../components/ui';
import { fontFamily, palette, radius, type } from '../../../theme';

/** A titled group of the Réglages screen (entrance staggered by `index`). */
export function SettingsSection({
  title,
  index,
  right,
  footer,
  children,
  testID,
}: {
  title: string;
  index: number;
  right?: React.ReactNode;
  footer?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <FadeIn index={index} style={[styles.section, index === 0 && styles.sectionFirst]} testID={testID}>
      <SectionHeader title={title} right={right ? <View style={styles.headerRight}>{right}</View> : undefined} style={styles.sectionHeader} />
      {children}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </FadeIn>
  );
}

/** Filled count pill (unread replies, open tickets). */
export function CountPill({ count, tone = 'brand', style }: { count: number; tone?: 'brand' | 'bad'; style?: StyleProp<ViewStyle> }) {
  if (!count) return null;
  return (
    <View
      style={[styles.pill, { backgroundColor: tone === 'bad' ? palette.bad : palette.em700 }, style]}
      accessibilityLabel={`${count} nouveau${count > 1 ? 'x' : ''}`}
    >
      <Text style={styles.pillText} maxFontSizeMultiplier={1.3}>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
}

/** Right accessory of a ListRow: optional pill + chevron. */
export function PillChevron({ count, tone }: { count: number; tone?: 'brand' | 'bad' }) {
  return (
    <View style={styles.pillChevron}>
      <CountPill count={count} tone={tone} />
      <Ionicons name="chevron-forward" size={18} color={palette.text4} />
    </View>
  );
}

/** Placeholder with the shape of a ListRow (icon tile + two lines). */
export function RowSkeleton({ last }: { last?: boolean }) {
  return (
    <View style={[styles.skelRow, !last && styles.skelDivider]}>
      <Skeleton width={40} height={40} radius={12} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="48%" height={13} />
        <Skeleton width="72%" height={11} />
      </View>
    </View>
  );
}

/** « ‹ Retour » link at the top of a sheet's sub-view. */
export function SheetBack({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.back}>
      <Button title={label} variant="text" size="sm" icon="chevron-back" onPress={onPress} style={styles.backBtn} haptic="select" />
    </View>
  );
}

/** Calm information card (surface2) with a leading icon. */
export function InfoNote({ icon = 'information-circle-outline', children, style, tone = 'neutral' }: {
  icon?: IconName;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'neutral' | 'brand';
}) {
  return (
    <View style={[styles.note, tone === 'brand' && { backgroundColor: palette.em50 }, style]}>
      <Ionicons name={icon} size={20} color={palette.em700} style={{ marginTop: 1 }} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/** Inline error line (alert icon + bad text), for sheet-level errors. */
export function ErrorLine({ message, style }: { message?: string | null; style?: StyleProp<ViewStyle> }) {
  if (!message) return null;
  return (
    <View style={[styles.errorRow, style]} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={16} color={palette.bad} style={{ marginTop: 1 }} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/** Small surface2 stat box used in admin sheets. */
export function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <View style={styles.mini} accessible accessibilityLabel={`${label} : ${value}`}>
      <Text style={styles.miniLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.miniValue, tone === 'bad' ? { color: palette.bad } : tone === 'good' ? { color: palette.good } : null]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  sectionFirst: { marginTop: 0 },
  headerRight: { justifyContent: 'center', alignItems: 'flex-end' },
  sectionHeader: { marginBottom: 6, paddingHorizontal: 2 },
  footer: { ...type.footnote, color: palette.text3, marginTop: 8, paddingHorizontal: 4 },
  pill: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  pillChevron: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 12, minHeight: 56 },
  skelDivider: { borderBottomWidth: 1, borderBottomColor: palette.line, marginRight: 12 },
  back: { flexDirection: 'row', marginLeft: -12, marginTop: -4, marginBottom: 4 },
  backBtn: { paddingHorizontal: 8 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: palette.surface2,
    borderRadius: radius.md,
    padding: 14,
  },
  noteText: { ...type.callout, color: palette.text2, flex: 1, minWidth: 0 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 },
  errorText: { ...type.footnote, color: palette.bad, flex: 1 },
  mini: {
    flex: 1,
    minWidth: 0,
    backgroundColor: palette.surface2,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  miniLabel: { ...type.footnote, color: palette.text3 },
  miniValue: { ...type.numM, color: palette.ink },
});
