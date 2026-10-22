/**
 * « Installer MargeBar Pro » (web only: renders nothing on native).
 *
 *   <InstallAppCardSlot topGap={12} />        dashboard: shows while `shouldShowCard`
 *                                             (decided per visit, see below), fades / collapses out
 *   const flow = useInstallFlow();            Réglages row: flow.install() + {flow.sheet}
 *   <IosInstallSheet visible onClose onDone /> the two illustrated steps (Partager › « Sur l’écran d’accueil »)
 *
 * Card: em50 tile with the app mark, « Installer MargeBar Pro », one sentence
 * (home screen on phones and tablets, « sa propre fenêtre » on computers), a
 * small primary « Installer » (native prompt) or « Comment faire ? » (iOS), and
 * right next to it two quiet buttons « Plus tard » (7 days) and « Ne plus
 * afficher » (permanent; Réglages › Application keeps the way back). On iOS,
 * « J’ai compris » in the steps sheet rests the card for 30 days (iOS reports
 * no installation).
 *
 * The slot never pushes the dashboard around while it is being used: the card
 * is inserted only as part of the screen's entrance (the first 250 ms after it
 * mounts) or while the dashboard is not on screen. A prompt that arrives later
 * (Chrome holds `beforeinstallprompt` until the user engaged with the page)
 * shows at the next visit. Hiding is immediate (fade, then collapse).
 * Logic and persistence: utils/pwaInstall.ts.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleProp, StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { motion, palette, radius, type } from '../../theme';
import { InstallOutcome, usePwaInstall, IosBrowser, snooze } from '../../utils/pwaInstall';
import { BrandMark } from './Brand';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Card } from './Card';
import { useSafeIsFocused } from './chrome';
import { FadeIn, useReduceMotion } from './motion';
import { toast } from './Toast';
import { NBSP } from '../../utils/format';

const isWeb = Platform.OS === 'web';

// ─── Install flow (shared by the card and Réglages) ────────────────────────
export interface InstallFlowOptions {
  /** iOS: « J’ai compris » in the steps sheet (the sheet closes either way). */
  onIosDone?: () => void;
}

export function useInstallFlow({ onIosDone }: InstallFlowOptions = {}) {
  const pwa = usePwaInstall();
  const [sheetVisible, setSheetVisible] = useState(false);
  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const onIosDoneRef = useRef(onIosDone);
  onIosDoneRef.current = onIosDone;
  const doneSheet = useCallback(() => {
    setSheetVisible(false);
    onIosDoneRef.current?.();
  }, []);
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
    <IosInstallSheet visible={sheetVisible} onClose={closeSheet} onDone={doneSheet} device={pwa.iosDevice} browser={pwa.iosBrowser} />
  ) : null;
  return { ...pwa, install, sheet, sheetVisible, closeSheet };
}

