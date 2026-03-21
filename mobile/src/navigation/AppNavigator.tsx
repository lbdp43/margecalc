import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createAppStackNavigator } from './createStack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { ProductDetailScreen } from '../screens/products/ProductDetailScreen';
import { ProductFormScreen } from '../screens/products/ProductFormScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const ProductStack = createAppStackNavigator();

function ProductsNavigator() {
  return (
    <ProductStack.Navigator screenOptions={{ headerShown: false }}>
      <ProductStack.Screen name="ProductList" component={ProductListScreen} />
      <ProductStack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <ProductStack.Screen name="ProductForm" component={ProductFormScreen} />
    </ProductStack.Navigator>
  );
}

function ScanTabButton() {
  const navigation = useNavigation<any>();

  return (
    <View style={scanStyles.wrapper}>
      <TouchableOpacity
        style={scanStyles.button}
        activeOpacity={0.8}
        onPress={() => {
          navigation.navigate('Produits', {
            screen: 'ProductForm',
            params: {},
          });
        }}
      >
        <Ionicons name="scan" size={26} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

// Placeholder screen (never rendered, tab press is intercepted)
function EmptyScreen() {
  return <View />;
}

const TAB_ICONS: Record<string, { focused: string; default: string }> = {
  'Tableau de bord': { focused: 'stats-chart', default: 'stats-chart-outline' },
  'Produits': { focused: 'grid', default: 'grid-outline' },
  'Réglages': { focused: 'settings', default: 'settings-outline' },
};

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          const iconName = focused ? icons.focused : icons.default;
          return <Ionicons name={iconName as any} size={22} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.grayMedium,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="Tableau de bord" component={DashboardScreen} />
      <Tab.Screen
        name="Produits"
        component={ProductsNavigator}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Produits', { screen: 'ProductList' });
          },
        })}
      />
      <Tab.Screen
        name="Scanner"
        component={EmptyScreen}
        options={{
          tabBarLabel: () => null,
          tabBarButton: () => <ScanTabButton />,
        }}
      />
      <Tab.Screen name="Réglages" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const scanStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    top: -8,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
