import React from 'react';
import { View, StyleSheet, ScrollView, ViewStyle, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';
import { DecorativeCurve } from './DecorativeCurve';

interface ScreenWrapperProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  decorations?: boolean;
}

export function ScreenWrapper({ children, scrollable = true, style, decorations = true }: ScreenWrapperProps) {
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
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { paddingTop: 'env(safe-area-inset-top, 12px)' as any } : {}),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
});
