/**
 * MargeBar Pro — design tokens « Émeraude Signature » (D1).
 *
 * One font family (Plus Jakarta Sans, one family name per weight — never
 * combine `fontFamily` with `fontWeight`/`fontStyle`), a deep emerald brand
 * ramp, a single vivid accent (lime) and cool green-tinted neutrals.
 *
 * New code uses: `palette` (or `colors` — it contains every palette key),
 * `type`, `space`, `radius`, `elevation`, `gradients`, `motion`, `layout`.
 * The legacy names (`colors.primary`, `typography.h3`, `spacing.md`,
 * `borderRadius.lg`, `shadows.md`, `fonts.serif`…) are kept and mapped to the
 * closest new role so screens that are not redesigned yet still compile and
 * pick up the new look.
 *
 * Light theme only for now. Every colour is a role name, so a dark palette can
 * be added later by swapping `palette`.
 */
import { Platform, TextStyle, ViewStyle } from 'react-native';
import { Easing as REasing } from 'react-native-reanimated';
import { Easing as RNEasing } from 'react-native';

// ─── 1. Colour palette (spec §1.1) ─────────────────────────────────────────
export const palette = {
  // Emerald ramp
  em950: '#022A1E',
  em900: '#04402E',
  em800: '#065A41',
  em700: '#087553', // brand primary
  em600: '#0B8F65',
  em500: '#10AC79',
  em300: '#6FD3A8',
  em200: '#A8E6CB',
  em100: '#D3F3E4',
  em50: '#EAF8F1',

  // The one vivid accent — only on emerald/dark surfaces, or as a fill with onLime text
  lime: '#C5F04A',
  limeSoft: '#E4F9A6',
  onLime: '#18260A',

  // Neutrals
  bg: '#F3F6F4',
  surface: '#FFFFFF',
  surface2: '#EEF2F0',
  surface3: '#E4EAE7',
  line: '#E1E7E4',
  lineStrong: '#CCD6D1',
  ink: '#0B1C15',
  text2: '#3D4C46',
  text3: '#64736C',
  text4: '#97A39E',
  onEmerald: '#FFFFFF',
  onEmerald2: 'rgba(255,255,255,0.74)',
  onEmerald3: 'rgba(255,255,255,0.56)',

  // Semantic — margin health
  good: '#087553',
  goodBg: '#E0F5EA',
  warn: '#955600',
  warnBg: '#FFF0D2',
  warnSolid: '#F0A417',
  bad: '#B3342A',
  badBg: '#FCE5E1',
  badSolid: '#E4553F',

  // Semantic colours to use ON emerald / dark surfaces only
  goodOnEmerald: '#C5F04A',
  warnOnEmerald: '#F5B638',
  badOnEmerald: '#FF8B78',

  // Trophy tile (« Meilleur produit »)
  trophyBg: '#FFF6D6',
  trophy: '#A86A00',

  scrim: 'rgba(2,20,14,0.48)',
  focusRing: 'rgba(8,117,83,0.12)',
  shadow: '#04281E',
  transparent: 'transparent',
} as const;

export type PaletteKey = keyof typeof palette;

/**
 * `colors` = every palette token + the legacy keys used by the screens that
 * are not redesigned yet. Legacy values are 6-digit hex where old code
 * appends an alpha suffix (`colors.marginRed + '10'`).
 */
