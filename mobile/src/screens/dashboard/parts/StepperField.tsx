/**
 * StepperField — a flexible-width numeric field with −/+ steppers, so the
 * calculator's « Prix HT » and « Degré d’alcool » can sit side by side.
 *
 * Same behaviour as the kit's NumberInput (md), which has a fixed width
 * (44 + ≥ 92 + 44, growing with the text) and cannot share a 350 px row:
 * - 56 tall bordered group [− 44][value][+ 44], focus = 2 px em700 + 4 px ring.
 * - A quick tap steps once (press-in without delay + click fallback); a long
 *   press repeats with the kit's time-based `repeatSteps` (400 ms, 80 ms, 40 ms).
 * - Selection haptic on each step (through theme/haptics).
 * - Tap the value to type (« , » or « . »); live onChange while valid, clamped
 *   and rounded on blur. The number auto-fits (22 → 16 px), the unit is a
 *   smaller text3 suffix (or its short form when the field is narrow).
 * Foundation request: a `fill` option on NumberInput would replace this file.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../../../components/ui';
import { repeatSteps } from '../../../components/ui/NumberInput';
import { fontFamily, palette, radius, type } from '../../../theme';
import { haptics } from '../../../theme/haptics';
import { clamp, formatNumber, NBSP, parseLocaleFloat, roundToStep } from '../../../utils/format';

export interface StepperFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min?: number;
  max?: number;
  /** Max decimals while typing / after blur. */
  decimals?: number;
  /** Always show `decimals` digits (prices) instead of trimming (degrees). */
  fixedDecimals?: boolean;
  unit?: string;
  /** Shorter unit when the field is narrow (« % » for « % vol. »). */
  unitShort?: string;
  /** Spoken unit for screen readers (« euros », « pour cent »). */
  unitSpoken?: string;
  accessibilityLabel?: string;
  onEditingChange?: (editing: boolean) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const FONT_SIZES = [22, 20, 18, 16];
const SIDE = 44;

/** Rough width of a fr-FR number in Plus Jakarta Sans 800 (tabular digits). */
function numberWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') w += 0.64;
    else if (ch === ',' || ch === '.') w += 0.3;
    else if (ch === ' ' || ch === NBSP) w += 0.3;
    else w += 0.6;
  }
  return w * size + 2;
}

/** Width of a unit in callout semibold (15 px). */
function unitWidth(unit: string): number {
  return unit ? unit.length * 15 * 0.56 + 4 : 0;
}

