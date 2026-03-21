import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/auth.store';
import * as authService from '../../services/auth.service';
import { colors, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.login({ email, password });
      setAuth(result.token, result.user);
    } catch (err: any) {
      Alert.alert('Erreur', err.response?.data?.error || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>MargeBar</Text>
          <Text style={styles.subtitle}>Calculez vos marges.{'\n'}Maîtrisez votre rentabilité.</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="votre@email.com"
          />
          <Input
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••"
          />
          <Button title="Se connecter" onPress={handleLogin} loading={loading} />

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.link}>
            <Text style={styles.linkText}>
              Pas encore de compte ? <Text style={styles.linkBold}>Créer un compte</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl + spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    gap: spacing.sm,
  },
  link: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  linkText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  linkBold: {
    color: colors.primary,
    fontWeight: '600',
  },
});
