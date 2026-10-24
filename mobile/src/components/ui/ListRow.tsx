/**
 * Rows and section headers (spec §3.9).
 *
 *   <ValueRow label="Droits d’accise" value={formatEuro(5.41)} />
 *   <ValueRow label="Cotisation sécu." qualifier="> 18 % vol." value="1,74 €" />
 *   <ValueRow label="Total droits" value="7,15 €" strong last />
 *
 *   <ListRow icon="business-outline" title="Établissement" subtitle="Le Comptoir" onPress={…} />
 *   <ListRow title="Mode sombre" right="switch" switchValue={on} onSwitchChange={setOn} />
 *     (the whole row is the switch: role switch + checked state, 56 tall target)
 *   <ListRow title="Spiritueux" subtitle="Whisky, gin…" right="radio" selected onPress={…} />
 *   <ListRow title="TVA" right="value" value="20 %" onPress={…} />
 *
 *   <ListGroup>{rows}</ListGroup>      white card, hairline dividers between rows
 *   <SectionHeader title="Marge par catégorie" action="Détails" onAction={…} />
 *   <SectionHeader variant="caps" title="Spiritueux & liqueurs" />
 *   <Divider />
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { elevation, fontFamily, motion, palette, radius, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { PressableScale } from './PressableScale';
import { springOrTiming } from './motion';
import { IconName } from './Icon';

// ─── ValueRow ──────────────────────────────────────────────────────────────
export interface ValueRowProps {
  label: string;
  qualifier?: string;
  value: string;
  strong?: boolean;
  /** Last row: no divider. */
  last?: boolean;
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function ValueRow({ label, qualifier, value, strong, last, valueColor, style }: ValueRowProps) {
  return (
    <View
      style={[styles.valueRow, !last && styles.divider, style]}
      accessible
      accessibilityLabel={`${label}${qualifier ? ` ${qualifier}` : ''} : ${value.replace(/ /g, ' ')}`}
    >
      <Text style={[styles.valueLabel, strong && styles.valueLabelStrong]} numberOfLines={2}>
        {label}
        {qualifier ? <Text style={styles.qualifier}>{`  ${qualifier}`}</Text> : null}
      </Text>
      <Text style={[styles.valueText, strong && styles.valueStrong, valueColor ? { color: valueColor } : null]} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
    </View>
  );
}

// ─── ListRow (navigation / selectable) ─────────────────────────────────────
export type ListRowRight = 'chevron' | 'switch' | 'radio' | 'check' | 'value' | 'none';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: 'brand' | 'neutral' | 'bad' | 'trophy';
  /** Custom leading node (thumb, avatar) instead of the icon tile. */
  leading?: React.ReactNode;
  right?: ListRowRight | React.ReactNode;
  value?: string;
  selected?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (v: boolean) => void;
  onPress?: () => void;
  onLongPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Hairline under the row (inset to the text). */
  divider?: boolean;
  /** Lines for the subtitle (default 2, so descriptions wrap). */
  subtitleLines?: number;
  /** Extra line under the subtitle, never clamped (footnoteStrong, tabular): e.g. an official rate. */
  detail?: string;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const TONES = {
  brand: { bg: palette.em50, fg: palette.em700 },
  neutral: { bg: palette.surface2, fg: palette.text2 },
  bad: { bg: palette.badBg, fg: palette.bad },
  trophy: { bg: palette.trophyBg, fg: palette.trophy },
};

/** Switch drawn inside the row (the row itself is the control): 48×28, lineStrong off track. */
function SwitchKnob({ on, disabled }: { on: boolean; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(on ? 1 : 0);
  React.useEffect(() => {
    p.value = springOrTiming(on ? 1 : 0, motion.spring.snappy, reduce);
  }, [on, p, reduce]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.min(1, Math.max(0, p.value)), [0, 1], [palette.lineStrong, palette.em600]),
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 20 }] }));
  return (
    <Animated.View style={[styles.switchTrack, track, disabled && { opacity: 0.5 }]} pointerEvents="none">
      <Animated.View style={[styles.switchKnob, knob]} />
    </Animated.View>
  );
}

