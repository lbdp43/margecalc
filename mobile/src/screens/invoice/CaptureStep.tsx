/**
 * Step 1 — « Photographiez la facture »: the viewfinder art, what the reading
 * does, three tips, the free daily quota. Thumb zone: « Prendre une photo »,
 * then « Choisir une image » and « Saisir à la main ».
 */
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, FadeIn, NavBar, Screen, StickyActionBar } from '../../components/ui';
import { palette, type } from '../../theme';
import { plural } from '../../utils/format';
import { InvoiceFrame } from './InvoiceFrame';
import type { PickSource } from './photo';

export interface CaptureStepProps {
  quota: { limit: number; remaining: number } | null;
  /** A pick is being opened (native permission prompt). */
  busy?: boolean;
  onPick: (source: PickSource) => void;
  onManual: () => void;
}

const TIPS: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }[] = [
  { icon: 'document-outline', title: 'À plat et en entier', text: 'Toute la page dans le cadre, sans pli' },
  { icon: 'sunny-outline', title: 'Bonne lumière', text: 'Sans reflet ni ombre sur les lignes' },
  { icon: 'albums-outline', title: 'Une page à la fois', text: 'Recommencez pour les pages suivantes' },
];

export function CaptureStep({ quota, busy, onPick, onManual }: CaptureStepProps) {
  const { height: winH, width: winW } = useWindowDimensions();
  const icons = winW >= 380; // narrow phones: labels only, so they never touch the border
  const frameH = Math.max(168, Math.min(232, winH - 640));
  // No reading left today: the photo would only be uploaded to get a refusal.
  const exhausted = !!quota && quota.remaining <= 0;

  return (
    <Screen
      header={<NavBar title="Scanner une facture" />}
      testID="invoice-capture"
      stickyFooter={
        exhausted ? (
          <StickyActionBar primary={{ title: 'Saisir à la main', icon: 'create-outline', onPress: onManual, testID: 'invoice-manual' }} />
        ) : (
          <StickyActionBar
            primary={{ title: 'Prendre une photo', icon: 'camera-outline', onPress: () => onPick('camera'), haptic: 'tap', disabled: busy, testID: 'invoice-camera' }}
          >
            <View style={styles.footRow}>
              <Button title="Choisir une image" variant="secondary" size="sm" icon={icons ? 'images-outline' : undefined} onPress={() => onPick('library')} disabled={busy} style={styles.flex} testID="invoice-library" />
              <Button title="Saisir à la main" variant="tonal" size="sm" icon={icons ? 'create-outline' : undefined} onPress={onManual} style={styles.flex} testID="invoice-manual" />
            </View>
          </StickyActionBar>
        )
      }
    >
      <FadeIn index={0}>
        <InvoiceFrame height={frameH} style={styles.frameGap} />
      </FadeIn>
      <FadeIn index={1}>
        <Text style={styles.title} accessibilityRole="header">
          Photographiez la facture
        </Text>
        <Text style={styles.lead}>
          La lecture automatique va extraire les produits, les quantités, les contenances et les prix d’achat HT. Vous vérifiez tout avant l’import.
        </Text>
      </FadeIn>

      <FadeIn index={2}>
        <Card padding={4} style={styles.tips}>
          {TIPS.map((t, i) => (
            <View key={t.title} style={[styles.tip, i < TIPS.length - 1 && styles.divider]}>
              <View style={styles.tipIcon}>
                <Ionicons name={t.icon} size={20} color={palette.em700} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.tipTitle}>{t.title}</Text>
                <Text style={styles.tipText}>{t.text}</Text>
              </View>
            </View>
          ))}
        </Card>
      </FadeIn>

      <FadeIn index={3}>
        <View style={styles.quota}>
          <Ionicons name={exhausted ? 'time-outline' : 'shield-checkmark-outline'} size={16} color={palette.text3} />
          <Text style={styles.quotaText}>
            {quota
              ? quota.remaining > 0
                ? `${plural(quota.remaining, 'lecture gratuite restante', 'lectures gratuites restantes')} aujourd’hui`
                : `Les ${quota.limit} lectures gratuites du jour sont utilisées · de nouveau possible demain`
              : 'Lecture gratuite · la photo n’est pas conservée'}
          </Text>
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  frameGap: { marginTop: 8 },
  title: { ...type.title2, color: palette.ink, marginTop: 20 },
  lead: { ...type.callout, color: palette.text2, marginTop: 6 },
  footRow: { flexDirection: 'row', gap: 10 },
  tips: { marginTop: 16 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, paddingVertical: 11 },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  tipIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.em50, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { ...type.headline, color: palette.ink },
  tipText: { ...type.footnote, color: palette.text3, marginTop: 1 },
  quota: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  quotaText: { ...type.footnote, color: palette.text3, flexShrink: 1 },
});
