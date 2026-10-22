/**
 * Small building blocks shared by Connexion and Inscription:
 *   <AuthHeader title subtitle />       BrandMark + title1 + callout
 *   <FormBanner tone title message />   readable server / network error (alert role)
 *   <ServerErrorBanner error />         FormBanner for a failed request (AuthErrorInfo)
 *   useColumnInset()                    sticky-bar side padding matching the 480 column
 *   <PasswordField … />                 TextField with show / hide
 *   <SwitchLink lead action onPress />  « Pas encore de compte ? Créer un compte »
 *   useOnline()                         live connectivity
 */
import React, { forwardRef, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandMark, FadeIn, IconButton, PressableScale, TextField } from '../../../components/ui';
import type { IconName, TextFieldProps } from '../../../components/ui';
import { fontFamily, palette, radius, type } from '../../../theme';
import { isOnline, onConnectivityChange } from '../../../services/offline';
import type { AuthErrorInfo } from './authErrors';

// ─── useOnline ─────────────────────────────────────────────────────────────
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => isOnline());
  useEffect(() => {
    setOnline(isOnline());
    const off = onConnectivityChange(setOnline);
    // Web: the browser events are the source of truth on the auth screens too.
    const w = (globalThis as any).window;
    const sync = () => setOnline(isOnline());
    if (Platform.OS === 'web' && w?.addEventListener) {
      w.addEventListener('online', sync);
      w.addEventListener('offline', sync);
    }
    return () => {
      off();
      if (Platform.OS === 'web' && w?.removeEventListener) {
        w.removeEventListener('online', sync);
        w.removeEventListener('offline', sync);
      }
    };
  }, []);
  return online;
}

// ─── AuthHeader ────────────────────────────────────────────────────────────
export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <BrandMark size={48} />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

// ─── FormBanner ────────────────────────────────────────────────────────────
type BannerTone = 'bad' | 'warn' | 'neutral';

const TONES: Record<BannerTone, { bg: string; fg: string; border: string; icon: IconName }> = {
  bad: { bg: palette.badBg, fg: palette.bad, border: 'rgba(179,52,42,0.14)', icon: 'alert-circle' },
  warn: { bg: palette.warnBg, fg: palette.warn, border: 'rgba(149,86,0,0.14)', icon: 'time-outline' },
  neutral: { bg: palette.surface2, fg: palette.text2, border: palette.line, icon: 'cloud-offline-outline' },
};

export interface FormBannerProps {
  tone?: BannerTone;
  icon?: IconName;
  title?: string;
  message: string;
  testID?: string;
}

export function FormBanner({ tone = 'bad', icon, title, message, testID }: FormBannerProps) {
  const t = TONES[tone];
  return (
    <FadeIn offset={6} duration={200}>
      <View
        style={[styles.banner, { backgroundColor: t.bg, borderColor: t.border }]}
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        accessibilityLabel={[title, message].filter(Boolean).join('. ')}
        testID={testID}
      >
        <Ionicons name={icon ?? t.icon} size={20} color={t.fg} style={styles.bannerIcon} />
        <View style={styles.bannerTexts}>
          {title ? <Text style={[styles.bannerTitle, { color: t.fg }]}>{title}</Text> : null}
          {message ? <Text style={[styles.bannerText, !title && { color: tone === 'neutral' ? palette.ink : t.fg }]}>{message}</Text> : null}
        </View>
      </View>
    </FadeIn>
  );
}

/** The banner for a failed sign-in / sign-up (tone and icon from the kind of failure). */
export function ServerErrorBanner({ error, testID }: { error: AuthErrorInfo; testID?: string }) {
  const tone: BannerTone = error.kind === 'rate' ? 'warn' : error.kind === 'offline' || error.kind === 'timeout' ? 'neutral' : 'bad';
  const icon: IconName | undefined =
    error.kind === 'banned'
      ? 'lock-closed'
      : error.kind === 'offline'
        ? 'cloud-offline-outline'
        : error.kind === 'timeout'
          ? 'hourglass-outline'
          : undefined;
  return <FormBanner key={`${error.kind}-${error.message}`} tone={tone} icon={icon} title={error.title} message={error.message} testID={testID} />;
}

// ─── Layout ────────────────────────────────────────────────────────────────
/** Width of the auth form column (phones use the full width). */
export const AUTH_COLUMN = 480;

/** Side padding that keeps the sticky button on the form column on wide screens. */
export function useColumnInset(): number {
  const { width } = useWindowDimensions();
  return Math.max(20, Math.round((width - AUTH_COLUMN) / 2));
}

// ─── PasswordField ─────────────────────────────────────────────────────────
export const PasswordField = forwardRef<TextInput, Omit<TextFieldProps, 'secureTextEntry' | 'right'>>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  const inner = React.useRef<TextInput | null>(null);
  const setRefs = (node: TextInput | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<TextInput | null>).current = node;
  };
  const toggle = () => {
    setVisible((v) => !v);
    // Web: the click took the focus away from the field; give it back.
    if (Platform.OS === 'web') setTimeout(() => inner.current?.focus(), 0);
  };
  return (
    <TextField
      ref={setRefs}
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      right={
        <IconButton
          icon={visible ? 'eye-off-outline' : 'eye-outline'}
          variant="plain"
          size={40}
          iconSize={21}
          color={palette.text3}
          onPress={toggle}
          accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          testID={props.testID ? `${props.testID}-toggle` : undefined}
        />
      }
    />
  );
});

// ─── SwitchLink ────────────────────────────────────────────────────────────
export function SwitchLink({ lead, action, onPress, testID }: { lead: string; action: string; onPress: () => void; testID?: string }) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo="chip"
      accessibilityRole="link"
      accessibilityLabel={`${lead} ${action}`}
      style={styles.link}
      testID={testID}
    >
      <Text style={styles.linkText}>
        {lead} <Text style={styles.linkAction}>{action}</Text>
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 8, paddingBottom: 24 },
  title: { ...type.title1, color: palette.ink, marginTop: 20 },
  subtitle: { ...type.callout, color: palette.text2, marginTop: 6 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bannerIcon: { marginTop: 1 },
  bannerTexts: { flex: 1, minWidth: 0, gap: 2 },
  bannerTitle: { ...type.calloutStrong },
  bannerText: { ...type.callout, color: palette.text2 },
  link: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  linkText: { ...type.callout, color: palette.text2, textAlign: 'center' },
  linkAction: { fontFamily: fontFamily.semibold, color: palette.em700 },
});
