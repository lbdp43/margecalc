/**
 * Card (spec §3.2): surface, radius 20, 1 px `line` hairline, e2 shadow, padding 16.
 *
 *   <Card>…</Card>
 *   <Card onPress={open} accessibilityLabel="…">…</Card>        pressable, scales to .98
 *   <Card variant="flat">…</Card>                                nested, no shadow
 *   <Card variant="emeraldPanel" panel={<ResultHero/>}>…</Card>  gradient top + white body
 *
 * Legacy: variant 'paper' / 'default' → default card; `noPadding` → padding 0.
 */
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { elevation, gradients, palette, radius } from '../../theme';
import { HapticKind } from '../../theme/haptics';
import { PressableScale } from './PressableScale';

export type CardVariant = 'default' | 'flat' | 'emeraldPanel' | 'paper';

export interface CardProps {
  children?: React.ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  /** Padding of the body (default 16). */
  padding?: number;
  noPadding?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  haptic?: HapticKind | false;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** emeraldPanel only: content drawn on the resultCard gradient. */
  panel?: React.ReactNode;
  panelStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Card = React.memo(function Card({
  children,
  variant = 'default',
  style,
  padding = 16,
  noPadding,
  onPress,
  onLongPress,
  haptic = false,
  accessibilityLabel,
  accessibilityHint,
  panel,
  panelStyle,
  testID,
}: CardProps) {
  const pad = noPadding ? 0 : padding;
  const isPanel = variant === 'emeraldPanel';
  const base: StyleProp<ViewStyle> = [
    styles.base,
    variant === 'flat' ? null : elevation.e2,
    { padding: isPanel ? 0 : pad },
    isPanel && styles.panelCard,
    style,
  ];

  const content = isPanel ? (
    <>
      <View style={[styles.panel, panelStyle]}>
        <LinearGradient {...gradients.resultCard} style={StyleSheet.absoluteFill} />
        <LinearGradient {...gradients.heroGlint} style={StyleSheet.absoluteFill} />
        {panel}
      </View>
      {children ? <View style={{ padding: pad }}>{children}</View> : null}
    </>
  ) : (
    children
  );

  if (onPress || onLongPress) {
    return (
      <PressableScale
        onPress={onPress}
        onLongPress={onLongPress}
        haptic={haptic}
        scaleTo="card"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        testID={testID}
        style={base}
      >
        {content}
      </PressableScale>
    );
  }

  return (
    <View style={base} accessibilityLabel={accessibilityLabel} testID={testID}>
      {content}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
  },
  panelCard: {
    overflow: 'hidden',
  },
  panel: {
    padding: 20,
    paddingBottom: 18,
    overflow: 'hidden',
  },
});
