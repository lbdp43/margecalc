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
  const content = (
    <View style={[styles.content, style]}>{children}</View>
  );

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
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? {
      paddingTop: 'env(safe-area-inset-top, 12px)' as any,
      height: '100vh' as any,
      overflow: 'hidden' as any,
    } : {}),
  },
  scroll: {
    flex: 1,
    ...(Platform.OS === 'web' ? { overflow: 'auto' as any } : {}),
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
  },
  content: {
    padding: spacing.md,
  },
});
