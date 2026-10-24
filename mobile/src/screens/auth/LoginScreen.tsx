/**
 * Connexion — NavBar (back only: the large title is the one heading), BrandMark
 * header, e-mail + password with inline validation, readable backend errors
 * (wrong password, « Compte suspendu… » with « Nous écrire », too many attempts,
 * offline), « Se connecter » in the sticky bar so it rides above the keyboard.
 * Enter goes to the next field, then submits.
 *
 * On success the query cache is emptied BEFORE the session is set, so the
 * dashboard and the products are always fetched for the account that signs in.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useQueryClient } from '@tanstack/react-query';
import { FadeIn, NavBar, Screen, StickyActionBar, TextField, toast } from '../../components/ui';
import { haptics } from '../../theme/haptics';
import { useAuthStore } from '../../store/auth.store';
import * as authService from '../../services/auth.service';
import { ROUTES } from '../../navigation/routes';
import { AUTH_COLUMN, AuthHeader, FormBanner, PasswordField, ServerErrorBanner, SwitchLink, useColumnInset, useOnline } from './parts/AuthBits';
import { AuthErrorInfo, readAuthError } from './parts/authErrors';
import { emailError, passwordError } from './parts/validation';
import { holdSpinner, useDraftEmail } from './parts/session';

type Props = StackScreenProps<any, 'Login'>;

export function LoginScreen({ navigation, route }: Props) {
  const initialEmail = useDraftEmail(navigation, route);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [serverError, setServerError] = useState<AuthErrorInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [offlineNudge, setOfflineNudge] = useState(0);
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();
  const online = useOnline();
  const side = useColumnInset();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const onEmailChange = (v: string) => {
    setEmail(v);
    setServerError(null);
    // Once an error shows, re-check live so it clears as soon as it is fixed.
    if (errors.email) setErrors((e) => ({ ...e, email: emailError(v) }));
  };
  // Blur only ADDS a local error (typing clears errors): clearing here would
  // move the layout under a pointer that is pressing the next control.
  const onEmailBlur = () => {
    const err = email.trim() ? emailError(email) : null;
    if (err) setErrors((e) => ({ ...e, email: err }));
  };
  const onPasswordChange = (v: string) => {
    setPassword(v);
    setServerError(null);
    if (errors.password) setErrors((e) => ({ ...e, password: passwordError(v, 'login') }));
  };

  const submit = useCallback(async () => {
    if (loading) return;
    const next = { email: emailError(email), password: passwordError(password, 'login') };
    setErrors(next);
    setServerError(null);
    if (next.email || next.password) {
      haptics.warning();
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    if (!online) {
      // The offline banner already explains it: replay it instead of a doomed request.
      haptics.warning();
      setOfflineNudge((n) => n + 1);
      return;
    }
    setLoading(true);
    const started = Date.now();
    try {
      const result = await authService.login({ email: email.trim(), password });
      await holdSpinner(started);
      haptics.success();
      const name = result.user?.businessName?.trim();
      toast.success(name ? `Ravi de vous revoir, ${name}` : 'Connexion réussie');
      // Nothing cached for a previous account may reach this one.
      queryClient.clear();
      setAuth(result.token, result.user, result.refreshToken);
    } catch (err) {
      // Same minimum as on success: a fast « wrong password » never flickers the spinner.
      await holdSpinner(started);
      if (!mounted.current) return;
      const info = readAuthError(err, 'Connexion impossible pour le moment.');
      haptics.warning();
      if (Object.keys(info.fields).length) setErrors((e) => ({ ...e, ...info.fields }));
      setServerError(info.message || info.title ? info : null);
      if (info.kind === 'credentials') passwordRef.current?.focus();
      else if (info.fields.email) emailRef.current?.focus();
      setLoading(false);
    }
  }, [email, password, loading, online, setAuth, queryClient]);

  // The address travels in memory, never in the URL (/inscription?email=…).
  const goRegister = () => {
    useAuthStore.getState().setDraftEmail(email.trim());
    navigation.replace(ROUTES.register);
  };

  return (
    <Screen
      header={<NavBar />}
      stickyFooter={
        <StickyActionBar
          style={{ paddingHorizontal: side }}
          primary={{ title: 'Se connecter', onPress: submit, loading, icon: 'log-in-outline', testID: 'login-submit' }}
        />
      }
      contentContainerStyle={styles.content}
      testID="login-screen"
    >
      <View style={styles.column}>
        <FadeIn>
          <AuthHeader title="Ravi de vous revoir" subtitle="Connectez-vous pour retrouver vos produits, vos prix et vos marges." />
        </FadeIn>

        {!online ? (
          <View style={styles.bannerSlot}>
            <FormBanner
              key={offlineNudge}
              tone="neutral"
              title="Vous êtes hors ligne"
              message="La connexion a besoin d’internet. Réessayez dès le retour du réseau."
              testID="login-offline"
            />
          </View>
        ) : null}

        <FadeIn index={1} style={styles.field}>
          <TextField
            ref={emailRef}
            label="Adresse e-mail"
            value={email}
            onChangeText={onEmailChange}
            onBlur={onEmailBlur}
            placeholder="nom@etablissement.fr"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={errors.email}
            testID="login-email"
          />
        </FadeIn>
        <FadeIn index={2} style={styles.field}>
          <PasswordField
            ref={passwordRef}
            label="Mot de passe"
            value={password}
            onChangeText={onPasswordChange}
            placeholder="Votre mot de passe"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={errors.password}
            testID="login-password"
          />
        </FadeIn>
        {/* Right under the fields: still in view with the keyboard open. */}
        {serverError && !(serverError.kind === 'offline' && !online) ? (
          <View style={styles.bannerSlot}>
            <ServerErrorBanner error={serverError} testID="login-error" />
          </View>
        ) : null}
        <FadeIn index={3} style={styles.linkSlot}>
          <SwitchLink lead="Pas encore de compte ?" action="Créer un compte" onPress={goRegister} testID="login-to-register" />
        </FadeIn>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8 },
  column: { width: '100%', maxWidth: AUTH_COLUMN, alignSelf: 'center' },
  bannerSlot: { marginBottom: 20 },
  field: { marginBottom: 20 },
  linkSlot: { marginTop: 4 },
});
