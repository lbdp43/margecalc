/**
 * Logged-in navigation.
 *
 *   Root stack
 *   ├─ Tabs (floating TabBar)
 *   │   ├─ Réglages        → SettingsMain, AdminProducts
 *   │   ├─ Produits        → ProductList, ProductDetail
 *   │   └─ Tableau de bord → DashboardMain, DutyCalculator
 *   ├─ ProductForm   (create / edit — full screen, no tab bar)
 *   └─ InvoiceScan   (full screen, no tab bar)
 *
 * Form flows live in the root stack so the floating tab bar and the sticky
 * action bar never stack. Use the helpers in ./routes to navigate into
 * nested stacks (they pass `initial: false`).
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createAppStackNavigator, stackScreenOptions } from './createStack';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { ProductDetailScreen } from '../screens/products/ProductDetailScreen';
import { ProductFormScreen } from '../screens/products/ProductFormScreen';
import { InvoiceScanScreen } from '../screens/products/InvoiceScanScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { AdminProductsScreen } from '../screens/settings/AdminProductsScreen';
import { TabBar } from './TabBar';
import { withTabTransition } from './TabScene';
import { DutyCalculatorRoute } from './DutyCalculatorRoute';
import { ROUTES } from './routes';

const RootStack = createAppStackNavigator();
const Tab = createBottomTabNavigator();
const ProductStack = createAppStackNavigator();
const SettingsStack = createAppStackNavigator();
const DashboardStack = createAppStackNavigator();

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={stackScreenOptions}>
      <SettingsStack.Screen name={ROUTES.settingsMain} component={SettingsScreen} options={{ title: 'Réglages · MargeBar Pro' }} />
      <SettingsStack.Screen name={ROUTES.adminProducts} component={AdminProductsScreen} options={{ title: 'Tous les produits · MargeBar Pro' }} />
    </SettingsStack.Navigator>
  );
}

function ProductsNavigator() {
  return (
    <ProductStack.Navigator screenOptions={stackScreenOptions} initialRouteName={ROUTES.productList}>
      <ProductStack.Screen name={ROUTES.productList} component={ProductListScreen} options={{ title: 'Mes produits · MargeBar Pro' }} />
      <ProductStack.Screen name={ROUTES.productDetail} component={ProductDetailScreen} options={{ title: 'Produit · MargeBar Pro' }} />
    </ProductStack.Navigator>
  );
}

function DashboardNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={stackScreenOptions} initialRouteName={ROUTES.dashboardMain}>
      <DashboardStack.Screen name={ROUTES.dashboardMain} component={DashboardScreen} options={{ title: 'Tableau de bord · MargeBar Pro' }} />
      <DashboardStack.Screen name={ROUTES.dutyCalculator} component={DutyCalculatorRoute} options={{ title: 'Calculateur de droits · MargeBar Pro' }} />
    </DashboardStack.Navigator>
  );
}

const SettingsTab = withTabTransition(SettingsNavigator);
const ProductsTab = withTabTransition(ProductsNavigator);
const DashboardTab = withTabTransition(DashboardNavigator);

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName={ROUTES.dashboardTab}
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
    >
      <Tab.Screen
        name={ROUTES.settingsTab}
        component={SettingsTab}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate(ROUTES.settingsTab, { screen: ROUTES.settingsMain });
          },
        })}
      />
      <Tab.Screen
        name={ROUTES.productsTab}
        component={ProductsTab}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate(ROUTES.productsTab, { screen: ROUTES.productList });
          },
        })}
      />
      <Tab.Screen
        name={ROUTES.dashboardTab}
        component={DashboardTab}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate(ROUTES.dashboardTab, { screen: ROUTES.dashboardMain });
          },
        })}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={stackScreenOptions}>
      <RootStack.Screen name={ROUTES.tabs} component={MainTabs} options={{ title: 'MargeBar Pro' }} />
      <RootStack.Screen name={ROUTES.productForm} component={ProductFormScreen} options={{ title: 'Produit · MargeBar Pro' }} />
      <RootStack.Screen name={ROUTES.invoiceScan} component={InvoiceScanScreen} options={{ title: 'Scanner une facture · MargeBar Pro' }} />
    </RootStack.Navigator>
  );
}
