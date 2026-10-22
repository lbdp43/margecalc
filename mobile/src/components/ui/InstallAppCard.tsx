/**
 * « Installer MargeBar Pro » (web only: renders nothing on native).
 *
 *   <InstallAppCardSlot topGap={12} />        dashboard: shows while `shouldShowCard`,
 *                                             expands / fades in, fades / collapses out
 *   const flow = useInstallFlow();            Réglages row: flow.install() + {flow.sheet}
 *   <IosInstallSheet visible onClose />       the two illustrated steps (Partager › « Sur l’écran d’accueil »)
 *
 * Card: em50 tile with the app mark, « Installer MargeBar Pro », one sentence,
 * a small primary « Installer » (native prompt) or « Comment faire ? » (iOS),
 * and two quiet buttons « Plus tard » (7 days) and « Ne plus afficher »
 * (permanent; Réglages › Application keeps the way back).
 * Logic and persistence: utils/pwaInstall.ts.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { motion, palette, radius, type } from '../../theme';
import { InstallOutcome, usePwaInstall, IosBrowser } from '../../utils/pwaInstall';
import { BrandMark } from './Brand';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Card } from './Card';
import { FadeIn, useReduceMotion } from './motion';
import { toast } from './Toast';
import { NBSP } from '../../utils/format';

const isWeb = Platform.OS === 'web';

// ─── Install flow (shared by the card and Réglages) ────────────────────────
export function useInstallFlow() {
  const pwa = usePwaInstall();
  const [sheetVisible, setSheetVisible] = useState(false);
  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const { canPromptNatively, isIOS, promptInstall } = pwa;
  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (canPromptNatively) return promptInstall();
    if (isIOS) {
      setSheetVisible(true);
      return 'unavailable';
    }
    return 'unavailable';
  }, [canPromptNatively, isIOS, promptInstall]);
  const sheet = isWeb && pwa.isIOS ? (
    <IosInstallSheet visible={sheetVisible} onClose={closeSheet} device={pwa.iosDevice} browser={pwa.iosBrowser} />
  ) : null;
  return { ...pwa, install, sheet, sheetVisible, closeSheet };
}

// ─── The card ──────────────────────────────────────────────────────────────
export interface InstallAppCardProps {
  isIOS: boolean;
  onInstall: () => void;
  onLater: () => void;
  onNever: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ACTION_GAP = 4;

export function InstallAppCard({ isIOS, onInstall, onLater, onNever, style, testID = 'install-card' }: InstallAppCardProps) {
  // The three actions sit on one line when they fit; otherwise the primary
  // takes the full width and the quiet pair goes under it, centred.
  const [stacked, setStacked] = useState(false);
  const rowWidth = useRef(0);
  const natural = useRef({ primary: 0, quiet: 0 });
  const decide = useCallback(() => {
    const { primary, quiet } = natural.current;
    if (!rowWidth.current || !primary || !quiet) return;
    setStacked(primary + ACTION_GAP + quiet > rowWidth.current + 0.5);
  }, []);
  const onRow = useCallback(
    (e: LayoutChangeEvent) => {
      rowWidth.current = e.nativeEvent.layout.width;
      decide();
    },
    [decide],
  );
  // Natural widths are only meaningful inline (stacked, the primary is stretched).
  const onPrimary = useCallback(
    (e: LayoutChangeEvent) => {
      if (stacked) return;
      natural.current.primary = e.nativeEvent.layout.width;
      decide();
    },
    [stacked, decide],
  );
  const onQuiet = useCallback(
    (e: LayoutChangeEvent) => {
      if (stacked) return;
      natural.current.quiet = e.nativeEvent.layout.width;
      decide();
    },
    [stacked, decide],
  );

  return (
    <Card padding={14} style={style} testID={testID}>
      <View style={styles.head}>
        <View style={styles.tile} accessible={false}>
          <BrandMark size={28} />
          <View style={styles.tileBadge}>
            <Ionicons name="arrow-down" size={11} color={palette.onEmerald} />
          </View>
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} accessibilityRole="header">
            Installer MargeBar Pro
          </Text>
          <Text style={styles.text}>Accès en un geste depuis votre écran d’accueil, plein écran.</Text>
        </View>
      </View>
      <View style={[styles.actions, stacked && styles.actionsStacked]} onLayout={onRow}>
        <View onLayout={onPrimary} style={stacked ? styles.primaryStacked : null}>
          <Button
            title={isIOS ? 'Comment faire ?' : 'Installer'}
            icon={isIOS ? 'share-outline' : 'download-outline'}
            size="sm"
            onPress={onInstall}
            haptic="tap"
            accessibilityLabel={isIOS ? 'Comment installer MargeBar Pro' : 'Installer MargeBar Pro'}
            testID={`${testID}-install`}
          />
        </View>
        <View onLayout={onQuiet} style={[styles.quiet, stacked && styles.quietStacked]}>
          <Button
            title="Plus tard"
            variant="text"
            size="sm"
            onPress={onLater}
            haptic="select"
            style={[styles.quietBtn, stacked && styles.quietBtnStacked]}
            textStyle={styles.quietText}
            accessibilityLabel="Plus tard : masquer pendant 7 jours"
            testID={`${testID}-later`}
          />
          <Button
            title="Ne plus afficher"
            variant="text"
            size="sm"
            onPress={onNever}
            haptic="select"
            style={[styles.quietBtn, stacked && styles.quietBtnStacked]}
            textStyle={styles.quietText}
            testID={`${testID}-never`}
          />
        </View>
      </View>
    </Card>
  );
}

// ─── Dashboard slot: presence + height animation ──────────────────────────
type Phase = 'hidden' | 'shown' | 'entering' | 'exiting';
/** A card that appears this soon after the slot mounted is part of the screen's entrance (no expand). */
const INITIAL_WINDOW_MS = 700;

