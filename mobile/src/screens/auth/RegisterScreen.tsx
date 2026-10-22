/**
 * Inscription — establishment name, e-mail, password (live length helper,
 * show / hide), auto-entrepreneur switch. Inline validation, readable backend
 * errors (an address already used offers « Se connecter avec cette adresse »),
 * « Créer mon compte » in the sticky bar. After sign-up the foundation's
 * WelcomeModal opens by itself (RootNavigator).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, FadeIn, ListGroup, ListRow, NavBar, Screen, StickyActionBar, TextField, toast } from '../../components/ui';
import { palette, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { useAuthStore } from '../../store/auth.store';
import * as authService from '../../services/auth.service';
import { ROUTES } from '../../navigation/routes';
import { AuthHeader, FormBanner, PasswordField, SwitchLink, useOnline } from './parts/AuthBits';
import { AuthErrorInfo, AuthField, readAuthError } from './parts/authErrors';
import { BUSINESS_NAME_MAX, businessNameError, emailError, passwordError, passwordHelper } from './parts/validation';

type Props = StackScreenProps<any, 'Register'>;

/** RootNavigator shows the WelcomeModal while this key is unset. */
const WELCOME_SEEN_KEY = 'margebar_welcome_seen';
const MIN_SPINNER_MS = 400;

type Errors = Partial<Record<AuthField, string | null>>;

export function RegisterScreen({ navigation, route }: Props) {
  const initialEmail = typeof route.params?.email === 'string' ? route.params.email : '';
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [isAutoEntrepreneur, setIsAutoEntrepreneur] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [serverError, setServerError] = useState<AuthErrorInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const online = useOnline();
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
    setLoading(true);
    const started = Date.now();
    try {
      const result = await authService.register({
        email: email.trim(),
        password,
        businessName: businessName.trim(),
        isAutoEntrepreneur,
      });
      const wait = MIN_SPINNER_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      // A brand-new account always gets the welcome sheet, even on a device
      // where someone else already saw it.
      await AsyncStorage.removeItem(WELCOME_SEEN_KEY).catch(() => {});
      haptics.success();
      // Queued behind the welcome sheet (toasts never cover an open sheet).
      toast.success('Compte créé, bienvenue !');
      setAuth(result.token, result.user, result.refreshToken);
    } catch (err) {
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
  }, [businessName, email, password, isAutoEntrepreneur, loading, setAuth]);

  const goLogin = () => navigation.replace(ROUTES.login, email.trim() ? { email: email.trim() } : undefined);

  return (
    <Screen
      header={<NavBar title="Inscription" />}
      stickyFooter={
        <StickyActionBar
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
              tone="neutral"
              title="Vous êtes hors ligne"
              message="L’inscription a besoin d’internet. Réessayez dès le retour du réseau."
              testID="register-offline"
            />
          </View>
        ) : null}
        {serverError ? (
          <View style={styles.bannerSlot}>
            <FormBanner
              key={`${serverError.kind}-${serverError.message}`}
              tone={serverError.kind === 'rate' ? 'warn' : serverError.kind === 'offline' || serverError.kind === 'timeout' ? 'neutral' : 'bad'}
              title={serverError.title}
              message={serverError.message}
              testID="register-error"
            />
          </View>
        ) : null}

        <FadeIn index={1} style={styles.field}>
          <TextField
            ref={nameRef}
            label="Nom de l’établissement"
            value={businessName}
            onChangeText={onNameChange}
            onBlur={() => businessName.trim() && setErrors((e) => ({ ...e, businessName: businessNameError(businessName) }))}
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
            onBlur={() => email.trim() && setErrors((e) => ({ ...e, email: emailError(email) }))}
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
          <Text style={styles.note}>
            Vos produits, vos prix et vos marges ne sont visibles que par vous. Rien n’est partagé ni revendu.
          </Text>
          <SwitchLink lead="Déjà un compte ?" action="Se connecter" onPress={goLogin} testID="register-to-login" />
        </FadeIn>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 8 },
  column: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  bannerSlot: { marginBottom: 20 },
  field: { marginBottom: 20 },
  inlineAction: { alignSelf: 'flex-start', marginTop: 4, marginLeft: -12 },
  note: { ...type.footnote, color: palette.text3, textAlign: 'center', marginBottom: 4, paddingHorizontal: 8 },
});
