/**
 * Logged-in navigation.
 *
 *   Root stack
 *   ├─ Tabs (floating TabBar)
 *   │   ├─ Réglages        → SettingsMain, AdminProducts
 *   │   ├─ Produits        → ProductList, ProductDetail
 *   │   └─ Tableau de bord → DashboardMain, DutyCalculator, DashboardProductDetail
 *   │                        (the same detail screen, for products opened from the dashboard)
 *   ├─ ProductForm   (create / edit — full screen, no tab bar)
 *   ├─ UnderTarget   (« Sous l’objectif » — full screen, no tab bar; a root screen so
 *   │                 « Retour » really closes it and no tab keeps it stacked)
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
import { UnderTargetScreen } from '../screens/products/underTarget/UnderTargetScreen';
import { ProductFormScreen } from '../screens/products/ProductFormScreen';
import { InvoiceScanScreen } from '../screens/products/InvoiceScanScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { AdminProductsScreen } from '../screens/settings/AdminProductsScreen';
import { TabBar } from './TabBar';
import { withTabTransition } from './TabScene';
import { DutyCalculatorRoute } from './DutyCalculatorRoute';
import { ROUTES } from './routes';
import { useAuthStore } from '../store/auth.store';

const RootStack = createAppStackNavigator();
const Tab = createBottomTabNavigator();
const ProductStack = createAppStackNavigator();
const SettingsStack = createAppStackNavigator();
const DashboardStack = createAppStackNavigator();

function SettingsNavigator() {
  // Admin screens are only registered for admins: a non-admin opening
  // /reglages/produits lands on Réglages instead of an empty admin screen.
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  return (
    <SettingsStack.Navigator screenOptions={stackScreenOptions} initialRouteName={ROUTES.settingsMain}>
      <SettingsStack.Screen name={ROUTES.settingsMain} component={SettingsScreen} options={{ title: 'Réglages · MargeBar Pro' }} />
      {isAdmin ? (
        <SettingsStack.Screen name={ROUTES.adminProducts} component={AdminProductsScreen} options={{ title: 'Tous les produits · MargeBar Pro' }} />
      ) : null}
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

// The screen is typed for the « ProductDetail » route name; it only reads `params.productId`.
const DashboardProductDetail = ProductDetailScreen as unknown as React.ComponentType<any>;

function DashboardNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={stackScreenOptions} initialRouteName={ROUTES.dashboardMain}>
      <DashboardStack.Screen name={ROUTES.dashboardMain} component={DashboardScreen} options={{ title: 'Tableau de bord · MargeBar Pro' }} />
      <DashboardStack.Screen name={ROUTES.dutyCalculator} component={DutyCalculatorRoute} options={{ title: 'Calculateur de droits · MargeBar Pro' }} />
      {/* Top & flop, « Meilleur produit »: the product opens here, so « Retour » returns to the dashboard. */}
      <DashboardStack.Screen name={ROUTES.dashboardProductDetail} component={DashboardProductDetail} options={{ title: 'Produit · MargeBar Pro' }} />
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
      // Back (Android, PWA, « Retour » at a tab root) returns to the
      // dashboard instead of the first tab; tab jumps push a browser entry.
      backBehavior="initialRoute"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
    >
      <Tab.Screen
        name={ROUTES.settingsTab}
        component={SettingsTab}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (!navigation.isFocused()) return; // switching tabs keeps the tab's stack
            e.preventDefault();
            navigation.navigate(ROUTES.settingsTab, { screen: ROUTES.settingsMain }); // re-press → stack root
          },
        })}
      />
      <Tab.Screen
        name={ROUTES.productsTab}
        component={ProductsTab}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (!navigation.isFocused()) return; // switching tabs keeps the tab's stack
            e.preventDefault();
            navigation.navigate(ROUTES.productsTab, { screen: ROUTES.productList }); // re-press → stack root
          },
        })}
      />
      <Tab.Screen
        name={ROUTES.dashboardTab}
        component={DashboardTab}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            if (!navigation.isFocused()) return; // switching tabs keeps the tab's stack
            e.preventDefault();
            navigation.navigate(ROUTES.dashboardTab, { screen: ROUTES.dashboardMain }); // re-press → stack root
          },
        })}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={stackScreenOptions} initialRouteName={ROUTES.tabs}>
      <RootStack.Screen name={ROUTES.tabs} component={MainTabs} options={{ title: 'MargeBar Pro' }} />
      <RootStack.Screen name={ROUTES.productForm} component={ProductFormScreen} options={{ title: 'Produit · MargeBar Pro' }} />
      <RootStack.Screen name={ROUTES.invoiceScan} component={InvoiceScanScreen} options={{ title: 'Scanner une facture · MargeBar Pro' }} />
      <RootStack.Screen name={ROUTES.underTarget} component={UnderTargetScreen} options={{ title: 'Sous l’objectif · MargeBar Pro' }} />
    </RootStack.Navigator>
  );
}