export interface InstallAppCardSlotProps {
  /** Space above / below the card, collapsed with it. */
  topGap?: number;
  bottomGap?: number;
  /** Entrance delay when the card is there from the start (screen entrance order). */
  delay?: number;
  testID?: string;
}

export function InstallAppCardSlot({ topGap = 0, bottomGap = 0, delay = 120, testID = 'install-card' }: InstallAppCardSlotProps) {
  const flow = useInstallFlow();
  const reduce = useReduceMotion();
  const show = isWeb && flow.shouldShowCard;
  const [phase, setPhase] = useState<Phase>(show ? 'shown' : 'hidden');
  const mountedAt = useRef(Date.now());
  /** The content's entrance: FadeIn when it is part of the screen entrance, the expand otherwise. */
  const [fadeSkip, setFadeSkip] = useState(false);
  const naturalH = useRef(0);
  const h = useSharedValue(0);
  const o = useSharedValue(1);
  /** 0: auto height (follows the content); 1: height driven by `h` (entering / exiting). */
  const driven = useSharedValue(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const finishEnter = useCallback(() => {
    if (phaseRef.current !== 'entering') return;
    driven.value = 0; // back to auto height: it follows the content from now on
    setPhase('shown');
  }, [driven]);
  const finishExit = useCallback(() => {
    if (phaseRef.current === 'exiting') setPhase('hidden');
  }, []);

  const expand = useCallback(
    (to: number) => {
      h.value = withTiming(to, { duration: motion.duration.base, easing: motion.easing.decel }, (done) => {
        if (done) runOnJS(finishEnter)();
      });
      o.value = withTiming(1, { duration: motion.duration.enter, easing: motion.easing.decel });
    },
    [h, o, finishEnter],
  );

  useEffect(() => {
    const current = phaseRef.current;
    if (show) {
      if (current === 'shown' || current === 'entering') return;
      const late = Date.now() - mountedAt.current > INITIAL_WINDOW_MS;
      if (reduce || (current === 'hidden' && !late)) {
        driven.value = 0;
        o.value = 1;
        setFadeSkip(reduce);
        setPhase('shown');
        return;
      }
      setFadeSkip(true);
      if (current === 'hidden') {
        // Starts collapsed; the first measure (onLayout) expands it.
        h.value = 0;
        o.value = 0;
        driven.value = 1;
        setPhase('entering');
      } else {
        // Was leaving: come back from where it is.
        setPhase('entering');
        if (naturalH.current) expand(naturalH.current);
      }
      return;
    }
    if (current === 'hidden' || current === 'exiting') return;
    if (reduce) {
      setPhase('hidden');
      return;
    }
    // Leave: fade, then collapse the space (nothing below jumps).
    h.value = naturalH.current;
    driven.value = 1;
    setPhase('exiting');
    o.value = withTiming(0, { duration: motion.duration.fast, easing: motion.easing.standard }, (faded) => {
      if (!faded) return;
      h.value = withTiming(0, { duration: motion.duration.base, easing: motion.easing.standard }, (done) => {
        if (done) runOnJS(finishExit)();
      });
    });
  }, [show, reduce, h, o, driven, expand, finishExit]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const next = e.nativeEvent.layout.height;
      if (!next) return;
      const first = !naturalH.current;
      naturalH.current = next;
      // Entering: expand to the measured height (again if the content grew meanwhile).
      if (phaseRef.current === 'entering' && (first || h.value < next)) expand(next);
    },
    [h, expand],
  );

  // 'auto' (not a missing key): on web the last animated height would otherwise stay on the element.
  const animated = useAnimatedStyle(() => ({ height: driven.value ? h.value : 'auto', opacity: o.value }));

  const later = useCallback(() => flow.snooze(7), [flow]);
  const never = useCallback(() => {
    flow.dismissForever();
    toast.info('Vous pourrez l’installer depuis Réglages', { icon: 'settings-outline' });
  }, [flow]);
  const install = useCallback(() => {
    flow.install();
  }, [flow]);

  if (!isWeb || phase === 'hidden') return flow.sheet;

  return (
    <>
      {/* Clipped only while the height animates (the card's shadow shows once settled). */}
      <Animated.View style={[phase === 'shown' ? null : styles.clip, animated]} testID={`${testID}-slot`}>
        <View onLayout={onLayout} style={{ paddingTop: topGap, paddingBottom: bottomGap }}>
          <FadeIn delay={delay} skip={fadeSkip}>
            <InstallAppCard isIOS={flow.isIOS} onInstall={install} onLater={later} onNever={never} testID={testID} />
          </FadeIn>
        </View>
      </Animated.View>
      {flow.sheet}
    </>
  );
}

