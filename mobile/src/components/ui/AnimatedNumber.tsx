/**
 * AnimatedNumber — count-up from the previous value (or `from`) over 700 ms
 * with easeDecel. Tabular figures keep the width stable.
 *
 *   <AnimatedNumber value={72.5} format={(n) => formatNumber(n, 1)} suffix=" %" style={type.displayXL} />
 *   <AnimatedNumber value={price} format={formatEuro} instant={isDragging} />
 *
 * - `instant` (e.g. while the slider is dragged or the user types): the value
 *   updates directly, no tween, no lag between finger and number.
 * - Changes smaller than 1 % of the previous value update instantly too.
 * - Reduce motion: always instant.
 * Works on web and native (requestAnimationFrame + state, a few dozen frames).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { motion, palette, type } from '../../theme';
import { formatNumber } from '../../utils/format';

export interface AnimatedNumberProps extends Omit<TextProps, 'children'> {
  value: number;
  /** Formatter for each frame (default: fr-FR with 1 decimal). */
  format?: (n: number) => string;
  /** Start value on first mount (default 0). Pass `null` to not animate on mount. */
  from?: number | null;
  duration?: number;
  /** Update without tweening. */
  instant?: boolean;
  /** Minimum relative change that triggers a tween (default 0.01 = 1 %). */
  threshold?: number;
  prefix?: string;
  suffix?: string;
  /** Style of the suffix (e.g. a smaller « % » unit). */
  suffixStyle?: StyleProp<TextStyle>;
  prefixStyle?: StyleProp<TextStyle>;
  style?: StyleProp<TextStyle>;
  delay?: number;
}

const defaultFormat = (n: number) => formatNumber(n, 1);

export function AnimatedNumber({
  value,
  format = defaultFormat,
  from = 0,
  duration = motion.duration.count,
  instant = false,
  threshold = 0.01,
  prefix,
  suffix,
  suffixStyle,
  prefixStyle,
  style,
  delay = 0,
  accessibilityLabel,
  ...rest
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const startValue = from === null || reduce || instant ? value : from;
  const [display, setDisplay] = useState<number>(startValue);
  const current = useRef<number>(startValue);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cancel = () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (timer.current) clearTimeout(timer.current);
      frame.current = null;
      timer.current = null;
    };
    cancel();
    const start = current.current;
    const delta = value - start;
    const relative = Math.abs(delta) / Math.max(Math.abs(start), 1e-6);
    if (!isFinite(value) || instant || reduce || delta === 0 || (start !== 0 && relative < threshold)) {
      current.current = value;
      setDisplay(value);
      return cancel;
    }
    const run = () => {
      const t0 = Date.now();
      const tick = () => {
        const t = Math.min(1, (Date.now() - t0) / duration);
        const eased = motion.easingJS.decel(t);
        const v = start + delta * eased;
        current.current = v;
        setDisplay(v);
        if (t < 1) frame.current = requestAnimationFrame(tick);
        else {
          current.current = value;
          setDisplay(value);
          frame.current = null;
        }
      };
      frame.current = requestAnimationFrame(tick);
    };
    if (delay > 0) timer.current = setTimeout(run, delay);
    else run();
    return cancel;
  }, [value, instant, reduce, duration, threshold, delay]);

  const text = isFinite(display) ? format(display) : format(value);
  const finalLabel = accessibilityLabel ?? `${prefix ?? ''}${isFinite(value) ? format(value) : ''}${suffix ?? ''}`;

  return (
    <Text
      style={[{ ...type.numM, color: palette.ink }, style]}
      accessibilityLabel={finalLabel}
      maxFontSizeMultiplier={1.3}
      {...rest}
    >
      {prefix ? <Text style={prefixStyle}>{prefix}</Text> : null}
      {text}
      {suffix ? <Text style={suffixStyle}>{suffix}</Text> : null}
    </Text>
  );
}
