import type { IconName } from './Icon';

/**
 * Service icons (spec §3.4): `flask-outline` for shots, `wine-outline` for
 * glasses, `beer-outline` for demis and pints. Resolved from the service name,
 * then its volume, so custom services get a sensible glyph too. This is THE
 * service-icon mapping: other screens should use it rather than their own.
 *
 *   servingIconName('Verre de vin', 12) → 'wine-outline'
 */
export function servingIconName(name?: string | null, volumeCl?: number | null): IconName {
  const n = (name ?? '').toLowerCase();
  if (/shot|shooter|dose|liqueur|digestif/.test(n)) return 'flask-outline';
  if (/demi|pinte|bi[eè]re|pression|galopin|chope|pichet/.test(n)) return 'beer-outline';
  if (/verre|vin|coupe|fl[uû]te|ballon|cocktail/.test(n)) return 'wine-outline';
  if (/canette|bouteille|soft|jus/.test(n)) return 'cafe-outline';
  const v = volumeCl ?? 0;
  if (v > 0 && v <= 4) return 'flask-outline';
  if (v >= 20) return 'beer-outline';
  return 'wine-outline';
}
