/**
 * Inscription — NavBar (back only), establishment name, e-mail, password
 * (live length helper, show / hide), auto-entrepreneur switch. Inline
 * validation, readable backend errors (an address already used offers « Se
 * connecter avec cette adresse »), « Créer mon compte » in the sticky bar.
 * After sign-up the foundation's WelcomeModal opens by itself (RootNavigator).
 *
 * On success the query cache is emptied BEFORE the session is set (a new
 * account never sees what a previous one left in memory).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { Button, FadeIn, ListGroup, ListRow, NavBar, Screen, StickyActionBar, TextField, toast } from '../../components/ui';
import { palette, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { useAuthStore } from '../../store/auth.store';
import * as authService from '../../services/auth.service';
import { ROUTES } from '../../navigation/routes';
import { AUTH_COLUMN, AuthHeader, FormBanner, PasswordField, ServerErrorBanner, SwitchLink, useColumnInset, useOnline } from './parts/AuthBits';
import { AuthErrorInfo, AuthField, readAuthError } from './parts/authErrors';
import { BUSINESS_NAME_MAX, businessNameError, emailError, passwordError, passwordHelper } from './parts/validation';
import { holdSpinner, useDraftEmail } from './parts/session';

type Props = StackScreenProps<any, 'Register'>;

/** RootNavigator shows the WelcomeModal while this key is unset. */
const WELCOME_SEEN_KEY = 'margebar_welcome_seen';

type Errors = Partial<Record<AuthField, string | null>>;

