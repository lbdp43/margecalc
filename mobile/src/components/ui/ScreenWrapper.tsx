import React from 'react';
import { View, StyleSheet, ScrollView, ViewStyle, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';
import { DecorativeCurve } from './DecorativeCurve';

interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  decorations?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function ScreenWrapper({
  children,
  scrollable = true,
  style,
  decorations = true,
  onRefresh,
  refreshing = false,
}: ScreenWrapperProps) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {decorations && <DecorativeCurve variant="bottom" />}
      {scrollable ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined}
        >
          <View style={[styles.scrollInner, style]}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.staticContent, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { paddingTop: 'env(safe-area-inset-top, 12px)' as any } : {}),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  // Inside ScrollView: NO flex:1 so content takes natural height and scrolls
  scrollInner: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  // Outside ScrollView: flex:1 to fill screen
  staticContent: {
    flex: 1,
    padding: spacing.md,
  },
});
