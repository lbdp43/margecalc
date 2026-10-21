/**
 * Legacy `ScreenWrapper` — kept with its old props so not-yet-redesigned
 * screens keep working. It is now a thin wrapper around `Screen`:
 * 16 px padding (the old screens bleed with −16 margins), automatic bottom
 * inset for the floating tab bar, RN ScrollView scrolling on web.
 * New code: use `Screen` (see FOUNDATION.md).
 */
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '../../theme';
import { Screen, useInsideTabs } from './Screen';

interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Ignored (the Atelier decorative curves are gone). */
  decorations?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function ScreenWrapper({ children, scrollable = true, style, onRefresh, refreshing = false }: ScreenWrapperProps) {
  const insets = useSafeAreaInsets();
  const insideTabs = useInsideTabs();
  const bottom = insideTabs ? layout.contentBottomInset(insets.bottom) : Math.max(spacing.xxl, insets.bottom + 24);

  if (scrollable) {
    return (
      <Screen padded={false} bottomInset={0} onRefresh={onRefresh} refreshing={refreshing}>
        <View style={[styles.inner, { paddingBottom: bottom }, style]}>{children}</View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} bottomInset={0}>
      <View style={[styles.static, insideTabs ? { marginBottom: layout.tabBarHeight + layout.tabBarBottom(insets.bottom) } : null, style]}>
        {children}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.md },
  static: { flex: 1, padding: spacing.md, paddingBottom: 0 },
});
