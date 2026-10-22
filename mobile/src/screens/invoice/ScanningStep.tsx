/**
 * Step 2 — the photo is prepared, sent, then read. The frame sweeps, a progress
 * bar follows the real phases (resize → upload → reading), and a three-row
 * checklist says what is happening. « Annuler » aborts the request.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, FadeIn, Meter, NavBar, Screen, StickyActionBar } from '../../components/ui';
import { palette, type } from '../../theme';
import { formatPercent } from '../../utils/format';
import { InvoiceFrame } from './InvoiceFrame';

export type ScanPhase = 'preparing' | 'sending' | 'reading' | 'done';

export interface ScanningStepProps {
  phase: ScanPhase;
  previewUri: string | null;
  /** 0..1 upload progress while sending. */
  upload: number;
  onCancel: () => void;
}

/** Progress that matches the phases: resize 0–10 %, upload 10–35 %, reading eases towards 92 %. */
function useScanProgress(phase: ScanPhase, upload: number): number {
  const [reading, setReading] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== 'reading') {
      startRef.current = null;
      setReading(0);
      return;
    }
    startRef.current = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - (startRef.current ?? Date.now())) / 1000;
      setReading(1 - Math.exp(-t / 5));
    }, 250);
    return () => clearInterval(id);
  }, [phase]);
  if (phase === 'preparing') return 0.06;
  if (phase === 'sending') return 0.1 + 0.25 * Math.max(0, Math.min(1, upload));
  if (phase === 'reading') return 0.35 + 0.57 * reading;
  return 1;
}

export function ScanningStep({ phase, previewUri, upload, onCancel }: ScanningStepProps) {
  const { height: winH } = useWindowDimensions();
  const frameH = Math.max(200, Math.min(360, winH - 500));
  const progress = useScanProgress(phase, upload);
  const [slow, setSlow] = useState(0);

  useEffect(() => {
    setSlow(0);
    if (phase !== 'reading') return;
    const a = setTimeout(() => setSlow(1), 8000);
    const b = setTimeout(() => setSlow(2), 20000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [phase]);

  const steps: { label: string; state: 'done' | 'active' | 'todo' }[] = [
    { label: 'Photo préparée', state: phase === 'preparing' ? 'active' : 'done' },
    { label: 'Envoi de l’image', state: phase === 'sending' ? 'active' : phase === 'preparing' ? 'todo' : 'done' },
    { label: 'Lecture des lignes produits', state: phase === 'reading' ? 'active' : phase === 'done' ? 'done' : 'todo' },
  ];
  const headline =
    phase === 'preparing'
      ? 'Préparation de la photo…'
      : phase === 'sending'
        ? 'Envoi de la facture…'
        : phase === 'done'
          ? 'Lecture terminée'
          : slow === 0
            ? 'Lecture de la facture…'
            : slow === 1
              ? 'Encore un instant…'
              : 'La lecture prend plus de temps que prévu…';

  return (
    <Screen
      header={<NavBar title="Scanner une facture" onBack={onCancel} />}
      testID="invoice-scanning"
      stickyFooter={
        <StickyActionBar
          primary={{ title: 'Annuler', variant: 'secondary', icon: 'close', onPress: onCancel, disabled: phase === 'done', testID: 'invoice-cancel' }}
        />
      }
    >
      <FadeIn offset={8}>
        <InvoiceFrame uri={previewUri} status={phase === 'done' ? 'done' : 'working'} height={frameH} style={styles.frameGap} />
      </FadeIn>
      <View accessibilityLiveRegion="polite">
        <Text style={styles.title} accessibilityRole="header">
          {headline}
        </Text>
        <Text style={styles.lead}>Les lignes produits sont repérées une à une. Vous pourrez tout vérifier et corriger avant l’import.</Text>
      </View>
      <FadeIn delay={80} offset={8}>
        <Card padding={0} style={styles.card}>
          <View style={styles.progressRow}>
            <Meter value={progress} color={palette.em600} style={styles.flex} accessibilityLabel={`Progression de la lecture, ${formatPercent(progress * 100, 0)}`} />
            <Text style={styles.percent}>{formatPercent(progress * 100, 0)}</Text>
          </View>
          {steps.map((s) => (
            <View key={s.label} style={[styles.step, styles.divider]}>
              <View style={[styles.dot, s.state === 'done' && styles.dotDone, s.state === 'todo' && styles.dotTodo]}>
                {s.state === 'done' ? (
                  <Ionicons name="checkmark" size={14} color={palette.onEmerald} />
                ) : s.state === 'active' ? (
                  <ActivityIndicator size="small" color={palette.em700} />
                ) : null}
              </View>
              <Text style={[styles.stepLabel, s.state === 'todo' && { color: palette.text3 }]}>{s.label}</Text>
            </View>
          ))}
        </Card>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  frameGap: { marginTop: 8 },
  title: { ...type.title2, color: palette.ink, marginTop: 20 },
  lead: { ...type.callout, color: palette.text2, marginTop: 6 },
  card: { marginTop: 16, overflow: 'hidden' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  percent: { ...type.numS, color: palette.ink, minWidth: 44, textAlign: 'right' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  divider: { borderTopWidth: 1, borderTopColor: palette.line },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: palette.em700 },
  dotTodo: { borderWidth: 2, borderColor: palette.lineStrong },
  stepLabel: { ...type.calloutStrong, color: palette.ink },
});
