import { Platform } from 'react-native';

// Use JS-based stack navigator on web to avoid react-native-screens compatibility issues
export const createAppStackNavigator = Platform.OS === 'web'
  ? require('@react-navigation/stack').createStackNavigator
  : require('@react-navigation/native-stack').createNativeStackNavigator;
