export const PALETTE = {
  primary: '#1B4332',
  secondary: '#2D6A4F',
  accent: '#40916C',
  light: '#D8F3DC',
  white: '#FFFFFF',
  gray: '#F5F5F5',
  grayMedium: '#9E9E9E',
  grayDark: '#333333',
  marginGreen: '#2D6A4F',
  marginOrange: '#E67E22',
  marginRed: '#C0392B',
} as const;

export const DEFAULT_MARGIN_THRESHOLDS = {
  good: 65,
  medium: 50,
} as const;

export function getMarginColor(
  marginPercent: number,
  thresholds = DEFAULT_MARGIN_THRESHOLDS
): 'green' | 'orange' | 'red' {
  if (marginPercent >= thresholds.good) return 'green';
  if (marginPercent >= thresholds.medium) return 'orange';
  return 'red';
}

export const MARGIN_COLOR_MAP = {
  green: PALETTE.marginGreen,
  orange: PALETTE.marginOrange,
  red: PALETTE.marginRed,
} as const;
