/**
 * NumberInput — stepper with −/+ (spec §3.3 + BRIEF graft 3).
 *
 *   <NumberInput value={price} onChange={setPrice} step={0.1} min={0} max={200}
 *                format={formatEuro} accessibilityLabel="Prix de vente TTC" />
 *   <NumberInput size="large" value={degree} onChange={setDegree} step={0.5}
 *                decimals={1} format={formatDegree} suffix="% vol." />
 *
 * - md: 56 tall bordered group [− 44×54][value][+ 44×54].
 * - large: ≈72 tall field with 48 round −/+ buttons inside.
 * - Long-press repeats: 400 ms delay, then every 80 ms, twice as fast after 1 s.
 *   The rate is computed from the elapsed time (one 40 ms ticker), so a slow
 *   parent render never slows it down.
 * - A quick tap always steps once (press-in has no delay; onPress fallback).
 * - A selection haptic on every step.
 * - Tap the value to type: accepts « , » or « . », formatted again on blur,
 *   clamped to [min, max] and rounded to `step` decimals.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily, palette, radius, type } from '../../theme';
import { haptics } from '../../theme/haptics';
import { clamp, formatNumber, parseLocaleFloat, roundToStep, toInputString } from '../../utils/format';
import { PressableScale } from './PressableScale';

export interface NumberInputProps {
  value: number | null | undefined;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Decimals used for typing and the default display (default 2). */
  decimals?: number;
  /** Display formatter when not editing (default fr-FR number + suffix). */
  format?: (n: number) => string;
  /** Unit shown next to the number while typing (« € », « % »). */
  suffix?: string;
  size?: 'md' | 'large';
  label?: string;
  accessibilityLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  haptic?: boolean;
  /** Called when typing starts / ends (e.g. to make tiles update instantly). */
  onEditingChange?: (editing: boolean) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  decimals = 2,
  format,
  suffix,
  size = 'md',
  label,
  accessibilityLabel,
  placeholder = '0',
  disabled = false,
  haptic = true,
  onEditingChange,
  style,
  testID,
}: NumberInputProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const valueRef = useRef<number>(typeof value === 'number' && isFinite(value) ? value : 0);
  const repeat = useRef<{ timer?: ReturnType<typeof setInterval>; start: number; done: number; dir: 1 | -1 }>({ start: 0, done: 0, dir: 1 });
  // Set by onPressIn (which already stepped) so the click-based onPress
  // fallback does not step a second time; cleared shortly after release.
  const pressHandled = useRef(false);
  const pressHandledReset = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (typeof value === 'number' && isFinite(value)) valueRef.current = value;
  }, [value]);

  const display = (n: number) => (format ? format(n) : `${formatNumber(n, decimals)}${suffix ? ` ${suffix}` : ''}`);
  const hasValue = typeof value === 'number' && isFinite(value);
  const shown = editing ? text : hasValue ? display(value as number) : '';

  const apply = useCallback(
    (next: number) => {
      const v = clamp(roundToStep(next, step), min, max);
      if (v === valueRef.current) return false;
      valueRef.current = v;
      onChange(v);
      return true;
    },
    [step, min, max, onChange],
  );

  const stepBy = useCallback(
    (dir: 1 | -1) => {
      const changed = apply(valueRef.current + dir * step);
      if (changed && haptic) haptics.select();
      return changed;
    },
    [apply, step, haptic],
  );

  const stopRepeat = useCallback(() => {
    const r = repeat.current;
    if (r.timer) clearInterval(r.timer);
    r.timer = undefined;
  }, []);

  // Long press: one 40 ms ticker; the number of steps owed is a function of
  // the elapsed time (see repeatSteps), so a slow re-render of the parent
  // never changes the rate — a late tick simply catches up.
  const tick = useCallback(() => {
    const r = repeat.current;
    const owed = repeatSteps(Date.now() - r.start) - r.done;
    if (owed <= 0) return;
    r.done += owed;
    const changed = apply(valueRef.current + r.dir * step * owed);
    if (!changed) {
      stopRepeat();
      return;
    }
    if (haptic) haptics.select();
  }, [apply, step, haptic, stopRepeat]);
  const tickRef = useRef(tick);
  tickRef.current = tick;

  const startRepeat = useCallback(
    (dir: 1 | -1) => {
      stopRepeat();
      const r = repeat.current;
      r.dir = dir;
      r.start = Date.now();
      r.done = 1;
      stepBy(dir);
      r.timer = setInterval(() => tickRef.current(), 40);
    },
    [stepBy, stopRepeat],
  );

  useEffect(
    () => () => {
      stopRepeat();
      if (pressHandledReset.current) clearTimeout(pressHandledReset.current);
    },
    [stopRepeat],
  );

  const onStepPressIn = (dir: 1 | -1) => {
    if (pressHandledReset.current) clearTimeout(pressHandledReset.current);
    pressHandled.current = true;
    startRepeat(dir);
  };
  const onStepPressOut = () => {
    stopRepeat();
    // The click (onPress) follows the release within the same input task.
    pressHandledReset.current = setTimeout(() => {
      pressHandled.current = false;
    }, 350);
  };
  // Fallback for presses that never produced a press-in (keyboard on some
  // browsers, assistive technology « click »): step exactly once.
  const onStepPress = (dir: 1 | -1) => {
    if (pressHandled.current) {
      pressHandled.current = false;
      return;
    }
    stepBy(dir);
  };

  const onFocus = () => {
    setEditing(true);
    setText(hasValue ? toInputString(value as number, decimals) : '');
    onEditingChange?.(true);
  };

  const onChangeText = (t: string) => {
    const cleaned = t.replace(/[^0-9.,\s-]/g, '');
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

  const atMin = hasValue && (value as number) <= min;
  const atMax = hasValue && (value as number) >= max;
  const large = size === 'large';
  const a11y = accessibilityLabel ?? label ?? 'Valeur';

  const stepButton = (dir: 1 | -1) => {
    const isDisabled = disabled || (dir === -1 ? atMin : atMax);
    return (
      <PressableScale
        scaleTo={large ? 'button' : 'none'}
        disabled={isDisabled}
        // RNW delays onPressIn by 50 ms by default: a quick tap would be lost.
        delayPressIn={0}
        onPressIn={() => onStepPressIn(dir)}
        onPressOut={onStepPressOut}
        onPress={() => onStepPress(dir)}
        accessibilityRole="button"
        accessibilityLabel={`${dir === 1 ? 'Augmenter' : 'Diminuer'} ${a11y.toLowerCase()}`}
        hitSlop={large ? 4 : 0}
        style={large ? [styles.roundBtn, dir === 1 && styles.roundBtnPlus] : styles.sideBtn}
      >
        {({ pressed }: { pressed: boolean }) => (
          <>
            {!large && pressed ? <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.em50 }]} /> : null}
            <Ionicons
              name={dir === 1 ? 'add' : 'remove'}
              size={large ? 26 : 24}
              color={isDisabled ? palette.text4 : large && dir === 1 ? '#FFFFFF' : palette.em700}
            />
          </>
        )}
      </PressableScale>
    );
  };

  const inputWidth = large ? undefined : Math.max(92, (shown || placeholder).length * 14 + 24);

  return (
    <View style={style} testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[large ? styles.large : styles.md, editing && styles.focused, disabled && { opacity: 0.55 }]}
        accessibilityRole="adjustable"
        accessibilityLabel={a11y}
        accessibilityValue={{ text: hasValue ? display(value as number) : '' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => stepBy(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        {stepButton(-1)}
        <View style={[large ? styles.valueLarge : styles.valueMd, !large && { width: inputWidth }]}>
          <TextInput
            value={shown}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            editable={!disabled}
            keyboardType="decimal-pad"
            inputMode="decimal"
            selectTextOnFocus
            placeholder={placeholder}
            placeholderTextColor={palette.text4}
            selectionColor={palette.em700}
            accessibilityLabel={a11y}
            maxFontSizeMultiplier={1.3}
            style={[
              large ? styles.inputLarge : styles.inputMd,
              Platform.OS === 'web' ? ({ outlineWidth: 0, outlineStyle: 'none' } as any) : null,
            ]}
          />
          {editing && suffix ? <Text style={[styles.editSuffix, large && { fontSize: 18 }]}>{suffix}</Text> : null}
        </View>
        {stepButton(1)}
      </View>
    </View>
  );
}

/**
 * Steps owed after holding for `t` ms: 1 at press, then one every 80 ms from
 * 400 ms (8 of them up to 960 ms), then one every 40 ms from 1 s.
 */
export function repeatSteps(t: number): number {
  let n = 1;
  if (t >= 400) n += Math.min(Math.floor((t - 400) / 80) + 1, 8);
  if (t >= 1000) n += Math.floor((t - 1000) / 40) + 1;
  return n;
}

const styles = StyleSheet.create({
  label: { ...type.label, color: palette.text2, marginBottom: 8 },
  md: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  focused: { borderColor: palette.em700 },
  sideBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueMd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 6,
  },
  inputMd: {
    ...type.stepperValue,
    color: palette.ink,
    textAlign: 'center',
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingVertical: 0,
  },
  large: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    backgroundColor: palette.surface,
    paddingHorizontal: 11,
    gap: 8,
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.em50,
  },
  roundBtnPlus: {
    backgroundColor: palette.em700,
  },
  valueLarge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  inputLarge: {
    fontFamily: fontFamily.extrabold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.9,
    fontVariant: ['tabular-nums'],
    color: palette.ink,
    textAlign: 'center',
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingVertical: 0,
  },
  editSuffix: { ...type.calloutStrong, color: palette.text3, marginLeft: 4 },
});
