import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, shadows } from '../../theme';

const TAB_HEIGHT = 64;
const NOTCH_RADIUS = 38;
const NOTCH_MARGIN = 8;
const CURVE_DEPTH = NOTCH_RADIUS + NOTCH_MARGIN;

export function CurvedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const totalHeight = TAB_HEIGHT + CURVE_DEPTH;
  const cx = width / 2; // center x of notch
  const r = NOTCH_RADIUS + NOTCH_MARGIN; // radius of the semicircular cutout

  // Organic curve: starts high on left, sweeps down into a deep
  // semicircular notch around the scan button, then rises back up on the right.
  // The edges curve upward like a yin-yang wave flowing into the notch.
  const edgeRise = 18; // how much the left/right edges rise above CURVE_DEPTH
  const baseY = CURVE_DEPTH; // baseline of the tab bar
  const topY = baseY - edgeRise; // raised edge height

  const tabBarPath = `
    M0,${baseY}
    Q${width * 0.12},${topY}
     ${width * 0.25},${topY + 2}
    C${width * 0.35},${topY + 4}
     ${cx - r - 10},${baseY + 2}
     ${cx - r},${baseY}
    C${cx - r + 2},${baseY - 6}
     ${cx - r + 12},${baseY - r * 0.7}
     ${cx - r * 0.5},${baseY - r * 0.92}
    A${r},${r} 0 0 1 ${cx + r * 0.5},${baseY - r * 0.92}
    C${cx + r - 12},${baseY - r * 0.7}
     ${cx + r - 2},${baseY - 6}
     ${cx + r},${baseY}
    C${cx + r + 10},${baseY + 2}
     ${width * 0.65},${topY + 4}
     ${width * 0.75},${topY + 2}
    Q${width * 0.88},${topY}
     ${width},${baseY}
    L${width},${totalHeight}
    L0,${totalHeight}
    Z
  `;

  return (
    <View style={[styles.container, { height: totalHeight }]}>
      {/* SVG background with notch */}
      <View style={styles.svgWrap}>
        <Svg width={width} height={totalHeight} style={styles.svg}>
          <Path d={tabBarPath} fill={colors.white} />
        </Svg>
      </View>

      {/* Tab items */}
      <View style={[styles.tabRow, { height: TAB_HEIGHT }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          // If this tab has a custom button (Scanner), render it
          if (options.tabBarButton) {
            const TabBarButton = options.tabBarButton as React.ComponentType;
            return <TabBarButton key={route.key} />;
          }

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // Get icon
          const iconElement = options.tabBarIcon?.({
            focused: isFocused,
            color: isFocused ? colors.primary : colors.tabBarInactive,
            size: 22,
          });

          const label = typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              style={styles.tabItem}
            >
              {iconElement}
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.primary : colors.tabBarInactive },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export { NOTCH_RADIUS, NOTCH_MARGIN, CURVE_DEPTH };

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  svgWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    ...shadows.lg,
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 6 : 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