export function RegisterScreen({ navigation, route }: Props) {
  const initialEmail = useDraftEmail(navigation, route);
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [isAutoEntrepreneur, setIsAutoEntrepreneur] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [serverError, setServerError] = useState<AuthErrorInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [offlineNudge, setOfflineNudge] = useState(0);
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();
  const online = useOnline();
  const side = useColumnInset();
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const recheck = (field: AuthField, value: string) => {
    if (!errors[field]) return;
    const fn = field === 'email' ? emailError : field === 'password' ? (v: string) => passwordError(v, 'register') : businessNameError;
    setErrors((e) => ({ ...e, [field]: fn(value) }));
  };

  // Blur only ADDS a local error (typing clears errors): clearing here would
  // move the layout under a pointer that is pressing the next control
  // (e.g. « Se connecter avec cette adresse »).
  const blurCheck = (field: 'businessName' | 'email', value: string) => {
    if (!value.trim()) return;
    const err = field === 'email' ? emailError(value) : businessNameError(value);
    if (err) setErrors((e) => ({ ...e, [field]: err }));
  };

  const onNameChange = (v: string) => {
    setBusinessName(v);
    setServerError(null);
    recheck('businessName', v);
  };
  const onEmailChange = (v: string) => {
    setEmail(v);
    setServerError(null);
    setEmailTaken(false);
    recheck('email', v);
  };
  const onPasswordChange = (v: string) => {
    setPassword(v);
    setServerError(null);
    recheck('password', v);
  };

  const submit = useCallback(async () => {
    if (loading) return;
    const next: Errors = {
      businessName: businessNameError(businessName),
      email: emailError(email),
      password: passwordError(password, 'register'),
    };
    setErrors(next);
    setServerError(null);
    setEmailTaken(false);
    const firstInvalid = next.businessName ? nameRef : next.email ? emailRef : next.password ? passwordRef : null;
    if (firstInvalid) {
      haptics.warning();
      firstInvalid.current?.focus();
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
      const result = await authService.register({
        email: email.trim(),
        password,
        businessName: businessName.trim(),
        isAutoEntrepreneur,
      });
      await holdSpinner(started);
      // A brand-new account always gets the welcome sheet, even on a device
      // where someone else already saw it.
      await AsyncStorage.removeItem(WELCOME_SEEN_KEY).catch(() => {});
      haptics.success();
      // Queued behind the welcome sheet (toasts never cover an open sheet).
      toast.success('Compte créé, bienvenue !');
      queryClient.clear();
      setAuth(result.token, result.user, result.refreshToken);
    } catch (err) {
      // Same minimum as on success: a fast error never flickers the spinner.
      await holdSpinner(started);
      if (!mounted.current) return;
      const info = readAuthError(err, 'Inscription impossible pour le moment.');
      haptics.warning();
      if (Object.keys(info.fields).length) setErrors((e) => ({ ...e, ...info.fields }));
      setEmailTaken(info.kind === 'conflict');
      setServerError(info.message || info.title ? info : null);
      const f = info.fields;
      (f.businessName ? nameRef : f.email ? emailRef : f.password ? passwordRef : null)?.current?.focus();
      setLoading(false);
    }
  }, [businessName, email, password, isAutoEntrepreneur, loading, online, setAuth, queryClient]);

  // The address travels in memory, never in the URL (/connexion?email=…).
  const goLogin = () => {
    useAuthStore.getState().setDraftEmail(email.trim());
    navigation.replace(ROUTES.login);
  };

  return (
    <Screen
      header={<NavBar />}
      stickyFooter={
        <StickyActionBar
          style={{ paddingHorizontal: side }}
          primary={{ title: 'Créer mon compte', onPress: submit, loading, trailingIcon: 'arrow-forward', testID: 'register-submit' }}
        />
      }
      contentContainerStyle={styles.content}
      testID="register-screen"
    >
      <View style={styles.column}>
        <FadeIn>
          <AuthHeader title="Créez votre compte" subtitle="Gratuit, sans engagement et sans carte bancaire. Prêt en une minute." />
        </FadeIn>

        {!online ? (
          <View style={styles.bannerSlot}>
            <FormBanner
              key={offlineNudge}
              tone="neutral"
              title="Vous êtes hors ligne"
              message="L’inscription a besoin d’internet. Réessayez dès le retour du réseau."
              testID="register-offline"
            />
          </View>
        ) : null}

        <FadeIn index={1} style={styles.field}>
          <TextField
            ref={nameRef}
            label="Nom de l’établissement"
            value={businessName}
            onChangeText={onNameChange}
            onBlur={() => blurCheck('businessName', businessName)}
            placeholder="Le Comptoir des Plantes"
            autoCapitalize="words"
            autoComplete="organization"
            textContentType="organizationName"
            maxLength={BUSINESS_NAME_MAX + 20}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => emailRef.current?.focus()}
            error={errors.businessName}
            testID="register-business"
          />
        </FadeIn>
        <FadeIn index={2} style={styles.field}>
          <TextField
            ref={emailRef}
            label="Adresse e-mail"
            value={email}
            onChangeText={onEmailChange}
            onBlur={() => blurCheck('email', email)}
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
            testID="register-email"
          />
          {emailTaken ? (
            <Button
              title="Se connecter avec cette adresse"
              variant="text"
              size="sm"
              trailingIcon="arrow-forward"
              onPress={goLogin}
              style={styles.inlineAction}
              testID="register-to-login-taken"
            />
          ) : null}
        </FadeIn>
        <FadeIn index={3} style={styles.field}>
          <PasswordField
            ref={passwordRef}
            label="Mot de passe"
            value={password}
            onChangeText={onPasswordChange}
            placeholder="Choisissez un mot de passe"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={errors.password}
            helper={passwordHelper(password)}
            testID="register-password"
          />
        </FadeIn>
        {/* Right under the fields: still in view with the keyboard open. */}
        {serverError && !(serverError.kind === 'offline' && !online) ? (
          <View style={styles.bannerSlot}>
            <ServerErrorBanner error={serverError} testID="register-error" />
          </View>
        ) : null}
        <FadeIn index={4} style={styles.field}>
          <ListGroup>
            <ListRow
              icon="receipt-outline"
              iconTone="neutral"
              title="Auto-entrepreneur"
              subtitle="Sans TVA : vos prix de vente sont calculés hors TVA. Modifiable dans Réglages."
              subtitleLines={3}
              switchValue={isAutoEntrepreneur}
              onSwitchChange={setIsAutoEntrepreneur}
              testID="register-auto-entrepreneur"
            />
          </ListGroup>
        </FadeIn>
        <FadeIn index={5}>
          <Text style={styles.note}>Vos produits et vos marges restent dans votre compte. Rien n’est partagé ni revendu.</Text>
          <SwitchLink lead="Déjà un compte ?" action="Se connecter" onPress={goLogin} testID="register-to-login" />
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
  inlineAction: { alignSelf: 'flex-start', marginTop: 4, marginLeft: -12 },
  note: { ...type.footnote, color: palette.text2, textAlign: 'center', marginBottom: 4, paddingHorizontal: 8 },
});
