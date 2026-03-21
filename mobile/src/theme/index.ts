import { PALETTE, MARGIN_COLOR_MAP } from '@margebar/shared';

export const colors = {
  ...PALETTE,
  background: '#F0F4F3',
  cardBackground: PALETTE.white,
  text: '#1A2E28',
  textSecondary: '#5A7A6E',
  textLight: PALETTE.white,
  border: '#DDE8E4',
  inputBackground: '#F5F8F7',
  tabBar: PALETTE.primary,
  tabBarInactive: '#95A8A0',
  shadow: '#0D261E',
  gradientStart: '#1B4332',
  gradientEnd: '#2D6A4F',
  surface: '#E8F0ED',
  ...MARGIN_COLOR_MAP,
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
  lg: 20,
  xl: 28,
  xxl: 36,
  full: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodySmall: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  button: { fontSize: 16, fontWeight: '700' as const, letterSpacing: 0.3 },
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
} as const;
