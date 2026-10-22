/**
 * Buttons (spec §3.1).
 *
 *   <Button title="Enregistrer" onPress={save} loading={saving} icon="checkmark-circle" />
 *   <Button title="Créer un compte gratuit" variant="lime" trailingIcon="arrow-forward" />
 *   <Button title="Ouvrir le calculateur" variant="tonal" size="sm" />
 *   <Button title="Supprimer le produit" variant="destructive" />
 *   <IconButton icon="close" variant="sunken" accessibilityLabel="Fermer" onPress={…} />
 *   <FAB onPress={…} accessibilityLabel="Ajouter un produit" />
 *
 * Legacy variants still accepted: 'outline' → secondary, 'danger' → destructive.
 */
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { elevation, motion, palette, radius, type } from '../../theme';
import { HapticKind } from '../../theme/haptics';
import { PressableScale } from './PressableScale';
import { IconName, renderIcon } from './Icon';

export type ButtonVariant =
  | 'primary'
  | 'lime'
  | 'secondary'
  | 'ghostLight'
  | 'tonal'
  | 'text'
  | 'destructive'
  // legacy
  | 'outline'
  | 'danger';

export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Shows a check that pops in (save flow). */
  success?: boolean;
  disabled?: boolean;
  /** Leading icon: an Ionicons name or a custom node. */
  icon?: IconName | React.ReactNode;
  trailingIcon?: IconName | React.ReactNode;
  fullWidth?: boolean;
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

type Resolved = Exclude<ButtonVariant, 'outline' | 'danger'>;

const VARIANTS: Record<Resolved, { bg: string; bgPressed: string; fg: string; border?: string; shadow?: ViewStyle }> = {
  primary: { bg: palette.em700, bgPressed: palette.em800, fg: '#FFFFFF', shadow: elevation.glow },
  lime: { bg: palette.lime, bgPressed: palette.limeSoft, fg: palette.onLime, shadow: elevation.glowLime },
  secondary: { bg: palette.surface, bgPressed: palette.surface2, fg: palette.ink, border: palette.lineStrong },
  ghostLight: { bg: 'rgba(255,255,255,0.08)', bgPressed: 'rgba(255,255,255,0.16)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.28)' },
  tonal: { bg: palette.em50, bgPressed: palette.em100, fg: palette.em700 },
  text: { bg: 'rgba(8,117,83,0)', bgPressed: 'rgba(8,117,83,0.07)', fg: palette.em700 },
  destructive: { bg: 'rgba(179,52,42,0)', bgPressed: 'rgba(179,52,42,0.07)', fg: palette.bad },
};

function resolve(v: ButtonVariant): Resolved {
  if (v === 'outline') return 'secondary';
  if (v === 'danger') return 'destructive';
  return v;
}