// ─── iOS: how to add to the home screen ────────────────────────────────────
export interface IosInstallSheetProps {
  visible: boolean;
  onClose: () => void;
  device?: 'iPhone' | 'iPad' | null;
  browser?: IosBrowser;
}

function shareHint(device: 'iPhone' | 'iPad' | null | undefined, browser: IosBrowser | undefined): string {
  if (browser === 'chrome') return 'En haut à droite, dans la barre d’adresse de Chrome.';
  if (browser === 'firefox' || browser === 'edge') return `Dans le menu du navigateur, puis «${NBSP}Partager${NBSP}».`;
  if (device === 'iPad') return 'En haut à droite, à côté de la barre d’adresse.';
  return `En bas de l’écran dans Safari, ou dans le menu «${NBSP}…${NBSP}» de la barre d’adresse.`;
}

export function IosInstallSheet({ visible, onClose, device, browser }: IosInstallSheetProps) {
  if (!isWeb) return null;
  const where = device === 'iPad' ? 'de votre iPad' : 'de votre iPhone';
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Installer MargeBar Pro"
      subline={`Sur l’écran d’accueil ${where}, en deux gestes.`}
      footer={<Button title="J’ai compris" onPress={onClose} testID="ios-install-done" />}
      accessibilityLabel="Installer MargeBar Pro sur l’écran d’accueil"
      testID="ios-install-sheet"
    >
      <View style={styles.step}>
        <StepNumber n={1} />
        <View style={styles.stepBody}>
          <View style={styles.stepTitleRow}>
            <Text style={styles.stepTitle}>Touchez Partager</Text>
            <View style={styles.shareGlyph} accessibilityLabel="icône Partager">
              <Ionicons name="share-outline" size={18} color={palette.em700} />
            </View>
          </View>
          <Text style={styles.stepHint}>{shareHint(device, browser)}</Text>
          <ToolbarIllustration />
        </View>
      </View>

      <View style={[styles.step, styles.stepGap]}>
        <StepNumber n={2} />
        <View style={styles.stepBody}>
          <Text style={styles.stepTitle}>{`Choisissez «${NBSP}Sur l’écran d’accueil${NBSP}»`}</Text>
          <Text style={styles.stepHint}>{`Faites défiler la liste si besoin, puis touchez «${NBSP}Ajouter${NBSP}».`}</Text>
          <View style={styles.menuMock} accessible={false}>
            <View style={styles.menuRowMuted}>
              <Text style={styles.menuTextMuted}>Ajouter aux favoris</Text>
              <Ionicons name="star-outline" size={18} color={palette.text3} />
            </View>
            <View style={styles.menuRow}>
              <Text style={styles.menuText}>Sur l’écran d’accueil</Text>
              <View style={styles.addSquare}>
                <Ionicons name="add" size={14} color={palette.ink} />
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.note}>
        <BrandMark size={32} />
        <Text style={styles.noteText}>MargeBar Pro s’ouvrira ensuite en plein écran, comme une application, depuis son icône.</Text>
      </View>
    </BottomSheet>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <View style={styles.stepNumber} accessible={false}>
      <Text style={styles.stepNumberText}>{n}</Text>
    </View>
  );
}