// ─── The card ──────────────────────────────────────────────────────────────
export interface InstallAppCardProps {
  isIOS: boolean;
  /** A computer: the app opens in its own window (copy). */
  desktop?: boolean;
  onInstall: () => void;
  onLater: () => void;
  onNever: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ACTION_GAP = 4;
/** Wider action rows (tablets, computers) keep the quiet pair right after the primary instead of at the far edge. */
const WIDE_ROW = 480;

export function InstallAppCard({ isIOS, desktop = false, onInstall, onLater, onNever, style, testID = 'install-card' }: InstallAppCardProps) {
  // The three actions sit on one line when they fit; otherwise the primary
  // takes the full width and the quiet pair goes under it, centred.
  const [stacked, setStacked] = useState(false);
  const { width: windowW } = useWindowDimensions();
  const [rowW, setRowW] = useState(0);
  // Before the first layout: the card spans the window minus the gutters and its padding.
  const wide = (rowW || windowW - 68) > WIDE_ROW;
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
      setRowW(rowWidth.current);
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
          <Text style={styles.text}>
            {desktop
              ? 'Ouvrez MargeBar Pro dans sa propre fenêtre, comme une application.'
              : 'Accès en un geste depuis votre écran d’accueil, plein écran.'}
          </Text>
        </View>
      </View>
      <View style={[styles.actions, wide && !stacked && styles.actionsWide, stacked && styles.actionsStacked]} onLayout={onRow}>
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
        <View onLayout={onQuiet} style={[styles.quiet, wide && !stacked && styles.quietWide, stacked && styles.quietStacked]}>
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

// ─── Dashboard slot: presence + collapse ───────────────────────────────────
type Phase = 'hidden' | 'shown' | 'exiting';
/**
 * A card that becomes available this soon after the slot mounted is part of
 * the screen's entrance (its FadeIn). Later, while the dashboard is on screen,
 * it waits for the next visit (never inserted above content in use).
 */
const ENTRANCE_WINDOW_MS = 250;
/** iOS « J’ai compris »: the steps were read; the card rests this long (iOS reports no install). */
const IOS_DONE_SNOOZE_DAYS = 30;
const snoozeAfterIosSteps = () => snooze(IOS_DONE_SNOOZE_DAYS);

export interface InstallAppCardSlotProps {
  /** Space above / below the card, collapsed with it. */
  topGap?: number;
  bottomGap?: number;
  /** Entrance delay when the card is there from the start (screen entrance order). */
  delay?: number;
  testID?: string;
}

export function InstallAppCardSlot({ topGap = 0, bottomGap = 0, delay = 120, testID = 'install-card' }: InstallAppCardSlotProps) {
  const flow = useInstallFlow({ onIosDone: snoozeAfterIosSteps });
  const reduce = useReduceMotion();
  const focused = useSafeIsFocused();
  const show = isWeb && flow.shouldShowCard;
  const mountedAt = useRef(Date.now());
  // Latched per visit: showing waits for the entrance or an off-screen moment
  // (the dashboard blurred: another tab, a pushed screen, a form); hiding never waits.
  const [gate, setGate] = useState(show);
  useEffect(() => {
    if (!show) setGate(false);
    else if (!focused || Date.now() - mountedAt.current < ENTRANCE_WINDOW_MS) setGate(true);
  }, [show, focused]);
  const visible = show && gate;

  const [phase, setPhase] = useState<Phase>(visible ? 'shown' : 'hidden');
  /** The content's FadeIn: played at the screen entrance, skipped off screen and under reduce motion. */
  const [fadeSkip, setFadeSkip] = useState(false);
  const naturalH = useRef(0);
  const h = useSharedValue(0);
  const o = useSharedValue(1);
  /** 0: auto height (follows the content); 1: height driven by `h` (exiting). */
  const driven = useSharedValue(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const finishExit = useCallback(() => {
    if (phaseRef.current === 'exiting') setPhase('hidden');
  }, []);

  useEffect(() => {
    const current = phaseRef.current;
    if (visible) {
      if (current === 'shown') return;
      // Appears with the screen's entrance or off screen: no expand (nothing in use moves).
      // Also cancels an exit in progress.
      driven.value = 0;
      o.value = 1;
      setFadeSkip(reduce || !focused);
      setPhase('shown');
      return;
    }
    if (current === 'hidden' || current === 'exiting') return;
    if (reduce || !focused) {
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
    // `focused` only matters at the moment `visible` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduce, h, o, driven, finishExit]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    if (next) naturalH.current = next;
  }, []);

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
            <InstallAppCard
              isIOS={flow.isIOS}
              desktop={flow.isDesktop}
              onInstall={install}
              onLater={later}
              onNever={never}
              testID={testID}
            />
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
  /** « J’ai compris » (defaults to onClose). The dashboard card rests 30 days on it. */
  onDone?: () => void;
  device?: 'iPhone' | 'iPad' | null;
  browser?: IosBrowser;
}

function shareHint(device: 'iPhone' | 'iPad' | null | undefined, browser: IosBrowser | undefined): string {
  if (browser === 'chrome') return 'En haut à droite, dans la barre d’adresse de Chrome.';
  if (browser === 'firefox' || browser === 'edge') return `Dans le menu du navigateur, puis «${NBSP}Partager${NBSP}».`;
  if (device === 'iPad') return 'En haut à droite, à côté de la barre d’adresse.';
  return `En bas de l’écran dans Safari, ou dans le menu «${NBSP}…${NBSP}» de la barre d’adresse.`;
}

export function IosInstallSheet({ visible, onClose, onDone, device, browser }: IosInstallSheetProps) {
  if (!isWeb) return null;
  const where = device === 'iPad' ? 'de votre iPad' : 'de votre iPhone';
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Installer MargeBar Pro"
      subline={`Sur l’écran d’accueil ${where}, en deux gestes.`}
      footer={<Button title="J’ai compris" onPress={onDone ?? onClose} testID="ios-install-done" />}
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
        <Text style={styles.noteText}>
          MargeBar Pro s’ouvrira ensuite en plein écran depuis son icône. Connectez-vous une fois dans l’application.
        </Text>
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
  actionsWide: { justifyContent: 'flex-start' },
  actionsStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  primaryStacked: { alignSelf: 'stretch' },
  quiet: { flexDirection: 'row', alignItems: 'center', marginRight: -8 },
  quietWide: { marginRight: 0 },
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