export const colors = {
  ...palette,

  // Legacy (Atelier) keys → closest D1 role
  primary: palette.em700,
  secondary: palette.em800,
  accent: palette.em600,
  light: palette.em50,
  white: '#FFFFFF',
  black: '#000000',
  gray: palette.surface2,
  grayMedium: palette.text4,
  grayDark: palette.text2,
  background: palette.bg,
  backgroundWarm: palette.bg,
  cardBackground: palette.surface,
  cardBackgroundHi: palette.surface,
  cardBackgroundLo: palette.surface2,
  text: palette.ink,
  textSecondary: palette.text2,
  textMuted: palette.text3,
  textFaint: palette.text4,
  textLight: '#FFFFFF',
  border: palette.line,
  borderHi: palette.line,
  inputBackground: palette.surface,
  tabBar: palette.em700,
  tabBarInactive: palette.text3,
  accentSoft: 'rgba(8,117,83,0.12)',
  accentGlow: 'rgba(8,117,83,0.24)',
  onAccent: '#FFFFFF',
  overlay: palette.scrim,
  gradientStart: palette.em900,
  gradientEnd: palette.em700,
  green: palette.good,
  orange: palette.warnSolid,
  red: palette.badSolid,
  marginGreen: palette.good,
  marginOrange: '#C77A00', // readable on light, still "orange"
  marginRed: palette.bad,
};

/** Margin zone → colours. `zone` comes from `getMarginColor(margin, thresholds)`. */
export type MarginZone = 'green' | 'orange' | 'red';
export const marginColors: Record<MarginZone, { fg: string; bg: string; solid: string; onEmerald: string; label: string }> = {
  green: { fg: palette.good, bg: palette.goodBg, solid: palette.good, onEmerald: palette.goodOnEmerald, label: 'bonne' },
  orange: { fg: palette.warn, bg: palette.warnBg, solid: palette.warnSolid, onEmerald: palette.warnOnEmerald, label: 'à surveiller' },
  red: { fg: palette.bad, bg: palette.badBg, solid: palette.badSolid, onEmerald: palette.badOnEmerald, label: 'à revoir' },
};

/**
 * The ONE composition-bar mapping (BRIEF §1.3). Achat = em800, Accise = em300,
 * Sécu = lime on emerald / warnSolid on light surfaces.
 */
export const compositionColors = {
  light: { achat: palette.em800, accise: palette.em300, secu: palette.warnSolid, tva: palette.text4 },
  onEmerald: { achat: '#FFFFFF', accise: palette.em300, secu: palette.lime, tva: 'rgba(255,255,255,0.4)' },
} as const;

// ─── 2. Fonts (one family name per weight) ─────────────────────────────────
export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

/** Legacy `fonts` keys + per-weight names. Serif/script map to Jakarta (no italics). */
export const fonts = {
  ...fontFamily,
  body: fontFamily.regular,
  serif: fontFamily.extrabold,
  serifBold: fontFamily.extrabold,
  script: fontFamily.semibold,
  display: fontFamily.extrabold,
  text: fontFamily.regular,
} as const;

// ─── 3. Type scale (spec §1.4, Jakarta everywhere, no fontWeight) ─────────
const tnum: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  displayXL: { fontFamily: fontFamily.extrabold, fontSize: 56, lineHeight: 60, letterSpacing: -2, fontVariant: tnum },
  display: { fontFamily: fontFamily.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  numHero: { fontFamily: fontFamily.extrabold, fontSize: 44, lineHeight: 48, letterSpacing: -1.6, fontVariant: tnum },
  title1: { fontFamily: fontFamily.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  title2: { fontFamily: fontFamily.extrabold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  title3: { fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
  numL: { fontFamily: fontFamily.extrabold, fontSize: 32, lineHeight: 36, letterSpacing: -1, fontVariant: tnum },
  numM: { fontFamily: fontFamily.bold, fontSize: 19, lineHeight: 24, letterSpacing: -0.4, fontVariant: tnum },
  numS: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20, fontVariant: tnum },
  stepperValue: { fontFamily: fontFamily.extrabold, fontSize: 24, lineHeight: 28, letterSpacing: -0.6, fontVariant: tnum },
  inputValue: { fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 24, letterSpacing: -0.3, fontVariant: tnum },
  headline: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.15 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 24 },
  callout: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 22 },
  calloutStrong: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 22 },
  button: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  buttonSm: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  footnote: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  footnoteStrong: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 18 }, // field labels
  caps: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.7, textTransform: 'uppercase' },
  tabLabel: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 15, letterSpacing: -0.05 },
  valueRow: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 22, fontVariant: tnum },
} satisfies Record<string, TextStyle>;

