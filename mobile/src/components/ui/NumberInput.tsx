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
 *   clamped to [min, max] and rounded to `step` decimals. On web, ↑/↓ step too.
 * - `error` draws a 2 px bad border and a message line under the field
 *   (`helper` shows a neutral line instead).
 * - Long values shrink to fit (« 99 999 999,00 € » is never clipped).
 * - Accessibility: the field is a labelled spin button (web: role="spinbutton"
 *   with aria-valuenow/min/max/valuetext on the input, inside a labelled
 *   group; native: an adjustable element with its value); −/+ are labelled buttons.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
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
  /** Error message: 2 px bad border + an alert line under the field. */
  error?: string | null;
  /** Neutral help line under the field (hidden while there is an error). */
  helper?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Widest the md value box gets before long values shrink. */
const MD_MAX_W = 176;

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
  error,
  helper,
  style,
  testID,
}: NumberInputProps) {
  const [valueW, setValueW] = useState(0);
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

  // Web: ↑ / ↓ step the value while typing (spin button keyboard contract).
  const onKeyPress = (e: any) => {
    const key = e?.nativeEvent?.key;
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
    e.preventDefault?.();
    const typed = parseLocaleFloat(text);
    const base = isFinite(typed) ? typed : valueRef.current;
    valueRef.current = base;
    if (stepBy(key === 'ArrowUp' ? 1 : -1)) setText(toInputString(valueRef.current, decimals));
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

  // ── Fit long values: estimate the text width (Jakarta 800, tabular digits
  // ≈ 0.62 em per character) against the measured room, and shrink the font.
  const chars = Math.max(1, (shown || placeholder).length);
  const suffixRoom = editing && suffix ? suffix.length * (large ? 10 : 9) + 6 : 0;
  // md grows with its value up to MD_MAX_W (it often sits at the end of a row
  // whose room it cannot measure), then the font shrinks instead.
  const desiredMd = Math.max(92, chars * 14 + 24 + suffixRoom);
  const inputWidth = large ? undefined : Math.min(desiredMd, MD_MAX_W);
  const baseSize = large ? 30 : 24;
  const textRoom = large ? valueW - 8 - suffixRoom : (inputWidth as number) - 14 - suffixRoom;
  const fitSize = textRoom > 0 && isFinite(textRoom) ? Math.floor(textRoom / (chars * 0.62)) : baseSize;
  const fontSize = Math.max(large ? 16 : 13, Math.min(baseSize, fitSize));
  const fitted =
    fontSize < baseSize
      ? { fontSize, lineHeight: Math.round(fontSize * 1.2), letterSpacing: large ? -0.03 * fontSize : -0.025 * fontSize }
      : null;

  const hasError = !!error;
  const web = Platform.OS === 'web';
  const finiteOr = (n: number) => (isFinite(n) ? n : undefined);
  const valueText = hasValue ? display(value as number) : '';
  // Web: the input is the spin button; the wrapper is only a labelled group.
  const webSpin = web
    ? ({
        role: 'spinbutton',
        'aria-valuenow': hasValue ? (value as number) : undefined,
        'aria-valuemin': finiteOr(min),
        'aria-valuemax': finiteOr(max),
        'aria-valuetext': valueText || undefined,
        'aria-invalid': hasError || undefined,
      } as any)
    : null;
  const wrapperA11y = web
    ? ({ role: 'group', 'aria-label': a11y } as any)
    : {
        accessibilityRole: 'adjustable' as const,
        accessibilityLabel: a11y,
        accessibilityValue: { min: finiteOr(min), max: finiteOr(max), now: hasValue ? (value as number) : undefined, text: valueText },
        accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
        onAccessibilityAction: (e: any) => stepBy(e.nativeEvent.actionName === 'increment' ? 1 : -1),
      };

  return (
    <View style={style} testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          large ? styles.large : styles.md,
          editing && styles.focused,
          hasError && (large ? styles.errorLarge : styles.errorMd),
          disabled && { opacity: 0.55 },
        ]}
        {...wrapperA11y}
      >
        {stepButton(-1)}
        <View
          style={[large ? styles.valueLarge : styles.valueMd, !large && { width: inputWidth }]}
          onLayout={large ? (e: LayoutChangeEvent) => setValueW(e.nativeEvent.layout.width) : undefined}
        >
          <TextInput
            value={shown}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyPress={web ? onKeyPress : undefined}
            editable={!disabled}
            keyboardType="decimal-pad"
            inputMode="decimal"
            selectTextOnFocus
            placeholder={placeholder}
            placeholderTextColor={palette.text4}
            selectionColor={palette.em700}
            accessibilityLabel={a11y}
            maxFontSizeMultiplier={1.3}
            {...webSpin}
            style={[
              large ? styles.inputLarge : styles.inputMd,
              fitted,
              web ? ({ outlineWidth: 0, outlineStyle: 'none' } as any) : null,
            ]}
          />
          {editing && suffix ? <Text style={[styles.editSuffix, large && { fontSize: 18 }]}>{suffix}</Text> : null}
        </View>
        {stepButton(1)}
      </View>
      {hasError ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={15} color={palette.bad} style={styles.errorIcon} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
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
  errorMd: { borderColor: palette.bad, borderWidth: 2 },
  errorLarge: { borderColor: palette.bad, borderWidth: 2, paddingHorizontal: 10 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  errorIcon: { marginTop: 1.5 },
  errorText: { ...type.footnote, color: palette.bad, flex: 1 },
  helper: { ...type.footnote, color: palette.text3, marginTop: 8 },
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
