import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Text } from 'react-native';
import Svg, {
  Path,
  Circle,
  Rect,
  Defs,
  ClipPath,
  Ellipse,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { colors, spacing, typography } from '../../theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface YinYangSpinnerProps {
  size?: number;
  message?: string;
  submessage?: string;
}

export function YinYangSpinner({
  size = 100,
  message,
  submessage,
}: YinYangSpinnerProps) {
  const fillLevel = useRef(new Animated.Value(0)).current;
  const foamScale = useRef(new Animated.Value(0)).current;
  const bubble1 = useRef(new Animated.Value(0)).current;
  const bubble2 = useRef(new Animated.Value(0)).current;
  const bubble3 = useRef(new Animated.Value(0)).current;
  const bubble4 = useRef(new Animated.Value(0)).current;
  const bubble5 = useRef(new Animated.Value(0)).current;
  const bubble6 = useRef(new Animated.Value(0)).current;
  const bubble7 = useRef(new Animated.Value(0)).current;
  const bubble8 = useRef(new Animated.Value(0)).current;
  const foamWobble = useRef(new Animated.Value(0)).current;
  const fadeMessage = useRef(new Animated.Value(0)).current;
  const dripAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fill = Animated.loop(
      Animated.sequence([
        // Fill the glass
        Animated.timing(fillLevel, {
          toValue: 1,
          duration: 2800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        // Foam appears
        Animated.timing(foamScale, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: false,
        }),
        // Drip starts
        Animated.timing(dripAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.in(Easing.ease),
          useNativeDriver: false,
        }),
        // Hold
        Animated.delay(600),
        // Reset
        Animated.parallel([
          Animated.timing(fillLevel, {
            toValue: 0,
            duration: 400,
            useNativeDriver: false,
          }),
          Animated.timing(foamScale, {
            toValue: 0,
            duration: 400,
            useNativeDriver: false,
          }),
          Animated.timing(dripAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
          }),
        ]),
        Animated.delay(300),
      ]),
    );

    const makeBubble = (anim: Animated.Value, delay: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: false,
          }),
        ]),
      );

    const wobble = Animated.loop(
      Animated.sequence([
        Animated.timing(foamWobble, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(foamWobble, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );

    const fade = Animated.timing(fadeMessage, {
      toValue: 1,
      duration: 600,
      delay: 300,
      useNativeDriver: true,
    });

    fill.start();
    makeBubble(bubble1, 0, 1400).start();
    makeBubble(bubble2, 250, 1100).start();
    makeBubble(bubble3, 500, 1300).start();
    makeBubble(bubble4, 150, 1500).start();
    makeBubble(bubble5, 400, 1000).start();
    makeBubble(bubble6, 700, 1200).start();
    makeBubble(bubble7, 100, 1350).start();
    makeBubble(bubble8, 550, 1150).start();
    wobble.start();
    fade.start();

    return () => {
      fill.stop();
      [bubble1, bubble2, bubble3, bubble4, bubble5, bubble6, bubble7, bubble8].forEach(b =>
        b.stopAnimation(),
      );
      wobble.stop();
      fade.stop();
    };
  }, [fillLevel, foamScale, dripAnim, bubble1, bubble2, bubble3, bubble4, bubble5, bubble6, bubble7, bubble8, foamWobble, fadeMessage]);

  // ────────── DIMENSIONS ──────────
  // All coordinates are relative to size for scalability
  const s = size / 100; // scale factor (design is based on size=100)
  const svgW = 130 * s;
  const svgH = 130 * s;

  // Mug body (rectangular with slight taper like the icon)
  const mugL = 15 * s;   // left edge
  const mugR = 85 * s;   // right edge
  const mugT = 30 * s;   // top edge
  const mugB = 115 * s;  // bottom edge
  const mugW = mugR - mugL;
  const mugH = mugB - mugT;
  const mugCx = (mugL + mugR) / 2;
  const stroke = 4.5 * s; // thick outline like the icon
  const cornerR = 6 * s;  // rounded corners at bottom

  // Inner cavity (for clipping beer)
  const innerL = mugL + stroke;
  const innerR = mugR - stroke;
  const innerT = mugT + stroke;
  const innerB = mugB - stroke;

  // Handle
  const handleX = mugR - stroke * 0.5;
  const handleTop = mugT + mugH * 0.22;
  const handleBot = mugT + mugH * 0.72;
  const handleOut = mugR + 25 * s;

  // Base
  const baseW = mugW + 12 * s;
  const baseH = 6 * s;
  const baseL = mugCx - baseW / 2;

  // ────────── COLORS ──────────
  const beerBody = colors.accent;     // #40916C
  const beerDark = colors.secondary;  // #2D6A4F
  const outline = colors.primary;     // #1B4332
  const foamWhite = '#EDF5F0';
  const foamCream = colors.light;     // #D8F3DC
  const baseTint = colors.light;      // #D8F3DC

  // ────────── INTERPOLATIONS ──────────
  const beerY = fillLevel.interpolate({
    inputRange: [0, 1],
    outputRange: [innerB, innerT + mugH * 0.05],
  });
  const beerHeight = fillLevel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, innerB - innerT - mugH * 0.05],
  });

  // Foam Y follows fill level
  const foamY = fillLevel.interpolate({
    inputRange: [0, 1],
    outputRange: [innerB, mugT - 2 * s],
  });

  // Drip lengths (foam running down outside of glass)
  const dripLenL = dripAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, mugH * 0.45],
  });
  const dripLenR = dripAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, mugH * 0.3],
  });

  // Bubble helper
  const makeBubbleProps = (anim: Animated.Value, xPos: number, bubbleR: number) => ({
    cx: xPos,
    cy: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [innerB - 6 * s, innerT + mugH * 0.2],
    }),
    r: bubbleR * s,
    opacity: anim.interpolate({
      inputRange: [0, 0.1, 0.7, 1],
      outputRange: [0, 0.55, 0.35, 0],
    }),
  });

  const bubbles = [
    makeBubbleProps(bubble1, mugCx - 18 * s, 3.0),
    makeBubbleProps(bubble2, mugCx + 10 * s, 2.5),
    makeBubbleProps(bubble3, mugCx - 5 * s, 3.5),
    makeBubbleProps(bubble4, mugCx + 22 * s, 2.2),
    makeBubbleProps(bubble5, mugCx - 25 * s, 2.0),
    makeBubbleProps(bubble6, mugCx + 3 * s, 2.8),
    makeBubbleProps(bubble7, mugCx + 16 * s, 1.8),
    makeBubbleProps(bubble8, mugCx - 12 * s, 2.3),
  ];

  // ────────── STATIC PATHS ──────────
  // Mug body outline (rounded bottom corners)
  const mugOutline = `
    M${mugL},${mugT}
    L${mugL},${mugB - cornerR}
    Q${mugL},${mugB} ${mugL + cornerR},${mugB}
    L${mugR - cornerR},${mugB}
    Q${mugR},${mugB} ${mugR},${mugB - cornerR}
    L${mugR},${mugT}
  `;

  // Inner cavity clip
  const innerClip = `
    M${innerL},${innerT}
    L${innerL},${innerB - cornerR}
    Q${innerL},${innerB} ${innerL + cornerR},${innerB}
    L${innerR - cornerR},${innerB}
    Q${innerR},${innerB} ${innerR},${innerB - cornerR}
    L${innerR},${innerT}
    Z
  `;

  // Handle outer path (thick rounded D-shape)
  const handleOuter = `
    M${handleX},${handleTop}
    C${handleX + 8 * s},${handleTop - 5 * s}
     ${handleOut + 4 * s},${handleTop + 5 * s}
     ${handleOut},${handleTop + (handleBot - handleTop) * 0.35}
    C${handleOut - 2 * s},${handleBot - 5 * s}
     ${handleX + 8 * s},${handleBot + 5 * s}
     ${handleX},${handleBot}
  `;

  // Handle inner path
  const hInnerOut = handleOut - 10 * s;
  const handleInner = `
    M${handleX},${handleTop + 8 * s}
    C${handleX + 5 * s},${handleTop + 5 * s}
     ${hInnerOut + 2 * s},${handleTop + 12 * s}
     ${hInnerOut},${handleTop + (handleBot - handleTop) * 0.4}
    C${hInnerOut - 1 * s},${handleBot - 10 * s}
     ${handleX + 5 * s},${handleBot - 3 * s}
     ${handleX},${handleBot - 8 * s}
  `;

  // Foam cloud path — bubbly cloud shape that overflows above the mug
  // Uses cubic beziers to create round bumps like the reference icon
  const fL = mugL - 5 * s;
  const fR = mugR + 5 * s;
  const fMid = mugCx;
  const fTop = mugT - 22 * s;

  const foamCloudPath = `
    M${fL},${mugT + 2 * s}
    C${fL - 6 * s},${mugT - 5 * s}
     ${fL + 2 * s},${fTop + 15 * s}
     ${fL + 15 * s},${fTop + 10 * s}
    C${fL + 18 * s},${fTop + 2 * s}
     ${fMid - 18 * s},${fTop - 3 * s}
     ${fMid - 8 * s},${fTop}
    C${fMid - 2 * s},${fTop - 4 * s}
     ${fMid + 5 * s},${fTop - 2 * s}
     ${fMid + 12 * s},${fTop + 2 * s}
    C${fMid + 22 * s},${fTop + 5 * s}
     ${fR - 10 * s},${fTop + 3 * s}
     ${fR - 5 * s},${fTop + 12 * s}
    C${fR},${fTop + 18 * s}
     ${fR + 5 * s},${mugT - 3 * s}
     ${fR},${mugT + 2 * s}
    Z
  `;

  // Vertical highlight lines inside the beer (like the icon)
  const highlightLines = [
    { x: mugCx - 14 * s, top: innerT + mugH * 0.12, bot: innerB - 10 * s },
    { x: mugCx, top: innerT + mugH * 0.08, bot: innerB - 8 * s },
    { x: mugCx + 14 * s, top: innerT + mugH * 0.15, bot: innerB - 12 * s },
  ];

  return (
    <View style={styles.container}>
      <Svg width={svgW + 10 * s} height={svgH} viewBox={`${-5 * s} 0 ${svgW + 10 * s} ${svgH}`}>
        <Defs>
          <ClipPath id="mugInner">
            <Path d={innerClip} />
          </ClipPath>

          <LinearGradient id="beerFill" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={beerDark} stopOpacity="0.75" />
            <Stop offset="0.35" stopColor={beerBody} stopOpacity="0.9" />
            <Stop offset="0.65" stopColor={beerBody} stopOpacity="0.9" />
            <Stop offset="1" stopColor={beerDark} stopOpacity="0.7" />
          </LinearGradient>

          <LinearGradient id="foamFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={foamWhite} stopOpacity="1" />
            <Stop offset="0.6" stopColor={foamCream} stopOpacity="0.9" />
            <Stop offset="1" stopColor={beerBody} stopOpacity="0.25" />
          </LinearGradient>
        </Defs>

        {/* ===== BASE ===== */}
        <Rect
          x={baseL}
          y={mugB}
          width={baseW}
          height={baseH}
          rx={cornerR * 0.6}
          fill={baseTint}
          stroke={outline}
          strokeWidth={stroke}
        />

        {/* ===== MUG BODY FILL (light tint) ===== */}
        <Path
          d={`${mugOutline} Z`}
          fill={baseTint}
          opacity={0.3}
        />

        {/* ===== BEER LIQUID ===== */}
        <AnimatedRect
          x={innerL - 1}
          y={beerY}
          width={innerR - innerL + 2}
          height={beerHeight}
          fill="url(#beerFill)"
          clipPath="url(#mugInner)"
        />

        {/* Beer depth at bottom */}
        <AnimatedRect
          x={innerL}
          y={fillLevel.interpolate({
            inputRange: [0, 1],
            outputRange: [innerB, innerB - mugH * 0.06],
          })}
          width={innerR - innerL}
          height={mugH * 0.06}
          fill={beerDark}
          opacity={0.25}
          clipPath="url(#mugInner)"
        />

        {/* ===== VERTICAL HIGHLIGHT LINES (icon style) ===== */}
        {highlightLines.map((hl, i) => (
          <AnimatedRect
            key={`hl-${i}`}
            x={hl.x - 1.5 * s}
            y={beerY}
            width={3 * s}
            height={beerHeight}
            fill={beerDark}
            opacity={0.25}
            clipPath="url(#mugInner)"
          />
        ))}

        {/* ===== BUBBLES ===== */}
        {bubbles.map((b, i) => (
          <AnimatedCircle
            key={`bub-${i}`}
            cx={b.cx}
            cy={b.cy}
            r={b.r}
            fill={foamWhite}
            opacity={b.opacity}
            clipPath="url(#mugInner)"
          />
        ))}

        {/* ===== FOAM CLOUD (overflowing above mug) ===== */}
        <AnimatedPath
          d={foamCloudPath}
          fill="url(#foamFill)"
          stroke={outline}
          strokeWidth={stroke}
          opacity={foamScale}
        />

        {/* Foam cloud inner highlight bumps */}
        <AnimatedEllipse
          cx={fMid - 12 * s}
          cy={foamY.interpolate({
            inputRange: [innerB, mugT - 2 * s],
            outputRange: [innerB, fTop + 14 * s],
            extrapolate: 'clamp',
          })}
          rx={foamWobble.interpolate({
            inputRange: [0, 1],
            outputRange: [10 * s, 12 * s],
          })}
          ry={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, 7 * s],
          })}
          fill={foamWhite}
          opacity={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, 0.6],
          })}
        />
        <AnimatedEllipse
          cx={fMid + 10 * s}
          cy={foamY.interpolate({
            inputRange: [innerB, mugT - 2 * s],
            outputRange: [innerB, fTop + 12 * s],
            extrapolate: 'clamp',
          })}
          rx={foamWobble.interpolate({
            inputRange: [0, 1],
            outputRange: [8 * s, 11 * s],
          })}
          ry={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, 6 * s],
          })}
          fill={foamWhite}
          opacity={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, 0.5],
          })}
        />

        {/* ===== FOAM DRIPS running down the sides ===== */}
        {/* Left drip */}
        <AnimatedRect
          x={mugL - 2 * s}
          y={mugT}
          width={6 * s}
          height={dripLenL}
          rx={3 * s}
          fill={foamCream}
          stroke={outline}
          strokeWidth={stroke * 0.7}
          opacity={dripAnim}
        />
        {/* Right drip */}
        <AnimatedRect
          x={mugR - 4 * s}
          y={mugT - 1 * s}
          width={5 * s}
          height={dripLenR}
          rx={2.5 * s}
          fill={foamCream}
          stroke={outline}
          strokeWidth={stroke * 0.7}
          opacity={dripAnim}
        />
        {/* Center-left small drip */}
        <AnimatedRect
          x={mugCx - 10 * s}
          y={mugT}
          width={4 * s}
          height={dripAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, mugH * 0.2],
          })}
          rx={2 * s}
          fill={foamCream}
          stroke={outline}
          strokeWidth={stroke * 0.5}
          opacity={dripAnim}
        />

        {/* ===== MUG OUTLINE (thick, like the icon) ===== */}
        <Path
          d={mugOutline}
          fill="none"
          stroke={outline}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Top rim */}
        <Path
          d={`M${mugL},${mugT} L${mugR},${mugT}`}
          stroke={outline}
          strokeWidth={stroke * 1.2}
          strokeLinecap="round"
        />

        {/* ===== HANDLE (thick outline D-shape) ===== */}
        <Path
          d={handleOuter}
          fill={baseTint}
          fillOpacity={0.25}
          stroke={outline}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={handleInner}
          fill="none"
          stroke={outline}
          strokeWidth={stroke * 0.65}
          strokeLinecap="round"
          opacity={0.5}
        />
      </Svg>

      {/* Text with fade-in */}
      <Animated.View style={{ opacity: fadeMessage }}>
        {message && <Text style={styles.message}>{message}</Text>}
        {submessage && <Text style={styles.submessage}>{submessage}</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  message: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  submessage: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
