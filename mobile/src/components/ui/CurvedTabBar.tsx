import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, shadows } from '../../theme';

const TAB_HEIGHT = 64;
const NOTCH_RADIUS = 38;
const NOTCH_MARGIN = 8;
// Extra vertical space for the S-curve + notch
const WAVE_AMP = 30; // amplitude of the yin-yang wave
const CURVE_DEPTH = NOTCH_RADIUS + NOTCH_MARGIN + WAVE_AMP;

export function CurvedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const totalHeight = TAB_HEIGHT + CURVE_DEPTH;
  const cx = width / 2;
  const r = NOTCH_RADIUS + NOTCH_MARGIN;

  // Yin-yang S-curve: left side of tab bar bulges UP into the page,
  // flows down into the center notch for the scan button,
  // then the right side stays lower — creating an asymmetric wave.
  const highY = WAVE_AMP * 0.15; // top of the wave (left side rises high)
  const midY = CURVE_DEPTH; // baseline where notch sits
  const lowY = CURVE_DEPTH - 8; // right side stays close to baseline

  const tabBarPath = `
    M0,${midY - 6}
    C${width * 0.05},${midY - 18}
     ${width * 0.10},${highY + 10}
     ${width * 0.22},${highY}
    C${width * 0.34},${highY - 2}
     ${width * 0.38},${highY + 16}
     ${cx - r - 6},${midY - 4}
    C${cx - r - 2},${midY}
     ${cx - r},${midY}
     ${cx - r},${midY}
    C${cx - r + 1},${midY - 4}
     ${cx - r + 10},${midY - r * 0.65}
     ${cx - r * 0.45},${midY - r * 0.9}
    A${r},${r} 0 0 1 ${cx + r * 0.45},${midY - r * 0.9}
    C${cx + r - 10},${midY - r * 0.65}
     ${cx + r - 1},${midY - 4}
     ${cx + r},${midY}
    C${cx + r},${midY}
     ${cx + r + 2},${midY}
     ${cx + r + 6},${midY - 2}
    C${width * 0.64},${lowY - 6}
     ${width * 0.72},${lowY - 12}
     ${width * 0.82},${lowY - 8}
    C${width * 0.92},${lowY - 4}
     ${width * 0.97},${lowY + 2}
     ${width},${lowY - 2}
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