export function StepperField({
  label,
  value,
  onChange,
  step,
  min = 0,
  max = Infinity,
  decimals = 2,
  fixedDecimals = false,
  unit = '',
  unitShort,
  unitSpoken,
  accessibilityLabel,
  onEditingChange,
  style,
  testID,
}: StepperFieldProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [boxW, setBoxW] = useState(0);
  const valueRef = useRef(value);
  const repeat = useRef<{ timer?: ReturnType<typeof setInterval>; start: number; done: number; dir: 1 | -1 }>({ start: 0, done: 0, dir: 1 });
  const pressHandled = useRef(false);
  const pressHandledReset = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const show = useCallback(
    (n: number) => formatNumber(n, decimals, { minDigits: fixedDecimals ? decimals : 0, grouping: false }),
    [decimals, fixedDecimals],
  );

  const apply = useCallback(
    (next: number) => {
      const v = clamp(Number(roundToStep(next, step).toFixed(decimals)), min, max);
      if (v === valueRef.current) return false;
      valueRef.current = v;
      onChange(v);
      return true;
    },
    [step, decimals, min, max, onChange],
  );

  const stepBy = useCallback(
    (dir: 1 | -1, times = 1) => {
      const changed = apply(valueRef.current + dir * step * times);
      if (changed) haptics.select();
      return changed;
    },
    [apply, step],
  );

  const stopRepeat = useCallback(() => {
    const r = repeat.current;
    if (r.timer) clearInterval(r.timer);
    r.timer = undefined;
  }, []);

  const tick = useCallback(() => {
    const r = repeat.current;
    const owed = repeatSteps(Date.now() - r.start) - r.done;
    if (owed <= 0) return;
    r.done += owed;
    if (!stepBy(r.dir, owed)) stopRepeat();
  }, [stepBy, stopRepeat]);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(
    () => () => {
      stopRepeat();
      if (pressHandledReset.current) clearTimeout(pressHandledReset.current);
    },
    [stopRepeat],
  );

  const onPressIn = (dir: 1 | -1) => {
    if (pressHandledReset.current) clearTimeout(pressHandledReset.current);
    pressHandled.current = true;
    stopRepeat();
    const r = repeat.current;
    r.dir = dir;
    r.start = Date.now();
    r.done = 1;
    stepBy(dir);
    r.timer = setInterval(() => tickRef.current(), 40);
  };
  const onPressOut = () => {
    stopRepeat();
    pressHandledReset.current = setTimeout(() => {
      pressHandled.current = false;
    }, 350);
  };
  const onPress = (dir: 1 | -1) => {
    if (pressHandled.current) {
      pressHandled.current = false;
      return;
    }
    stepBy(dir);
  };

  const onFocus = () => {
    setText(show(value));
    setEditing(true);
    onEditingChange?.(true);
  };
  const onChangeText = (t: string) => {
    const cleaned = t.replace(/[^0-9.,\s]/g, '');
    setText(cleaned);
    const n = parseLocaleFloat(cleaned);
    if (isFinite(n) && n >= min && n <= max) {
      valueRef.current = n;
      onChange(n);
    }
  };
  const onBlur = () => {
    const n = parseLocaleFloat(text);
    if (isFinite(n)) {
      const v = clamp(Number(n.toFixed(decimals)), min, max);
      valueRef.current = v;
      onChange(v);
    }
    setEditing(false);
    setText('');
    onEditingChange?.(false);
  };

  // Auto-fit: the largest size where number + unit fit the value box.
  const shown = editing ? text : show(value);
  const avail = Math.max(0, boxW - 12);
  let size = FONT_SIZES[FONT_SIZES.length - 1];
  let unitText = unit;
  const fits = (s: number, u: string) => numberWidth(shown || '0', s) + unitWidth(u) <= avail;
  if (boxW > 0) {
    const found = FONT_SIZES.find((s) => fits(s, unit));
    if (found) size = found;
    else if (unitShort) {
      unitText = unitShort;
      size = FONT_SIZES.find((s) => fits(s, unitShort)) ?? size;
    }
  } else {
    size = FONT_SIZES[0];
  }
  const inputW = Math.min(numberWidth(shown || '0', size) + (Platform.OS === 'web' ? 2 : 6), Math.max(24, avail - unitWidth(unitText)));

  const atMin = value <= min;
  const atMax = value >= max;
  const a11y = accessibilityLabel ?? label;
  const valueSpoken = `${show(value)} ${unitSpoken ?? unit}`.trim();

  const side = (dir: 1 | -1) => {
    const disabled = dir === -1 ? atMin : atMax;
    return (
      <PressableScale
        scaleTo="none"
        disabled={disabled}
        delayPressIn={0}
        onPressIn={() => onPressIn(dir)}
        onPressOut={onPressOut}
        onPress={() => onPress(dir)}
        accessibilityRole="button"
        accessibilityLabel={`${dir === 1 ? 'Augmenter' : 'Diminuer'} : ${a11y.toLowerCase()}`}
        testID={testID ? `${testID}-${dir === 1 ? 'plus' : 'minus'}` : undefined}
        style={styles.side}
      >
        {({ pressed }: { pressed: boolean }) => (
          <>
            {pressed ? <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.em50 }]} /> : null}
            <Ionicons name={dir === 1 ? 'add' : 'remove'} size={22} color={disabled ? palette.text4 : palette.em700} />
          </>
        )}
      </PressableScale>
    );
  };

  return (
    <View style={style} testID={testID}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.ring, { borderColor: editing ? palette.focusRing : 'transparent' }]}>
        <View
          style={[styles.field, editing && styles.fieldFocused]}
          accessibilityRole="adjustable"
          accessibilityLabel={a11y}
          accessibilityValue={{ text: valueSpoken }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => stepBy(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        >
          {side(-1)}
          <View style={styles.value} onLayout={(e: LayoutChangeEvent) => setBoxW(e.nativeEvent.layout.width)}>
            <TextInput
              value={shown}
              onChangeText={onChangeText}
              onFocus={onFocus}
              onBlur={onBlur}
              keyboardType="decimal-pad"
              inputMode="decimal"
              selectTextOnFocus
              selectionColor={palette.em700}
              accessibilityLabel={`${a11y}, ${valueSpoken}`}
              maxFontSizeMultiplier={1.3}
              testID={testID ? `${testID}-input` : undefined}
              style={[
                styles.input,
                { fontSize: size, lineHeight: size + 6, width: inputW },
                Platform.OS === 'web' ? ({ outlineWidth: 0, outlineStyle: 'none' } as any) : null,
              ]}
            />
            {unitText ? (
              <Text style={styles.unit} numberOfLines={1}>
                {unitText}
              </Text>
            ) : null}
          </View>
          {side(1)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: palette.text2, marginBottom: 8 },
  ring: { borderWidth: 4, margin: -4, borderRadius: radius.md + 4 },
  field: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  fieldFocused: { borderColor: palette.em700 },
  side: { width: SIDE, alignItems: 'center', justifyContent: 'center' },
  value: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 6,
  },
  input: {
    fontFamily: fontFamily.extrabold,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    color: palette.ink,
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
    height: '100%',
  },
  unit: { ...type.calloutStrong, color: palette.text3, marginLeft: 4 },
});
