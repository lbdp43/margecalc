import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/auth.store';
import * as authService from '../../services/auth.service';
import { colors, spacing, typography } from '../../theme';

type Props = NativeStackScreenProps<any, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [isAutoEntrepreneur, setIsAutoEntrepreneur] = useState(false);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleRegister = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Email et mot de passe requis');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.register({
        email,
        password,
        businessName: businessName || undefined,
        isAutoEntrepreneur,
      });
      setAuth(result.token, result.user);
    } catch (err: any) {
      Alert.alert('Erreur', err.response?.data?.error || 'Inscription impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Créer un compte</Text>

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
          placeholder="6 caractères minimum"
        />
        <Input
          label="Nom de l'établissement"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Ex: La Brasserie des Plantes"
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Auto-entrepreneur (pas de TVA)</Text>
          <Switch
            value={isAutoEntrepreneur}
            onValueChange={setIsAutoEntrepreneur}
            trackColor={{ true: colors.accent }}
            thumbColor={colors.white}
          />
        </View>

        <Button title="Créer mon compte" onPress={handleRegister} loading={loading} />
        <Button
          title="Retour à la connexion"
          onPress={() => navigation.goBack()}
          variant="outline"
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.xl,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    marginRight: spacing.md,
  },
});
