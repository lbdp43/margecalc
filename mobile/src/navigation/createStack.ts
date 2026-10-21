// Use the JS stack navigator everywhere (react-native-screens' native stack
// has web issues). Screens render their own headers (NavBar / LargeTitleHeader).
import { Platform } from 'react-native';
import { Easing } from 'react-native';
import type { StackCardInterpolationProps, StackNavigationOptions } from '@react-navigation/stack';
import { palette } from '../theme';

export { createStackNavigator as createAppStackNavigator } from '@react-navigation/stack';

/** Web: fade + 16 px slide over 220 ms (spec §5.5). */
function forFadeSlide({ current, next, layouts }: StackCardInterpolationProps) {
  const progress = current.progress;
  return {
    cardStyle: {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
        ...(next
          ? [{ translateX: next.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.min(16, layouts.screen.width * 0.04)] }) }]
          : []),
      ],
    },
  };
}

const webTransition = {
  animation: 'timing' as const,
  config: { duration: 220, easing: Easing.bezier(0, 0, 0, 1) },
};
const webTransitionClose = {
  animation: 'timing' as const,
  config: { duration: 180, easing: Easing.bezier(0.3, 0, 1, 1) },
};

/** Default options for every stack (headerShown false, D1 background, web-friendly animation). */
export const stackScreenOptions: StackNavigationOptions = {
  headerShown: false,
  cardStyle: { backgroundColor: palette.bg, flex: 1 },
  ...(Platform.OS === 'web'
    ? {
        animationEnabled: true,
        gestureEnabled: false,
        cardOverlayEnabled: false,
        cardShadowEnabled: false,
        cardStyleInterpolator: forFadeSlide,
        transitionSpec: { open: webTransition, close: webTransitionClose },
      }
    : {}),
};
