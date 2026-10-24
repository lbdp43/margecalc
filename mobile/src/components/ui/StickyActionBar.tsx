/**
 * StickyActionBar (spec §3.12 + graft 4): surface, top hairline, upward
 * shadow, optional colour-coded summary row above a full-width primary button.
 * Rides above the keyboard (iOS + web), so « Enregistrer » is always visible.
 * Use it through <Screen stickyFooter={…}> so the content gets the right inset.
 *
 *   <StickyActionBar
 *     summary="2 services · marge 77,5 %" summaryZone="green" summaryRight="Coeff ×3,23"
 *     primary={{ title: 'Enregistrer', onPress: save, loading: saving, icon: 'checkmark-circle' }} />
 */
import React, { useEffect, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation, marginColors, MarginZone, palette, type } from '../../theme';
import { Button, ButtonProps } from './Button';
import { nextId, useChromeStore, useKeyboardHeight, useSafeIsFocused } from './chrome';

export interface StickyActionBarProps {
  summary?: React.ReactNode;
  /** Colours the summary dot + text (margin zone). */
  summaryZone?: MarginZone;
  summaryRight?: React.ReactNode;
  primary?: Omit<ButtonProps, 'variant' | 'fullWidth'> & { variant?: ButtonProps['variant'] };
  secondary?: Omit<ButtonProps, 'fullWidth'>;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function StickyActionBar({ summary, summaryZone, summaryRight, primary, secondary, children, style }: StickyActionBarProps) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const focused = useSafeIsFocused();
  const id = useRef(nextId('sticky')).current;
  const setStickyBar = useChromeStore((s) => s.setStickyBar);
  const heightRef = useRef(0);

  // Android resizes the window itself; iOS and mobile web need the offset.
  const lift = Platform.OS === 'android' ? 0 : kb;

  useEffect(() => {
    if (focused && heightRef.current) setStickyBar(id, heightRef.current + lift);
    if (!focused) setStickyBar(id, null);
  }, [focused, lift, id, setStickyBar]);
  useEffect(() => () => setStickyBar(id, null), [id, setStickyBar]);

  const zone = summaryZone ? marginColors[summaryZone] : null;

  return (
    <View
      onLayout={(e) => {
        heightRef.current = e.nativeEvent.layout.height;
        if (focused) setStickyBar(id, heightRef.current + lift);
      }}
      style={[
        styles.bar,
        { paddingBottom: (kb > 0 ? 0 : insets.bottom) + 12, transform: [{ translateY: -lift }] },
        style,
      ]}
    >
      {summary || summaryRight ? (
        <View style={styles.summaryRow}>
          {summary ? (
            <View style={styles.summaryLeft}>
              {zone ? <View style={[styles.dot, { backgroundColor: zone.solid }]} /> : null}
              {typeof summary === 'string' ? (
                <Text style={[styles.summary, zone ? { color: zone.fg } : null]} numberOfLines={1}>
                  {summary}
                </Text>
              ) : (
                summary
              )}
            </View>
          ) : (
            <View />
          )}
          {summaryRight ? (
            typeof summaryRight === 'string' ? (
              <Text style={styles.summaryRight} numberOfLines={1}>
                {summaryRight}
              </Text>
            ) : (
              summaryRight
            )
          ) : null}
        </View>
      ) : null}
      {children}
      {primary || secondary ? (
        <View style={styles.actions}>
          {secondary ? <Button variant="secondary" {...secondary} style={[{ flex: 1 }, secondary.style]} /> : null}
          {primary ? <Button variant="primary" {...primary} style={[{ flex: secondary ? 1.4 : 1 }, primary.style]} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 10,
    ...elevation.up,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 20 },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  summary: { ...type.footnoteStrong, color: palette.text3 },
  summaryRight: { ...type.footnoteStrong, color: palette.ink, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10 },
});
