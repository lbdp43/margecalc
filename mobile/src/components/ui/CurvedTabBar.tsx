import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, shadows } from '../../theme';

const TAB_HEIGHT = 70;
const WAVE_HEIGHT = 28; // amplitude of the S-curve

export function CurvedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const totalHeight = TAB_HEIGHT + WAVE_HEIGHT;

  // Smooth S-curve: right high, left low (inverted)
  const tabBarPath = `
    M0,${WAVE_HEIGHT}
    C${width * 0.35},${WAVE_HEIGHT} ${width * 0.65},0 ${width},0
    L${width},${totalHeight}
    L0,${totalHeight}
    Z
  `;

  return (
    <View style={[styles.container, { height: totalHeight }]}>
      {/* SVG wave background */}
      <View style={styles.svgWrap}>
        <Svg width={width} height={totalHeight} style={styles.svg}>
          <Path d={tabBarPath} fill={colors.primary} />
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

          const label = typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;

          const isDashboard = route.name === 'Tableau de bord';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.7}
              style={[styles.tabItem, isDashboard && styles.dashboardTabItem]}
            >
              {options.tabBarIcon?.({
                focused: isFocused,
                color: isFocused ? colors.white : 'rgba(255,255,255,0.5)',
                size: isDashboard ? 54 : 22,
              })}
              <Text
                style={[
                  isDashboard ? styles.dashboardTabLabel : styles.tabLabel,
                  { color: isFocused ? colors.white : 'rgba(255,255,255,0.5)' },
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
  dashboardTabItem: {
    flex: 1.4,
  },
  dashboardTabLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
});