export const Button = React.memo(function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  success = false,
  disabled = false,
  icon,
  trailingIcon,
  fullWidth,
  haptic = false,
  style,
  textStyle,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const v = resolve(variant);
  const conf = VARIANTS[v];
  const isDisabled = disabled || loading;
  const sm = size === 'sm';
  const progress = useSharedValue(0);

  const disabledBg = v === 'primary' ? palette.em200 : v === 'lime' ? palette.limeSoft : conf.bg;
  const fg = disabled && v !== 'primary' ? (v === 'ghostLight' ? 'rgba(255,255,255,0.5)' : palette.text4) : conf.fg;

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [conf.bg, conf.bgPressed]),
  }));

  // Success check pop (a 160 ms fade under reduce motion)
  const reduce = useReducedMotion();
  const checkScale = useSharedValue(success ? 1 : 0);
  React.useEffect(() => {
    checkScale.value = success
      ? reduce
        ? withTiming(1, { duration: motion.duration.fast })
        : withSequence(withTiming(0, { duration: 0 }), withSpring(1, motion.spring.pop))
      : withTiming(0, { duration: motion.duration.fast });
  }, [success, checkScale, reduce]);
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : checkScale.value }],
    opacity: reduce ? checkScale.value : checkScale.value > 0.01 ? 1 : 0,
  }));

  const iconSize = sm ? 18 : 20;
  const showLabel = !loading && !success;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      haptic={haptic}
      progress={progress}
      scaleTo="button"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        sm ? styles.sm : styles.md,
        { backgroundColor: disabled ? disabledBg : conf.bg },
        conf.border ? { borderWidth: 1, borderColor: disabled ? palette.line : conf.border } : null,
        !disabled && conf.shadow ? conf.shadow : null,
        (v === 'text' || v === 'destructive') && styles.textVariant,
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      {!disabled ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { borderRadius: sm ? radius.sm : radius.md }, bgStyle]}
          pointerEvents="none"
        />
      ) : null}
      <View style={[styles.content, { gap: sm ? 8 : 10, opacity: showLabel ? 1 : 0 }]}>
        {renderIcon(icon, iconSize, fg)}
        <Text
          style={[sm ? type.buttonSm : type.button, { color: fg }, textStyle]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {title}
        </Text>
        {renderIcon(trailingIcon, iconSize, fg)}
      </View>
      {loading ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator color={fg} size="small" />
        </View>
      ) : null}
      {success && !loading ? (
        <Animated.View style={[styles.overlay, checkStyle]} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={sm ? 22 : 26} color={fg} />
        </Animated.View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    overflow: 'visible',
  },
  md: { height: 56, borderRadius: radius.md, paddingHorizontal: 20 },
  sm: { height: 44, borderRadius: radius.sm, paddingHorizontal: 16 },
  textVariant: { paddingHorizontal: 12 },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});

// ─── IconButton ────────────────────────────────────────────────────────────
export type IconButtonVariant = 'default' | 'light' | 'plain' | 'sunken' | 'tonal' | 'primary';

export interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: number;
  iconSize?: number;
  color?: string;
  disabled?: boolean;
  haptic?: HapticKind | false;
  /** Small dot badge (e.g. unread). */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  testID?: string;
}

const ICON_VARIANTS: Record<IconButtonVariant, { bg: string; fg: string; border?: string; shadow?: ViewStyle }> = {
  default: { bg: palette.surface, fg: palette.ink, border: palette.line, shadow: elevation.e1 },
  light: { bg: 'rgba(255,255,255,0.12)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.18)' },
  plain: { bg: 'transparent', fg: palette.ink },
  sunken: { bg: palette.surface2, fg: palette.ink },
  tonal: { bg: palette.em50, fg: palette.em700 },
  primary: { bg: palette.em700, fg: '#FFFFFF', shadow: elevation.glow },
};

export const IconButton = React.memo(function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'default',
  size = 44,
  iconSize = 22,
  color,
  disabled,
  haptic = false,
  dot,
  style,
  hitSlop,
  testID,
}: IconButtonProps) {
  const conf = ICON_VARIANTS[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      scaleTo="button"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={hitSlop ?? (size < 44 ? (44 - size) / 2 : undefined)}
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: conf.bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : 1,
        },
        conf.border ? { borderWidth: 1, borderColor: conf.border } : null,
        conf.shadow ?? null,
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize} color={color ?? conf.fg} />
      {dot ? <View style={iconStyles.dot} /> : null}
    </PressableScale>
  );
});

const iconStyles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: palette.lime,
    borderWidth: 2,
    borderColor: palette.em700,
  },
});

// ─── FAB ───────────────────────────────────────────────────────────────────
export interface FABProps {
  onPress?: () => void;
  icon?: IconName;
  accessibilityLabel: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  haptic?: HapticKind | false;
  testID?: string;
}

/** 48 px emerald circle with a white « + » and the glow (top right of list screens). */
export const FAB = React.memo(function FAB({ onPress, icon = 'add', accessibilityLabel, size = 48, style, haptic = 'tap', testID }: FABProps) {
  return (
    <PressableScale
      onPress={onPress}
      haptic={haptic}
      scaleTo="button"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.em700,
          alignItems: 'center',
          justifyContent: 'center',
        },
        elevation.glow,
        style,
      ]}
    >
      <Ionicons name={icon} size={26} color="#FFFFFF" />
    </PressableScale>
  );
});
