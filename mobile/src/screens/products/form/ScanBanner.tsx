/**
 * Lot 2 (UX audit n° 6, mockup 4) — the bottle scan goes straight to the
 * form: this banner says what was read, instead of an « Étiquette lue ·
 * Continuer » screen.
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │ [⌗] Étiquette lue                             ✕  │
 *   │     Jameson Irish Whiskey · 70 cl · 40 % vol.     │
 *   │     📷 Reprendre la photo                          │
 *   └──────────────────────────────────────────────────┘
 *
 * « Reprendre la photo » goes back to the camera; ✕ hides the banner.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconButton, PressableScale } from '../../../components/ui';
import { palette, radius, type } from '../../../theme';
import { formatDegree, formatVolumeCl } from '../../../utils/format';

export interface ScanBannerInfo {
  name: string;
  containerCl: number | null;
  degree: number | null;
}

export function ScanBanner({ info, onRetake, onDismiss }: { info: ScanBannerInfo; onRetake: () => void; onDismiss: () => void }) {
  const parts = [
    info.name.trim() || 'Nom à compléter',
    info.containerCl && info.containerCl > 0 ? formatVolumeCl(info.containerCl) : null,
    typeof info.degree === 'number' && info.degree > 0 ? formatDegree(info.degree) : null,
  ].filter(Boolean) as string[];
  const summary = parts.join(' · ');
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite" testID="scan-banner">
      <View style={styles.icon}>
        <Ionicons name="scan-outline" size={20} color={palette.em700} />
      </View>
      <View style={styles.texts}>
        <Text style={styles.title} accessibilityRole="header">
          Étiquette lue
        </Text>
        <Text style={styles.summary} testID="scan-banner-summary">
          {summary}
        </Text>
        <PressableScale
          onPress={onRetake}
          scaleTo="chip"
          haptic="select"
          hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          style={styles.retake}
          accessibilityRole="button"
          accessibilityLabel="Reprendre la photo"
          testID="scan-banner-retake"
        >
          <Ionicons name="camera-reverse-outline" size={18} color={palette.em700} />
          <Text style={styles.retakeText}>Reprendre la photo</Text>
        </PressableScale>
      </View>
      <IconButton
        icon="close"
        variant="plain"
        size={44}
        iconSize={20}
        color={palette.em800}
        onPress={onDismiss}
        accessibilityLabel="Masquer ce message"
        style={styles.close}
        testID="scan-banner-close"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
    paddingLeft: 14,
    paddingRight: 4,
    paddingTop: 12,
    paddingBottom: 4,
    borderRadius: radius.md,
    backgroundColor: palette.em50,
  },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, paddingTop: 1 },
  title: { ...type.footnoteStrong, color: palette.em800 },
  summary: { ...type.calloutStrong, color: palette.ink, marginTop: 1 },
  // 44 tall to tap (hitSlop does not grow the target on web); the negative margins keep the banner's rhythm.
  retake: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, marginTop: -2, marginBottom: -4 },
  retakeText: { ...type.footnoteStrong, color: palette.em700 },
  close: { marginTop: -8 },
});
