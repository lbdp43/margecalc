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
  // On web, use native browser scrolling instead of RN ScrollView
  if (Platform.OS === 'web') {
    return (
      <div style={webStyles.container}>
        {decorations && <DecorativeCurve variant="bottom" />}
        {scrollable ? (
          <div style={webStyles.scroll}>
            <View style={[styles.scrollInner, style]}>{children}</View>
          </div>
        ) : (
          <View style={[styles.staticContent, style]}>{children}</View>
        )}
      </div>
    );
  }

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

// Native CSS styles for web — bypasses RN Web's broken ScrollView
const webStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    backgroundColor: colors.background,
    position: 'relative',
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollInner: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  staticContent: {
    flex: 1,
    padding: spacing.md,
  },
});
