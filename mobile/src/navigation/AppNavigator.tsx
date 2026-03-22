import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Modal, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createAppStackNavigator } from './createStack';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { ProductListScreen } from '../screens/products/ProductListScreen';
import { ProductDetailScreen } from '../screens/products/ProductDetailScreen';
import { ProductFormScreen } from '../screens/products/ProductFormScreen';
import { InvoiceScanScreen } from '../screens/products/InvoiceScanScreen';
import { CocktailListScreen } from '../screens/cocktails/CocktailListScreen';
import { CocktailFormScreen } from '../screens/cocktails/CocktailFormScreen';
import { CocktailDetailScreen } from '../screens/cocktails/CocktailDetailScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { colors, shadows } from '../theme';
import { CurvedTabBar } from '../components/ui/CurvedTabBar';

const Tab = createBottomTabNavigator();
const ProductStack = createAppStackNavigator();
const CocktailStack = createAppStackNavigator();

function ProductsNavigator() {
  return (
    <ProductStack.Navigator screenOptions={{ headerShown: false }}>
      <ProductStack.Screen name="ProductList" component={ProductListScreen} />
      <ProductStack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <ProductStack.Screen name="ProductForm" component={ProductFormScreen} />
      <ProductStack.Screen name="InvoiceScan" component={InvoiceScanScreen} />
    </ProductStack.Navigator>
  );
}

function CocktailsNavigator() {
  return (
    <CocktailStack.Navigator screenOptions={{ headerShown: false }}>
      <CocktailStack.Screen name="CocktailList" component={CocktailListScreen} />
      <CocktailStack.Screen name="CocktailDetail" component={CocktailDetailScreen} />
      <CocktailStack.Screen name="CocktailForm" component={CocktailFormScreen} />
    </CocktailStack.Navigator>
  );
}

function ScanTabButton() {
  const navigation = useNavigation<any>();
  const [menuVisible, setMenuVisible] = useState(false);

  const handleOption = (screen: string) => {
    setMenuVisible(false);
    navigation.navigate('Produits', { screen, params: {} });
  };

  return (
    <View style={scanStyles.wrapper}>
      <TouchableOpacity
        style={scanStyles.button}
        activeOpacity={0.8}
        onPress={() => setMenuVisible(true)}
      >
        <View style={scanStyles.innerCircle}>
          <Ionicons name="scan" size={32} color={colors.white} />
        </View>
      </TouchableOpacity>

      <Modal visible={menuVisible} transparent animationType="fade">
        <Pressable style={scanStyles.overlay} onPress={() => setMenuVisible(false)}>
          <View style={scanStyles.menu}>
            <TouchableOpacity
              style={scanStyles.menuItem}
              onPress={() => handleOption('ProductForm')}
            >
              <View style={scanStyles.menuIcon}>
                <Ionicons name="wine-outline" size={22} color={colors.primary} />
              </View>
              <View style={scanStyles.menuTextWrap}>
                <Text style={scanStyles.menuTitle}>Scanner un produit</Text>
                <Text style={scanStyles.menuDesc}>Photo d'une bouteille</Text>
              </View>
            </TouchableOpacity>
            <View style={scanStyles.menuDivider} />
            <TouchableOpacity
              style={scanStyles.menuItem}
              onPress={() => handleOption('InvoiceScan')}
            >
              <View style={scanStyles.menuIcon}>
                <Ionicons name="receipt-outline" size={22} color={colors.primary} />
              </View>
              <View style={scanStyles.menuTextWrap}>
                <Text style={scanStyles.menuTitle}>Scanner une facture</Text>
                <Text style={scanStyles.menuDesc}>Importer plusieurs produits</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// Placeholder screen (never rendered, tab press is intercepted)
function EmptyScreen() {
  return <View />;
}

const TAB_ICONS: Record<string, { focused: string; default: string }> = {
  'Réglages': { focused: 'settings', default: 'settings-outline' },
  'Produits': { focused: 'grid', default: 'grid-outline' },
  'Cocktails': { focused: 'wine', default: 'wine-outline' },
  'Tableau de bord': { focused: 'stats-chart', default: 'stats-chart-outline' },
};

export function AppNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CurvedTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          const iconName = focused ? icons.focused : icons.default;
          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive,
      })}
    >
      <Tab.Screen name="Réglages" component={SettingsScreen} />
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
      <Tab.Screen
        name="Cocktails"
        component={CocktailsNavigator}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Cocktails', { screen: 'CocktailList' });
          },
        })}
      />
      <Tab.Screen name="Tableau de bord" component={DashboardScreen} />
    </Tab.Navigator>
  );
}

const scanStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    top: -18,
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  innerCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingBottom: 100,
    paddingHorizontal: 24,
  },
  menu: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 8,
    ...shadows.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuTextWrap: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  menuDesc: {
    fontSize: 13,
    color: colors.tabBarInactive,
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
});
