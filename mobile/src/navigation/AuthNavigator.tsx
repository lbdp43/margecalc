import React from 'react';
import { createAppStackNavigator } from './createStack';
import { LandingScreen } from '../screens/auth/LandingScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';

const Stack = createAppStackNavigator();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Landing" component={LandingScreen} options={{ title: 'MargeBar Pro — Calculateur de marges' }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Connexion · MargeBar Pro' }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Inscription · MargeBar Pro' }} />
    </Stack.Navigator>
  );
}