export type TypeKey = keyof typeof type;

/** Legacy `typography` keys → Jakarta equivalents (sizes kept close to the old ones). */
export const typography = {
  display: { fontFamily: fontFamily.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  displaySmall: { fontFamily: fontFamily.extrabold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  number: { fontFamily: fontFamily.extrabold, fontVariant: tnum },
  h1: type.title1,
  h2: { fontFamily: fontFamily.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  h3: type.title3,
  body: type.body,
  bodySmall: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  eyebrow: type.caps,
  script: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 22 },
  ...type,
} satisfies Record<string, TextStyle>;

// ─── 4. Spacing (4-pt grid) ────────────────────────────────────────────────
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 28,
  s8: 32,
  s10: 40,
  s12: 48,
  gutter: 20,
} as const;

/** Legacy `spacing` keys (values unchanged) + the new grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  ...space,
} as const;

// ─── 5. Radii ──────────────────────────────────────────────────────────────
export const radius = {
  xs: 8,
  sm: 12,
  icon: 14,
  md: 16,
  lg: 20,
  bar: 26,
  xl: 28,
  xxl: 32,
  full: 999,
} as const;

/** Legacy name. */
export const borderRadius = radius;

// ─── 6. Elevation (one shadow per view) ────────────────────────────────────
type Shadow = ViewStyle;
function shadow(web: string, native: ViewStyle): Shadow {
  return Platform.select<Shadow>({
    // RNW 0.19 passes boxShadow straight to CSS (exact parity with the mockups)
    web: { boxShadow: web } as unknown as ViewStyle,
    default: native,
  }) as Shadow;
}

export const elevation = {
  e0: {} as Shadow,
  e1: shadow('0 1px 2px rgba(4,40,30,0.06)', {
    shadowColor: palette.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 1, elevation: 1,
  }),
  e2: shadow('0 6px 18px rgba(4,40,30,0.08)', {
    shadowColor: palette.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  }),
  e3: shadow('0 12px 32px rgba(4,40,30,0.14)', {
    shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.14, shadowRadius: 18, elevation: 8,
  }),
  glow: shadow('0 8px 20px rgba(8,117,83,0.35)', {
    shadowColor: palette.em700, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  }),
  glowLime: shadow('0 8px 22px rgba(197,240,74,0.28)', {
    shadowColor: palette.lime, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 12, elevation: 4,
  }),
  /** Segmented thumb */
  thumb: shadow('0 2px 6px rgba(4,40,30,0.12)', {
    shadowColor: palette.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 2,
  }),
  /** Slider knob */
  knob: shadow('0 3px 8px rgba(4,40,30,0.22)', {
    shadowColor: palette.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 4, elevation: 4,
  }),
  knobGrab: shadow('0 6px 14px rgba(4,40,30,0.26)', {
    shadowColor: palette.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.26, shadowRadius: 7, elevation: 6,
  }),
  /** Sticky action bar (shadow upward) */
  up: shadow('0 -8px 24px rgba(4,40,30,0.06)', {
    shadowColor: palette.shadow, shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  }),
  /** Brand mark */
  mark: shadow('0 4px 10px rgba(2,42,30,0.25)', {
    shadowColor: palette.em950, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 3,
  }),
} as const;

/** Legacy name — old "paper" hard shadow becomes the subtle e1. */
export const shadows = {
  sm: elevation.e1,
  md: elevation.e2,
  lg: elevation.e3,
  paper: elevation.e1,
  ...elevation,
} as const;

// ─── 7. Gradients (expo-linear-gradient props) ─────────────────────────────
type GradientProps = {
  colors: string[];
  locations?: number[];
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export const gradients = {
  heroBase: {
    colors: [palette.em900, palette.em800, palette.em600],
    locations: [0, 0.48, 1],
    start: { x: 0.2, y: 0 },
    end: { x: 0.8, y: 1 },
  },
  heroGlint: {
    colors: ['rgba(197,240,74,0.20)', 'rgba(197,240,74,0)'],
    locations: [0, 1],
    start: { x: 1, y: 0 },
    end: { x: 0.55, y: 0.45 },
  },
  resultCard: {
    colors: [palette.em900, palette.em700],
    locations: [0, 1],
    start: { x: 0.15, y: 0 },
    end: { x: 0.85, y: 1 },
  },
  scanButton: {
    colors: [palette.em600, palette.em800],
    locations: [0, 1],
    start: { x: 0.1, y: 0 },
    end: { x: 0.9, y: 1 },
  },
  iconTile: {
    colors: [palette.em600, palette.em800],
    locations: [0, 1],
    start: { x: 0.1, y: 0 },
    end: { x: 0.9, y: 1 },
  },
  sliderFill: {
    colors: [palette.em600, palette.em700],
    locations: [0, 1],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
  fadeBottom: {
    colors: ['rgba(243,246,244,0)', 'rgba(243,246,244,0.92)', palette.bg],
    locations: [0, 0.55, 1],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
  fadeRight: {
    colors: ['rgba(243,246,244,0)', palette.bg],
    locations: [0, 1],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
  /** fadeRight on a white surface (chip rows inside cards / sheets) */
  fadeRightSurface: {
    colors: ['rgba(255,255,255,0)', '#FFFFFF'],
    locations: [0, 1],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
  /** Bottom fade over scrolling sheet content */
  fadeBottomSurface: {
    colors: ['rgba(255,255,255,0)', '#FFFFFF'],
    locations: [0, 1],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
  shimmer: {
    colors: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)'],
    locations: [0, 0.5, 1],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
} satisfies Record<string, GradientProps>;

// ─── 8. Motion (spec §5.1) ─────────────────────────────────────────────────
export const motion = {
  duration: {
    instant: 90,
    fast: 160,
    base: 240,
    enter: 280,
    slow: 360,
    count: 700,
    shimmer: 1200,
  },
  /** Reanimated easings (for `withTiming`). */
  easing: {
    standard: REasing.bezier(0.2, 0, 0, 1),
    decel: REasing.bezier(0, 0, 0, 1),
    accel: REasing.bezier(0.3, 0, 1, 1),
    linear: REasing.linear,
  },
  /** Plain JS easings (RN Animated / requestAnimationFrame). */
  easingJS: {
    standard: RNEasing.bezier(0.2, 0, 0, 1),
    decel: RNEasing.bezier(0, 0, 0, 1),
    accel: RNEasing.bezier(0.3, 0, 1, 1),
  },
  /** `withSpring` configs. */
  spring: {
    snappy: { stiffness: 420, damping: 34, mass: 1 },
    gentle: { stiffness: 260, damping: 28, mass: 1 },
    pop: { stiffness: 520, damping: 20, mass: 0.9 },
  },
  stagger: { step: 40, max: 8 },
  pressScale: { button: 0.97, card: 0.98, chip: 0.96, scan: 0.94 },
} as const;

// ─── 9. Layout constants ───────────────────────────────────────────────────
export const layout = {
  gutter: 20,
  tabBarHeight: 68,
  tabBarSide: 12,
  navBarHeight: 56,
  largeTitleHeight: 64,
  compactBarHeight: 56,
  /** Distance from the screen bottom to the floating tab bar. */
  tabBarBottom: (insetBottom: number) => Math.max(12, insetBottom - 10),
  /** Bottom padding for scroll content when the floating tab bar is visible. */
  contentBottomInset: (insetBottom: number) => 68 + Math.max(12, insetBottom - 10) + 24,
  /** Height of the fadeBottom gradient behind the tab bar. */
  fadeBottomHeight: (insetBottom: number) => 68 + Math.max(12, insetBottom - 10) + 44,
  minTouch: 44,
} as const;

/** Static theme object (a dark palette can be swapped in later). */
export const theme = { colors, palette, type, space, radius, elevation, gradients, motion, layout, fonts };
export function useTheme() {
  return theme;
}
