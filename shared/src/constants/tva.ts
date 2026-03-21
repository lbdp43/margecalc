import { TVA_RATES } from '../types/product';

export const TVA_OPTIONS = [
  { label: '20%', value: TVA_RATES.RATE_20 },
  { label: '10%', value: TVA_RATES.RATE_10 },
  { label: '5,5%', value: TVA_RATES.RATE_5_5 },
] as const;

export const DOSE_PRESETS = [3, 4, 5, 6, 8, 12, 14, 25] as const;
