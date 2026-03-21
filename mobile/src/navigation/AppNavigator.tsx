import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createAppStackNavigator } from './createStack';
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
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name] || { focused: 'ellipse', default: 'ellipse-outline' };
          const iconName = focused ? icons.focused : icons.default;
          return <Ionicons name={iconName as any} size={22} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.grayMedium,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          paddingBottom: 4,
          height: 56,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="Tableau de bord" component={DashboardScreen} />
      <Tab.Screen name="Produits" component={ProductsNavigator} />
      <Tab.Screen name="Réglages" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
