import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Text } from 'react-native';
import Svg, { Path, Circle, Rect, Defs, ClipPath, Ellipse } from 'react-native-svg';
import { colors, spacing, typography } from '../../theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  const foamWobble = useRef(new Animated.Value(0)).current;
  const fadeMessage = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Beer fills up then resets in a loop
    const fill = Animated.loop(
      Animated.sequence([
        // Fill the glass
        Animated.timing(fillLevel, {
          toValue: 1,
          duration: 2400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        // Foam appears
        Animated.timing(foamScale, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: false,
        }),
        // Hold full for a moment
        Animated.delay(800),
        // Reset
        Animated.parallel([
          Animated.timing(fillLevel, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }),
          Animated.timing(foamScale, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }),
        ]),
        Animated.delay(200),
      ]),
    );

    // Bubbles rising in staggered loops
    const makeBubble = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 1200,
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
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(foamWobble, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );

    // Fade in message
    const fade = Animated.timing(fadeMessage, {
      toValue: 1,
      duration: 600,
      delay: 300,
      useNativeDriver: true,
    });

    fill.start();
    makeBubble(bubble1, 0).start();
    makeBubble(bubble2, 400).start();
    makeBubble(bubble3, 800).start();
    wobble.start();
    fade.start();

    return () => {
      fill.stop();
      bubble1.stopAnimation();
      bubble2.stopAnimation();
      bubble3.stopAnimation();
      wobble.stop();
      fade.stop();
    };
  }, [fillLevel, foamScale, bubble1, bubble2, bubble3, foamWobble, fadeMessage]);

  // Dimensions
  const glassW = size * 0.6;
  const glassH = size * 0.85;
  const svgW = size;
  const svgH = size * 1.1;
  const glassX = (svgW - glassW) / 2;
  const glassTop = svgH * 0.15;
  const glassBottom = glassTop + glassH;

  // Beer fill interpolation (from bottom of glass upward)
  const beerY = fillLevel.interpolate({
    inputRange: [0, 1],
    outputRange: [glassBottom, glassTop + glassH * 0.12],
  });
  const beerHeight = fillLevel.interpolate({
    inputRange: [0, 1],
    outputRange: [0, glassH * 0.88],
  });

  // Foam ellipse radius
  const foamRy = foamScale.interpolate({
    inputRange: [0, 1],
    outputRange: [0, size * 0.1],
  });
  const foamRx = foamWobble.interpolate({
    inputRange: [0, 1],
    outputRange: [glassW * 0.42, glassW * 0.48],
  });

  // Bubble Y positions (rising)
  const bubbleY = (anim: Animated.Value, startX: number) => ({
    cy: anim.interpolate({
      inputRange: [0, 1],
      outputRange: [glassBottom - 8, glassTop + glassH * 0.3],
    }),
    opacity: anim.interpolate({
      inputRange: [0, 0.2, 0.8, 1],
      outputRange: [0, 0.7, 0.5, 0],
    }),
  });

  const b1 = bubbleY(bubble1, 0);
  const b2 = bubbleY(bubble2, 0);
  const b3 = bubbleY(bubble3, 0);

  // Beer color - golden amber
  const beerColor = '#F5A623';
  const beerColorDark = '#D4841E';
  const foamColor = '#FFF8E7';
  const glassColor = colors.primary;

  return (
    <View style={styles.container}>
      <Svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
        <Defs>
          <ClipPath id="glassClip">
            {/* Slightly tapered glass shape */}
            <Path
              d={`
                M${glassX + glassW * 0.08},${glassTop}
                L${glassX},${glassBottom}
                L${glassX + glassW},${glassBottom}
                L${glassX + glassW - glassW * 0.08},${glassTop}
                Z
              `}
            />
          </ClipPath>
        </Defs>

        {/* Beer liquid (clipped to glass shape) */}
        <AnimatedRect
          x={glassX - 2}
          y={beerY}
          width={glassW + 4}
          height={beerHeight}
          fill={beerColor}
          clipPath="url(#glassClip)"
        />

        {/* Bubbles inside glass (clipped) */}
        <AnimatedCircle
          cx={svgW * 0.42}
          cy={b1.cy}
          r={2.5}
          fill={foamColor}
          opacity={b1.opacity}
          clipPath="url(#glassClip)"
        />
        <AnimatedCircle
          cx={svgW * 0.52}
          cy={b2.cy}
          r={2}
          fill={foamColor}
          opacity={b2.opacity}
          clipPath="url(#glassClip)"
        />
        <AnimatedCircle
          cx={svgW * 0.47}
          cy={b3.cy}
          r={3}
          fill={foamColor}
          opacity={b3.opacity}
          clipPath="url(#glassClip)"
        />

        {/* Glass outline (tapered pint shape) */}
        <Path
          d={`
            M${glassX + glassW * 0.08},${glassTop}
            L${glassX},${glassBottom}
            L${glassX + glassW},${glassBottom}
            L${glassX + glassW - glassW * 0.08},${glassTop}
          `}
          fill="none"
          stroke={glassColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Glass bottom */}
        <Path
          d={`M${glassX},${glassBottom} L${glassX + glassW},${glassBottom}`}
          stroke={glassColor}
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Handle */}
        <Path
          d={`
            M${glassX + glassW - glassW * 0.04},${glassTop + glassH * 0.25}
            C${glassX + glassW + glassW * 0.35},${glassTop + glassH * 0.25}
             ${glassX + glassW + glassW * 0.35},${glassTop + glassH * 0.7}
             ${glassX + glassW},${glassTop + glassH * 0.7}
          `}
          fill="none"
          stroke={glassColor}
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Foam on top */}
        <AnimatedEllipse
          cx={svgW / 2}
          cy={fillLevel.interpolate({
            inputRange: [0, 1],
            outputRange: [glassBottom, glassTop + glassH * 0.08],
          })}
          rx={foamRx}
          ry={foamRy}
          fill={foamColor}
          opacity={foamScale}
        />
        {/* Extra foam bubbles */}
        <AnimatedEllipse
          cx={svgW / 2 - glassW * 0.15}
          cy={fillLevel.interpolate({
            inputRange: [0, 1],
            outputRange: [glassBottom, glassTop + glassH * 0.05],
          })}
          rx={foamWobble.interpolate({
            inputRange: [0, 1],
            outputRange: [glassW * 0.15, glassW * 0.18],
          })}
          ry={foamRy}
          fill={foamColor}
          opacity={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, 0.8],
          })}
        />
        <AnimatedEllipse
          cx={svgW / 2 + glassW * 0.15}
          cy={fillLevel.interpolate({
            inputRange: [0, 1],
            outputRange: [glassBottom, glassTop + glassH * 0.06],
          })}
          rx={foamWobble.interpolate({
            inputRange: [0, 1],
            outputRange: [glassW * 0.18, glassW * 0.14],
          })}
          ry={foamRy}
          fill={foamColor}
          opacity={foamScale.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0, 0.85],
          })}
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
