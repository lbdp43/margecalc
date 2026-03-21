import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { ProductFormScreen } from '../screens/products/ProductFormScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const ProductStack = createNativeStackNavigator();

function ProductsNavigator() {
  return (
    <ProductStack.Navigator screenOptions={{ headerShown: false }}>
      <ProductStack.Screen name="ProductList" component={ProductListScreen} />
      <ProductStack.Screen name="ProductForm" component={ProductFormScreen} />
    </ProductStack.Navigator>
  );
}

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Dashboard: '📊',
    Produits: '📋',
    Paramètres: '⚙️',
  };
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icons[label] || '•'}</Text>;
}

export function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.grayMedium,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Produits" component={ProductsNavigator} />
      <Tab.Screen name="Paramètres" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
