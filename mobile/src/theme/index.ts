import { PALETTE, MARGIN_COLOR_MAP } from '@margebar/shared';

export const colors = {
  ...PALETTE,
  background: '#F8F9FA',
  cardBackground: PALETTE.white,
  text: '#1A1A1A',
  textSecondary: '#666666',
  textLight: PALETTE.white,
  border: '#E0E0E0',
  inputBackground: '#F5F5F5',
  tabBar: PALETTE.primary,
  tabBarInactive: '#A0A0A0',
  ...MARGIN_COLOR_MAP,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '600' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodySmall: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  button: { fontSize: 16, fontWeight: '600' as const },
};
