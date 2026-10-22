import React from 'react';
import { createAppStackNavigator, stackScreenOptions } from './createStack';
import { LandingScreen } from '../screens/auth/LandingScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { DutyCalculatorRoute } from './DutyCalculatorRoute';
import { ROUTES } from './routes';

const Stack = createAppStackNavigator();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions} initialRouteName={ROUTES.landing}>
      <Stack.Screen name={ROUTES.landing} component={LandingScreen} options={{ title: 'MargeBar Pro — Calculateur de marges' }} />
      <Stack.Screen name={ROUTES.login} component={LoginScreen} options={{ title: 'Connexion · MargeBar Pro' }} />
      <Stack.Screen name={ROUTES.register} component={RegisterScreen} options={{ title: 'Inscription · MargeBar Pro' }} />
      <Stack.Screen name={ROUTES.dutyCalculator} component={DutyCalculatorRoute} options={{ title: 'Calculateur de droits · MargeBar Pro' }} />
    </Stack.Navigator>
  );
}
