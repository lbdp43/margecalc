import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { alert } from '../../utils/alert';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/auth.store';
import * as authService from '../../services/auth.service';
import { colors, spacing, typography } from '../../theme';
import { Display, Eyebrow, Scribble } from '../../components/ui/atelier';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = NativeStackScreenProps<any, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [isAutoEntrepreneur, setIsAutoEntrepreneur] = useState(false);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleRegister = async () => {
    Keyboard.dismiss();
    if (!email || !password) {
      alert('Erreur', 'Email et mot de passe requis');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      alert('Erreur', 'Veuillez entrer une adresse email valide');
      return;
    }
    if (password.length < 8) {
      alert('Erreur', 'Le mot de passe doit contenir au moins 8 caractères');
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
      setAuth(result.token, result.user, result.refreshToken);
    } catch (err: any) {
      alert('Erreur', err.response?.data?.error || 'Inscription impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ marginBottom: spacing.lg }}>
          <Eyebrow color={colors.textMuted}>Bienvenue</Eyebrow>
          <Display size={32} style={{ marginTop: spacing.xs }}>
            Créer un compte
          </Display>
          <Scribble width={50} color={colors.primary} style={{ marginTop: spacing.xs }} />
        </View>

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="votre@email.com"
          accessibilityLabel="Adresse email"
        />
        <Input
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="8 caractères minimum"
          accessibilityLabel="Mot de passe"
        />
        <Input
          label="Nom de l'établissement"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Ex: La Brasserie des Plantes"
          accessibilityLabel="Nom de l'établissement"
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Auto-entrepreneur (pas de TVA)</Text>
          <Switch
            value={isAutoEntrepreneur}
            onValueChange={setIsAutoEntrepreneur}
            trackColor={{ true: colors.accent }}
            thumbColor={colors.white}
            accessibilityLabel="Auto-entrepreneur"
          />
        </View>

        <Button title="Créer mon compte" onPress={handleRegister} loading={loading} />
        <Button
          title="Retour à la connexion"
          onPress={() => navigation.goBack()}
          variant="outline"
          style={{ marginTop: spacing.sm }}
        />
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.xl,
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
