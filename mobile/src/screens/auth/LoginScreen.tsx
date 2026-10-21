import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { alert } from '../../utils/alert';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/auth.store';
import * as authService from '../../services/auth.service';
import { colors, spacing, typography } from '../../theme';
import { Eyebrow, Display, Script, InkStamp, Scribble } from '../../components/ui/atelier';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = NativeStackScreenProps<any, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!email || !password) {
      alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      alert('Erreur', 'Veuillez entrer une adresse email valide');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.login({ email, password });
      setAuth(result.token, result.user, result.refreshToken);
    } catch (err: any) {
      alert('Erreur', err.response?.data?.error || 'Connexion impossible');
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
        <View style={styles.header}>
          <InkStamp size={56} color={colors.primary} rotate={-6} />
          <Eyebrow color={colors.textMuted} style={{ marginTop: spacing.md }}>Le carnet du bistrot</Eyebrow>
          <Display size={36} color={colors.text} style={{ marginTop: spacing.xs, textAlign: 'center' }}>
            MargeBar Pro
          </Display>
          <Scribble width={60} color={colors.primary} style={{ marginTop: spacing.sm }} />
          <Text style={styles.subtitle}>
            Calculez vos marges.{'\n'}
            <Script size={18} color={colors.primary}>Maîtrisez votre rentabilité.</Script>
          </Text>
        </View>

        <View style={styles.form}>
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
            placeholder="••••••"
            accessibilityLabel="Mot de passe"
          />
          <Button title="Se connecter" onPress={handleLogin} loading={loading} />

          <TouchableOpacity
            onPress={() => navigation.navigate('Register')}
            style={styles.link}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>
              Pas encore de compte ? <Text style={styles.linkBold}>Créer un compte</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 24,
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
