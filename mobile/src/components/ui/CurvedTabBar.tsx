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

  // Path: flat left → semicircular notch in center → flat right → fill down
  const tabBarPath = `
    M0,${CURVE_DEPTH}
    L${cx - r},${CURVE_DEPTH}
    C${cx - r},${CURVE_DEPTH}
     ${cx - r + 4},${CURVE_DEPTH - r * 0.15}
     ${cx - r + r * 0.4},${CURVE_DEPTH - r * 0.75}
    A${r},${r} 0 0 1 ${cx + r - r * 0.4},${CURVE_DEPTH - r * 0.75}
    C${cx + r - 4},${CURVE_DEPTH - r * 0.15}
     ${cx + r},${CURVE_DEPTH}
     ${cx + r},${CURVE_DEPTH}
    L${width},${CURVE_DEPTH}
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
