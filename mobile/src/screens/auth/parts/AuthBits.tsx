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
import React, { forwardRef, useEffect, useLayoutEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandMark, Button, FadeIn, IconButton, PressableScale, TextField } from '../../../components/ui';
import type { IconName, TextFieldProps } from '../../../components/ui';
import { fontFamily, palette, radius, type } from '../../../theme';
import { isOnline, onConnectivityChange } from '../../../services/offline';
import type { AuthErrorInfo } from './authErrors';
import { writeToUs } from './contact';

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
/** The screen's one heading (the NavBar above it carries only « Retour »). */
export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <BrandMark size={40} />
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
  /** Optional way out, as a 44 pt text button under the message (« Nous écrire »). */
  action?: { label: string; icon?: IconName; onPress: () => void; testID?: string };
  testID?: string;
}

export function FormBanner({ tone = 'bad', icon, title, message, action, testID }: FormBannerProps) {
  const t = TONES[tone];
  return (
    <FadeIn offset={6} duration={200}>
      <View style={[styles.banner, { backgroundColor: t.bg, borderColor: t.border }]} testID={testID}>
        <Ionicons name={icon ?? t.icon} size={20} color={t.fg} style={styles.bannerIcon} />
        <View style={styles.bannerTexts}>
          <View accessible accessibilityRole="alert" accessibilityLiveRegion="assertive" accessibilityLabel={[title, message].filter(Boolean).join('. ')}>
            {title ? <Text style={[styles.bannerTitle, { color: t.fg }]}>{title}</Text> : null}
            {message ? <Text style={[styles.bannerText, !title && { color: tone === 'neutral' ? palette.ink : t.fg }]}>{message}</Text> : null}
          </View>
          {action ? (
            <Button
              title={action.label}
              icon={action.icon}
              variant="text"
              size="sm"
              onPress={action.onPress}
              style={styles.bannerAction}
              testID={action.testID}
            />
          ) : null}
        </View>
      </View>
    </FadeIn>
  );
}

/**
 * The banner for a failed sign-in / sign-up (tone and icon from the kind of failure).
 * A suspended account gets a way to reach the brewery (« Nous écrire »).
 */
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
  const action =
    error.kind === 'banned'
      ? { label: 'Nous écrire', icon: 'mail-outline' as IconName, onPress: () => writeToUs('Compte suspendu'), testID: testID ? `${testID}-contact` : undefined }
      : undefined;
  return <FormBanner key={`${error.kind}-${error.message}`} tone={tone} icon={icon} title={error.title} message={error.message} action={action} testID={testID} />;
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
/**
 * Show / hide never moves the caret. On web, swapping the input type (and the
 * focus going to the eye button) put the caret back at 0, so the next key went
 * IN FRONT of the password (« Xsecret12 »). The eye now keeps the focus in the
 * field (mouse down is cancelled) and the caret / selection captured at press
 * time is put back once the new type is in the DOM. A keyboard user who tabs
 * to the eye keeps the focus on it.
 */
export const PasswordField = forwardRef<TextInput, Omit<TextFieldProps, 'secureTextEntry' | 'right'>>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  const inner = React.useRef<TextInput | null>(null);
  const restore = React.useRef<{ start: number; end: number; at: number } | null>(null);
  const setRefs = (node: TextInput | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.MutableRefObject<TextInput | null>).current = node;
  };

  /** Web: pointer down on the eye, before the browser moves the focus. */
  const capture = (e: any) => {
    if (Platform.OS !== 'web') return;
    const el: any = inner.current;
    const doc: any = (globalThis as any).document;
    if (!el || doc?.activeElement !== el) return;
    const n = typeof el.value === 'string' ? el.value.length : 0;
    restore.current = { start: el.selectionStart ?? n, end: el.selectionEnd ?? n, at: Date.now() };
    // Cancelling mouse down keeps the focus (and the phone keyboard) in the field.
    if (e?.type === 'mousedown') e.preventDefault?.();
  };

  useLayoutEffect(() => {
    if (Platform.OS === 'web') {
      const r = restore.current;
      restore.current = null;
      const el: any = inner.current;
      if (!r || !el || Date.now() - r.at > 1500) return;
      const put = () => {
        try {
          if (el.selectionStart !== r.start || el.selectionEnd !== r.end) el.setSelectionRange?.(r.start, r.end);
        } catch {
          // some input types refuse selection APIs: nothing to restore then
        }
      };
      el.focus?.();
      // Chrome rebuilds the field's inner editor for the new type at the next
      // style pass and puts the caret at 0: force that pass now, then restore,
      // and check once more on the next frame.
      void el.offsetWidth;
      put();
      const raf = (globalThis as any).requestAnimationFrame;
      if (typeof raf === 'function') raf(put);
      return;
    }
    // Native (Android resets the cursor when secureTextEntry changes): caret to the end.
    const node: any = inner.current;
    if (node?.isFocused?.()) {
      const n = typeof props.value === 'string' ? props.value.length : 0;
      try {
        node.setNativeProps?.({ selection: { start: n, end: n } });
      } catch {
        // best effort
      }
    }
    // Only the visibility change matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <TextField
      ref={setRefs}
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      right={
        <View
          // RN-web forwards these DOM events; on native they are ignored.
          {...({ onPointerDown: capture, onMouseDown: capture, onTouchStart: capture } as any)}
        >
          <IconButton
            icon={visible ? 'eye-off-outline' : 'eye-outline'}
            variant="plain"
            size={40}
            iconSize={21}
            color={palette.text3}
            onPress={() => setVisible((v) => !v)}
            accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            testID={props.testID ? `${props.testID}-toggle` : undefined}
          />
        </View>
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
  header: { paddingTop: 4, paddingBottom: 20 },
  title: { ...type.title1, color: palette.ink, marginTop: 16 },
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
  bannerAction: { alignSelf: 'flex-start', marginLeft: -16, marginTop: 2, marginBottom: -10 },
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
