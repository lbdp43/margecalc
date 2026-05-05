import { Platform } from 'react-native';
import { PALETTE, MARGIN_COLOR_MAP } from '@margebar/shared';

// ─── Atelier / Velvet emerald palette ─────────────────────────
// Inspired by an artisanal "carnet de bistrot" aesthetic:
// kraft-paper background, ink-stamp emerald accents, hand-drawn warmth.
const ATELIER = {
  // Surfaces — cream-sage paper
  bg: '#E8EFDD',
  bgWarm: '#F0F5E6',
  surface: '#E8F0DE',
  card: '#F6FAEC',
  cardHi: '#FBFDF2',
  cardLo: '#DCE5CE',

  // Lines / borders
  line: '#C5D3B0',
  lineHi: '#DDE8C9',

  // Type
  fg: '#14241B',
  fg2: '#3A5244',
  fg3: '#6D8578',
  fg4: '#9AAA9B',

  // Accent — ink emerald
  accent: '#1B7A55',
  accentDeep: '#0E4D34',
  accentSoft: 'rgba(27,122,85,0.12)',
  accentGlow: 'rgba(27,122,85,0.24)',
  onAccent: '#F3F8EC',
} as const;

export const colors = {
  ...PALETTE,
  // Override greens with the atelier emerald
  primary: ATELIER.accent,
  secondary: ATELIER.accentDeep,
  accent: ATELIER.accent,
  light: '#D8EBD8',

  // Surfaces
  background: ATELIER.bg,
  backgroundWarm: ATELIER.bgWarm,
  surface: ATELIER.surface,
  cardBackground: ATELIER.card,
  cardBackgroundHi: ATELIER.cardHi,
  cardBackgroundLo: ATELIER.cardLo,

  // Type
  text: ATELIER.fg,
  textSecondary: ATELIER.fg2,
  textMuted: ATELIER.fg3,
  textFaint: ATELIER.fg4,
  textLight: ATELIER.onAccent,

  // Borders / dividers
  border: ATELIER.line,
  borderHi: ATELIER.lineHi,

  // Inputs
  inputBackground: ATELIER.cardHi,

  // Tab bar
  tabBar: ATELIER.accent,
  tabBarInactive: ATELIER.fg3,

  // Misc
  shadow: '#1E3C28',
  ink: ATELIER.accentDeep,
  accentSoft: ATELIER.accentSoft,
  accentGlow: ATELIER.accentGlow,
  onAccent: ATELIER.onAccent,
  overlay: 'rgba(14, 36, 27, 0.55)',
  gradientStart: ATELIER.accentDeep,
  gradientEnd: ATELIER.accent,

  // Margin colour map (kept from shared, but warmed slightly)
  ...MARGIN_COLOR_MAP,
  marginGreen: '#2F8A63',
  marginOrange: '#D4A04A',
  marginRed: '#B85543',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  full: 999,
} as const;

// ─── Typography ───────────────────────────────────────────────
// We mix a sans body with an italic serif for editorial accents.
// Custom fonts aren't loaded, so we lean on platform serif + italics.
export const fonts = {
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string,
  serifBold: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string,
  // Caveat-like script — fallback to italic serif since we can't bundle Caveat.
  script: Platform.select({ ios: 'Snell Roundhand', android: 'cursive', default: 'cursive' }) as string,
} as const;

export const typography = {
  // Display (italic serif, used for big numbers + headlines)
  display: {
    fontFamily: fonts.serif,
    fontSize: 32,
    fontWeight: '400' as const,
    fontStyle: 'italic' as const,
    letterSpacing: -0.6,
  },
  displaySmall: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '400' as const,
    fontStyle: 'italic' as const,
    letterSpacing: -0.3,
  },
  number: {
    fontFamily: fonts.serif,
    fontWeight: '400' as const,
    fontVariant: ['tabular-nums'] as Array<'tabular-nums'>,
  },

  // Standard sans hierarchy
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodySmall: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  button: { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.3 },

  // Eyebrow — small ALL-CAPS section labels
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '700' as const,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },

  // Script — handwritten accents
  script: {
    fontFamily: fonts.script,
    fontSize: 18,
    fontStyle: Platform.OS === 'android' ? ('normal' as const) : ('italic' as const),
    fontWeight: '500' as const,
  },
};

export const shadows = {
  sm: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  // Hard "stamped paper" offset shadow for the artisanal vibe.
  paper: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 3,
  },
} as const;