function Radio({ selected }: { selected: boolean }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(selected ? 1 : 0);
  React.useEffect(() => {
    s.value = springOrTiming(selected ? 1 : 0, motion.spring.pop, reduce);
  }, [selected, s, reduce]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: s.value > 0.02 ? 1 : 0 }));
  return (
    <View style={[styles.radio, selected && { borderColor: palette.em700 }]}>
      <Animated.View style={[styles.radioFill, fill]}>
        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'brand',
  leading,
  right,
  value,
  selected = false,
  switchValue,
  onSwitchChange,
  onPress,
  onLongPress,
  destructive,
  disabled,
  divider,
  subtitleLines = 2,
  detail,
  style,
  titleStyle,
  accessibilityLabel,
  testID,
}: ListRowProps) {
  const resolvedRight = right ?? (onSwitchChange ? 'switch' : onPress ? 'chevron' : 'none');
  const tone = destructive ? TONES.bad : TONES[iconTone];

  let rightNode: React.ReactNode = null;
  if (resolvedRight === 'chevron') {
    rightNode = (
      <View style={styles.rightRow}>
        {value ? <Text style={styles.rightValue}>{value}</Text> : null}
        <Ionicons name="chevron-forward" size={18} color={palette.text4} />
      </View>
    );
  } else if (resolvedRight === 'value') {
    rightNode = <Text style={styles.rightValue}>{value}</Text>;
  } else if (resolvedRight === 'radio') {
    rightNode = <Radio selected={selected} />;
  } else if (resolvedRight === 'check') {
    rightNode = selected ? <Ionicons name="checkmark" size={22} color={palette.em700} /> : null;
  } else if (resolvedRight === 'switch') {
    rightNode = <SwitchKnob on={!!switchValue} disabled={disabled} />;
  } else if (resolvedRight !== 'none') {
    rightNode = resolvedRight;
  }

  const content = (
    <>
      {leading ?? (icon ? (
        <View style={[styles.iconTile, { backgroundColor: tone.bg }]}>
          <Ionicons name={icon} size={20} color={tone.fg} />
        </View>
      ) : null)}
      <View style={styles.texts}>
        <Text style={[styles.title, destructive && { color: palette.bad }, titleStyle]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {rightNode}
    </>
  );

  const rowStyle = [
    styles.row,
    selected && resolvedRight !== 'switch' ? styles.selected : null,
    disabled && { opacity: 0.5 },
    style,
  ];

  const isSwitch = resolvedRight === 'switch';
  const toggle = () => {
    haptics.select();
    onSwitchChange?.(!switchValue);
  };

  const body = isSwitch ? (
    <PressableScale
      onPress={toggle}
      onLongPress={onLongPress}
      disabled={disabled}
      scaleTo="card"
      accessibilityRole="switch"
      accessibilityState={{ checked: !!switchValue, disabled: !!disabled }}
      // react-native-web 0.19 ignores accessibilityState: give the DOM its aria-checked.
      aria-checked={!!switchValue}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, detail].filter(Boolean).join(', ')}
      testID={testID}
      style={rowStyle}
    >
      {content}
    </PressableScale>
  ) : onPress || onLongPress ? (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      scaleTo="card"
      haptic={resolvedRight === 'radio' ? 'select' : false}
      accessibilityRole={resolvedRight === 'radio' ? 'radio' : 'button'}
      accessibilityState={{ selected, disabled: !!disabled, checked: resolvedRight === 'radio' ? selected : undefined }}
      aria-checked={resolvedRight === 'radio' ? selected : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, detail, value].filter(Boolean).join(', ')}
      testID={testID}
      style={rowStyle}
    >
      {content}
    </PressableScale>
  ) : (
    <View style={rowStyle} accessible accessibilityLabel={accessibilityLabel} testID={testID}>
      {content}
    </View>
  );

  if (!divider) return body;
  return (
    <View>
      {body}
      <View style={[styles.rowDivider, { marginLeft: icon || leading ? 12 + 40 + 14 : 12 }]} />
    </View>
  );
}

/** White card that inserts hairline dividers between its rows. */
export function ListGroup({ children, style, inset = 4 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; inset?: number }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { padding: inset }, style]}>
      {items.map((child, i) =>
        React.isValidElement(child) && i < items.length - 1 && (child.type === ListRow)
          ? React.cloneElement(child as React.ReactElement<ListRowProps>, { divider: true, key: i })
          : child,
      )}
    </View>
  );
}

export function Divider({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  return <View style={[{ height: 1, backgroundColor: palette.line, marginLeft: inset }, style]} />;
}

// ─── SectionHeader ─────────────────────────────────────────────────────────
export interface SectionHeaderProps {
  title: string;
  /** Right-aligned action link (em700 + chevron). */
  action?: string;
  onAction?: () => void;
  /** Right-aligned meta text (text3) when there is no action. */
  meta?: string;
  /** 'title' = title3 (default) · 'caps' = uppercase group header. */
  variant?: 'title' | 'caps';
  style?: StyleProp<ViewStyle>;
  right?: React.ReactNode;
}

export function SectionHeader({ title, action, onAction, meta, variant = 'title', style, right }: SectionHeaderProps) {
  const caps = variant === 'caps';
  return (
    <View style={[styles.sec, caps ? styles.secCaps : null, style]}>
      <Text style={caps ? styles.capsTitle : styles.secTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {right ??
        (action ? (
          <PressableScale onPress={onAction} scaleTo="chip" accessibilityLabel={action} style={styles.secAction} hitSlop={6}>
            <Text style={styles.secActionText}>{action}</Text>
            <Ionicons name="chevron-forward" size={16} color={palette.em700} />
          </PressableScale>
        ) : meta ? (
          <Text style={styles.secMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  valueRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  // The label keeps its words (up to 60 %); a long value wraps, right-aligned.
  valueLabel: { ...type.callout, color: palette.text2, flexShrink: 0, maxWidth: '60%' },
  valueLabelStrong: { fontFamily: fontFamily.bold, color: palette.ink },
  qualifier: { ...type.footnote, color: palette.text3 },
  valueText: { ...type.valueRow, color: palette.ink, flexShrink: 1, textAlign: 'right' },
  valueStrong: { fontFamily: fontFamily.extrabold, fontSize: 17, letterSpacing: -0.2 },

  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  selected: { backgroundColor: palette.em50 },
  iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.headline, color: palette.ink },
  subtitle: { ...type.footnote, color: palette.text3 },
  detail: { ...type.footnoteStrong, color: palette.text2, fontVariant: ['tabular-nums'] },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rightValue: { ...type.calloutStrong, color: palette.text3, fontVariant: ['tabular-nums'] },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: palette.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.em700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: { height: 1, backgroundColor: palette.line, marginRight: 12 },
  switchTrack: { width: 48, height: 28, borderRadius: 14, padding: 2, justifyContent: 'center' },
  switchKnob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', ...elevation.knob },
  group: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.line,
    ...elevation.e2,
  },

  sec: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: 4,
    gap: 12,
  },
  secCaps: { minHeight: 32, marginBottom: 0 },
  secTitle: { ...type.title3, color: palette.ink, flexShrink: 1 },
  capsTitle: { ...type.caps, color: palette.text3 },
  secAction: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 44 },
  secActionText: { ...type.calloutStrong, color: palette.em700 },
  secMeta: { ...type.calloutStrong, color: palette.text3 },
});
