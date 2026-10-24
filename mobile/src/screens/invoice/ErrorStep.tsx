/**
 * The reading failed (422 unreadable, 429 cooldown / quota, offline, timeout…):
 * a calm card with the backend's sentence as is (our own tips only when the
 * server said nothing), and two ways out: « Réessayer » and « Saisir à la
 * main ». A cooldown counts down in the bar summary (readable text), the
 * button label never changes.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, FadeIn, NavBar, Screen, StickyActionBar } from '../../components/ui';
import { palette, type } from '../../theme';
import { NBSP } from '../../utils/format';
import type { InvoiceScanErrorInfo } from '../../services/invoice.service';
import { InvoiceFrame } from './InvoiceFrame';

export interface ErrorStepProps {
  error: InvoiceScanErrorInfo;
  previewUri: string | null;
  onRetry: () => void;
  onManual: () => void;
}

function countdownLabel(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}${NBSP}min${NBSP}${String(s).padStart(2, '0')}${NBSP}s` : `${s}${NBSP}s`;
}

const TIPS = ['Posez la facture à plat, sur une table', 'Cadrez la page entière, sans couper le tableau', 'Évitez les reflets et le contre-jour'];

export function ErrorStep({ error, previewUri, onRetry, onManual }: ErrorStepProps) {
  const { height: winH } = useWindowDimensions();
  const frameH = Math.max(150, Math.min(220, winH - 620));
  const [wait, setWait] = useState(error.retryAfterSec ?? 0);

  useEffect(() => {
    setWait(error.retryAfterSec ?? 0);
    if (!error.retryAfterSec) return;
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [error]);

  const timeTone = error.kind === 'cooldown' || error.kind === 'busy' || error.kind === 'quota' || error.kind === 'timeout';
  const noNetwork = error.kind === 'offline' || error.kind === 'unreachable';
  const tone =
    noNetwork
      ? { icon: 'cloud-offline-outline' as const, bg: palette.surface2, fg: palette.text2 }
      : timeTone
        ? { icon: 'time-outline' as const, bg: palette.warnBg, fg: palette.warn }
        : { icon: 'alert-circle-outline' as const, bg: palette.badBg, fg: palette.bad };

  const retryTitle = !error.canRetry ? null : error.resend ? 'Réessayer' : 'Reprendre une photo';
  // Our own how-to only when the backend did not already say what to do.
  const showTips = error.kind === 'unreadable' && !error.fromServer;

  return (
    <Screen
      header={<NavBar title="Scanner une facture" />}
      testID="invoice-error"
      stickyFooter={
        retryTitle ? (
          <StickyActionBar
            summary={wait > 0 ? `Nouvel essai possible dans ${countdownLabel(wait)}` : undefined}
            primary={{ title: retryTitle, icon: error.resend ? 'refresh' : 'camera-outline', onPress: onRetry, disabled: wait > 0, testID: 'invoice-retry' }}
          >
            <Button title="Saisir à la main" variant="secondary" size="sm" icon="create-outline" onPress={onManual} testID="invoice-error-manual" />
          </StickyActionBar>
        ) : (
          <StickyActionBar primary={{ title: 'Saisir à la main', icon: 'create-outline', onPress: onManual, testID: 'invoice-error-manual' }} />
        )
      }
    >
      <FadeIn offset={8}>
        <InvoiceFrame
          uri={previewUri}
          status={previewUri && !noNetwork ? 'error' : 'idle'}
          errorTone={timeTone ? 'warn' : 'bad'}
          height={frameH}
          style={styles.frameGap}
        />
      </FadeIn>
      <FadeIn delay={60} offset={8}>
        <View accessibilityLiveRegion="polite">
          <Card style={styles.card}>
            <View style={[styles.icon, { backgroundColor: tone.bg }]}>
              <Ionicons name={tone.icon} size={24} color={tone.fg} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {error.title}
            </Text>
            <Text style={styles.text} testID="invoice-error-message">
              {error.message}
            </Text>
            {showTips ? (
              <View style={styles.tips}>
                {TIPS.map((t) => (
                  <View key={t} style={styles.tipRow}>
                    <Ionicons name="checkmark-circle" size={18} color={palette.em700} />
                    <Text style={styles.tipText}>{t}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frameGap: { marginTop: 8 },
  card: { marginTop: 16, padding: 20 },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { ...type.title3, color: palette.ink },
  text: { ...type.callout, color: palette.text2, marginTop: 6 },
  tips: { marginTop: 14, gap: 8 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipText: { ...type.callout, color: palette.ink, flexShrink: 1 },
});
