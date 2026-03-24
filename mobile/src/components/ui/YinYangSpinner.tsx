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
  G,
} from 'react-native-svg';
import { colors, spacing, typography } from '../../theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

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
  const foamWobble = useRef(new Animated.Value(0)).current;
  const fadeMessage = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Beer fills up then resets in a loop
    const fill = Animated.loop(
      Animated.sequence([
        Animated.timing(fillLevel, {
          toValue: 1,
          duration: 2800,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(foamScale, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: false,
        }),
        Animated.delay(1000),
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
        ]),
        Animated.delay(300),
      ]),
    );

    // Bubbles rising in staggered loops
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

    // Foam wobble
    const wobble = Animated.loop(
      Animated.sequence([
        Animated.timing(foamWobble, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(foamWobble, {
          toValue: 0,
          duration: 900,
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
    makeBubble(bubble2, 300, 1100).start();
    makeBubble(bubble3, 600, 1300).start();
    makeBubble(bubble4, 200, 1500).start();
    makeBubble(bubble5, 500, 1000).start();
    makeBubble(bubble6, 800, 1200).start();
    wobble.start();
    fade.start();

    return () => {
      fill.stop();
      bubble1.stopAnimation();
      bubble2.stopAnimation();
      bubble3.stopAnimation();
      bubble4.stopAnimation();
      bubble5.stopAnimation();
      bubble6.stopAnimation();
      wobble.stop();
      fade.stop();
    };
  }, [fillLevel, foamScale, bubble1, bubble2, bubble3, bubble4, bubble5, bubble6, foamWobble, fadeMessage]);

  // --- Dimensions ---
  const svgW = size * 1.2;
  const svgH = size * 1.3;
  const glassW = size * 0.55;
  const glassH = size * 0.9;
  const wallThick = size * 0.045;
  const cx = svgW * 0.44; // center X shifted left to leave room for handle
  const glassTop = svgH * 0.12;
  const glassBottom = glassTop + glassH;

  // Taper: top is wider, bottom is narrower (pint glass shape)
  const topHalfW = glassW / 2;
  const botHalfW = glassW * 0.38;

  // Glass outer edges
  const outerTL = cx - topHalfW;
  const outerTR = cx + topHalfW;
  const outerBL = cx - botHalfW;
  const outerBR = cx + botHalfW;

  // Glass inner edges
  const innerTL = outerTL + wallThick;
  const innerTR = outerTR - wallThick;
  const innerBL = outerBL + wallThick;
  const innerBR = outerBR - wallThick;
  const innerTop = glassTop + wallThick * 0.5;
  const innerBottom = glassBottom - wallThick;

  // Beer fill interpolation
  const beerY = fillLevel.interpolate({
    inputRange: [0, 1],
    outputRange: [innerBottom, innerTop + glassH * 0.05],
  });
  const beerHeight = fillLevel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, innerBottom - innerTop - glassH * 0.05],
  });

  // Foam
  const foamTopY = fillLevel.interpolate({
    inputRange: [0, 1],
    outputRange: [innerBottom, innerTop + glassH * 0.02],
  });
  const foamRy = foamScale.interpolate({
    inputRange: [0, 1],
    outputRange: [0, size * 0.09],
  });

  // Bubble helper
  const makeBubbleProps = (anim: Animated.Value, xPos: number, bubbleR: number) => ({
    cx: xPos,
    cy: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [innerBottom - 5, innerTop + glassH * 0.25],
    }),
    r: bubbleR,
    opacity: anim.interpolate({
      inputRange: [0, 0.15, 0.7, 1],
      outputRange: [0, 0.6, 0.4, 0],
    }),
  });

  const b1 = makeBubbleProps(bubble1, cx - glassW * 0.12, 2.8);
  const b2 = makeBubbleProps(bubble2, cx + glassW * 0.08, 2.2);
  const b3 = makeBubbleProps(bubble3, cx - glassW * 0.02, 3.2);
  const b4 = makeBubbleProps(bubble4, cx + glassW * 0.18, 1.8);
  const b5 = makeBubbleProps(bubble5, cx - glassW * 0.2, 2.0);
  const b6 = makeBubbleProps(bubble6, cx + glassW * 0.02, 2.5);

  // Colors
  const beerGold = '#F0A61E';
  const beerAmber = '#D4881E';
  const foamWhite = '#FFF9EE';
  const foamCream = '#F5E6C8';
  const glassEdge = colors.primary;
  const glassInner = `${colors.primary}18`; // very transparent for glass fill
  const glossHighlight = '#FFFFFF';

  // Outer glass path (thick walls with taper)
  const outerGlass = `
    M${outerTL},${glassTop}
    L${outerBL},${glassBottom}
    L${outerBR},${glassBottom}
    L${outerTR},${glassTop}
    Z
  `;

  // Inner glass path (the cavity)
  const innerGlass = `
    M${innerTL},${innerTop}
    L${innerBL},${innerBottom}
    L${innerBR},${innerBottom}
    L${innerTR},${innerTop}
    Z
  `;

  // Base/foot of the glass
  const baseY = glassBottom;
  const baseH = size * 0.04;
  const basePadding = size * 0.04;

  return (
    <View style={styles.container}>
      <Svg width={svgW} height={svgH + baseH + 4} viewBox={`0 0 ${svgW} ${svgH + baseH + 4}`}>
        <Defs>
          {/* Clip path for beer liquid inside the glass */}
          <ClipPath id="innerClip">
            <Path d={innerGlass} />
          </ClipPath>

          {/* Beer gradient */}
          <LinearGradient id="beerGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={beerAmber} stopOpacity="0.9" />
            <Stop offset="0.4" stopColor={beerGold} stopOpacity="1" />
            <Stop offset="0.7" stopColor={beerGold} stopOpacity="1" />
            <Stop offset="1" stopColor={beerAmber} stopOpacity="0.85" />
          </LinearGradient>

          {/* Glass body gradient for thickness effect */}
          <LinearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={glassEdge} stopOpacity="0.25" />
            <Stop offset="0.15" stopColor={glassEdge} stopOpacity="0.08" />
            <Stop offset="0.85" stopColor={glassEdge} stopOpacity="0.08" />
            <Stop offset="1" stopColor={glassEdge} stopOpacity="0.25" />
          </LinearGradient>

          {/* Foam gradient */}
          <LinearGradient id="foamGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={foamWhite} stopOpacity="1" />
            <Stop offset="1" stopColor={foamCream} stopOpacity="0.95" />
          </LinearGradient>
        </Defs>

        {/* ===== GLASS BODY (thick walls) ===== */}
        {/* Outer glass shape - filled with slight tint */}
        <Path d={outerGlass} fill="url(#glassGrad)" />

        {/* Left wall highlight (gloss) */}
        <Path
          d={`
            M${outerTL + wallThick * 0.25},${glassTop + 4}
            L${outerBL + wallThick * 0.25},${glassBottom - 2}
          `}
          stroke={glossHighlight}
          strokeWidth={wallThick * 0.35}
          strokeLinecap="round"
          opacity={0.2}
        />

        {/* Right wall highlight */}
        <Path
          d={`
            M${outerTR - wallThick * 0.6},${glassTop + 6}
            L${outerBR - wallThick * 0.5},${glassBottom - 4}
          `}
          stroke={glossHighlight}
          strokeWidth={wallThick * 0.2}
          strokeLinecap="round"
          opacity={0.12}
        />

        {/* ===== BEER LIQUID (clipped inside inner glass) ===== */}
        <AnimatedRect
          x={innerBL - 2}
          y={beerY}
          width={innerBR - innerBL + 4}
          height={beerHeight}
          fill="url(#beerGrad)"
          clipPath="url(#innerClip)"
        />

        {/* Beer darker strip at bottom for depth */}
        <AnimatedRect
          x={innerBL}
          y={fillLevel.interpolate({
            inputRange: [0, 1],
            outputRange: [innerBottom, innerBottom - glassH * 0.08],
          })}
          width={innerBR - innerBL}
          height={glassH * 0.08}
          fill={beerAmber}
          opacity={0.35}
          clipPath="url(#innerClip)"
        />

        {/* ===== BUBBLES ===== */}
        {[b1, b2, b3, b4, b5, b6].map((b, i) => (
          <AnimatedCircle
            key={i}
            cx={b.cx}
            cy={b.cy}
            r={b.r}
            fill={foamWhite}
            opacity={b.opacity}
            clipPath="url(#innerClip)"
          />
        ))}

        {/* ===== FOAM LAYER ===== */}
        {/* Main foam body - wide ellipse */}
        <AnimatedEllipse
          cx={cx}
          cy={foamTopY}
          rx={foamWobble.interpolate({
            inputRange: [0, 1],
            outputRange: [topHalfW * 0.75, topHalfW * 0.85],
          })}
          ry={foamRy}
          fill="url(#foamGrad)"
          opacity={foamScale}
          clipPath="url(#innerClip)"
        />

        {/* Foam bubble cluster left */}
        <AnimatedEllipse
          cx={cx - topHalfW * 0.32}
          cy={fillLevel.interpolate({
            inputRange: [0, 1],
            outputRange: [innerBottom, innerTop + glassH * 0.0],
          })}
          rx={foamWobble.interpolate({
            inputRange: [0, 1],
            outputRange: [topHalfW * 0.32, topHalfW * 0.38],
          })}
          ry={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, size * 0.075],
          })}
          fill={foamWhite}
          opacity={foamScale.interpolate({
            inputRange: [0, 0.4, 1],
            outputRange: [0, 0, 0.9],
          })}
          clipPath="url(#innerClip)"
        />

        {/* Foam bubble cluster right */}
        <AnimatedEllipse
          cx={cx + topHalfW * 0.3}
          cy={fillLevel.interpolate({
            inputRange: [0, 1],
            outputRange: [innerBottom, innerTop + glassH * 0.01],
          })}
          rx={foamWobble.interpolate({
            inputRange: [0, 1],
            outputRange: [topHalfW * 0.35, topHalfW * 0.28],
          })}
          ry={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, size * 0.065],
          })}
          fill={foamWhite}
          opacity={foamScale.interpolate({
            inputRange: [0, 0.4, 1],
            outputRange: [0, 0, 0.85],
          })}
          clipPath="url(#innerClip)"
        />

        {/* Foam bubble cluster center-top (overflowing feel) */}
        <AnimatedEllipse
          cx={cx}
          cy={fillLevel.interpolate({
            inputRange: [0, 1],
            outputRange: [innerBottom, innerTop - size * 0.015],
          })}
          rx={foamWobble.interpolate({
            inputRange: [0, 1],
            outputRange: [topHalfW * 0.45, topHalfW * 0.5],
          })}
          ry={foamScale.interpolate({
            inputRange: [0, 0.6, 1],
            outputRange: [0, 0, size * 0.06],
          })}
          fill={foamWhite}
          opacity={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, 0.95],
          })}
        />

        {/* Small foam dots for bubbly texture */}
        {[
          { dx: -0.18, dy: 0.01, r: size * 0.022 },
          { dx: 0.12, dy: -0.005, r: size * 0.018 },
          { dx: -0.05, dy: -0.01, r: size * 0.025 },
          { dx: 0.22, dy: 0.015, r: size * 0.015 },
          { dx: -0.25, dy: 0.02, r: size * 0.016 },
          { dx: 0.05, dy: 0.025, r: size * 0.02 },
          { dx: -0.12, dy: -0.008, r: size * 0.019 },
          { dx: 0.18, dy: -0.002, r: size * 0.017 },
        ].map((dot, i) => (
          <AnimatedCircle
            key={`foamdot-${i}`}
            cx={cx + topHalfW * dot.dx}
            cy={fillLevel.interpolate({
              inputRange: [0, 1],
              outputRange: [innerBottom, innerTop + glassH * dot.dy],
            })}
            r={dot.r}
            fill={foamWhite}
            opacity={foamScale.interpolate({
              inputRange: [0, 0.6, 1],
              outputRange: [0, 0, 0.7 + Math.random() * 0.3],
            })}
          />
        ))}

        {/* ===== GLASS OUTLINE EDGES ===== */}
        {/* Left wall outer edge */}
        <Path
          d={`M${outerTL},${glassTop} L${outerBL},${glassBottom}`}
          stroke={glassEdge}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.7}
        />
        {/* Right wall outer edge */}
        <Path
          d={`M${outerTR},${glassTop} L${outerBR},${glassBottom}`}
          stroke={glassEdge}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.7}
        />
        {/* Bottom edge */}
        <Path
          d={`M${outerBL},${glassBottom} L${outerBR},${glassBottom}`}
          stroke={glassEdge}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.7}
        />
        {/* Top rim - thicker for realism */}
        <Path
          d={`M${outerTL - 1},${glassTop} L${outerTR + 1},${glassTop}`}
          stroke={glassEdge}
          strokeWidth={3.5}
          strokeLinecap="round"
          opacity={0.5}
        />
        {/* Inner wall hints (subtle) */}
        <Path
          d={`M${innerTL},${innerTop} L${innerBL},${innerBottom}`}
          stroke={glassEdge}
          strokeWidth={0.8}
          opacity={0.2}
        />
        <Path
          d={`M${innerTR},${innerTop} L${innerBR},${innerBottom}`}
          stroke={glassEdge}
          strokeWidth={0.8}
          opacity={0.2}
        />

        {/* ===== GLASS BASE ===== */}
        <Rect
          x={outerBL - basePadding}
          y={baseY}
          width={outerBR - outerBL + basePadding * 2}
          height={baseH}
          rx={baseH / 2}
          fill={glassEdge}
          opacity={0.3}
        />

        {/* ===== HANDLE ===== */}
        <Path
          d={`
            M${outerTR - wallThick * 0.3},${glassTop + glassH * 0.2}
            C${outerTR + glassW * 0.38},${glassTop + glassH * 0.18}
             ${outerTR + glassW * 0.4},${glassTop + glassH * 0.72}
             ${outerBR + wallThick * 0.2},${glassTop + glassH * 0.68}
          `}
          fill="none"
          stroke={glassEdge}
          strokeWidth={3.5}
          strokeLinecap="round"
          opacity={0.6}
        />
        {/* Handle inner edge for thickness */}
        <Path
          d={`
            M${outerTR - wallThick * 0.1},${glassTop + glassH * 0.23}
            C${outerTR + glassW * 0.28},${glassTop + glassH * 0.22}
             ${outerTR + glassW * 0.3},${glassTop + glassH * 0.68}
             ${outerBR + wallThick * 0.3},${glassTop + glassH * 0.65}
          `}
          fill="none"
          stroke={glassEdge}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.25}
        />

        {/* ===== GLASS GLOSS / SHINE ===== */}
        <Path
          d={`
            M${outerTL + wallThick * 1.5},${glassTop + glassH * 0.08}
            L${outerBL + wallThick * 1.2},${glassBottom - glassH * 0.15}
          `}
          stroke={glossHighlight}
          strokeWidth={wallThick * 0.6}
          strokeLinecap="round"
          opacity={0.15}
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