/** A browser toolbar with the Partager button picked out. */
function ToolbarIllustration() {
  const icons: Array<React.ComponentProps<typeof Ionicons>['name']> = ['chevron-back', 'chevron-forward', 'share-outline', 'book-outline', 'copy-outline'];
  return (
    <View style={styles.toolbar} accessible={false}>
      {icons.map((name) =>
        name === 'share-outline' ? (
          <View key={name} style={styles.toolbarActive}>
            <Ionicons name={name} size={20} color={palette.em700} />
          </View>
        ) : (
          <Ionicons key={name} name={name} size={20} color={palette.text4} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Card
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.icon,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.em700,
    borderWidth: 2,
    borderColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.headline, color: palette.ink },
  text: { ...type.footnote, color: palette.text2 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ACTION_GAP, marginTop: 12 },
  actionsStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  primaryStacked: { alignSelf: 'stretch' },
  quiet: { flexDirection: 'row', alignItems: 'center', marginRight: -8 },
  // The 44 pt touch targets reach into the card padding, so the text sits balanced.
  quietStacked: { marginRight: 0, marginBottom: -8, justifyContent: 'center' },
  quietBtn: { paddingHorizontal: 8 },
  quietBtnStacked: { flex: 1 },
  quietText: { ...type.footnoteStrong, color: palette.text2 },
  // Slot
  clip: { overflow: 'hidden' },
  // iOS sheet
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepGap: { marginTop: 20 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.em700,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: { ...type.footnoteStrong, color: palette.onEmerald },
  stepBody: { flex: 1, minWidth: 0 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  stepTitle: { ...type.headline, color: palette.ink },
  stepHint: { ...type.footnote, color: palette.text3, marginTop: 2 },
  shareGlyph: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: palette.em50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbar: {
    marginTop: 12,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: palette.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  toolbarActive: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.surface,
    borderWidth: 2,
    borderColor: palette.em700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuMock: {
    marginTop: 12,
    borderRadius: radius.sm,
    backgroundColor: palette.surface2,
    overflow: 'hidden',
  },
  menuRowMuted: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  menuTextMuted: { ...type.callout, color: palette.text3 },
  menuRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: palette.surface,
    borderWidth: 2,
    borderColor: palette.em700,
    borderRadius: radius.sm,
  },
  menuText: { ...type.calloutStrong, color: palette.ink },
  addSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: palette.em50,
  },
  noteText: { ...type.callout, color: palette.ink, flex: 1, minWidth: 0 },
});
