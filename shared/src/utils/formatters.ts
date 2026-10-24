/**
 * Parse a number string that may use comma as decimal separator (French locale)
 * "10,50" → 10.5, "10.50" → 10.5, "10" → 10
 */
export function parseLocaleFloat(value: string): number {
  if (!value || typeof value !== 'string') return NaN;
  const normalized = value.replace(',', '.');
  return parseFloat(normalized);
}

export function formatPrice(value: number): string {
  if (!isFinite(value)) return '-\u00A0€';
  return value.toFixed(2).replace('.', ',') + '\u00A0€';
}

export function formatPercent(value: number): string {
  if (!isFinite(value)) return '-\u00A0%';
  return value.toFixed(1).replace('.', ',') + '\u00A0%';
}

export function formatCoefficient(value: number): string {
  if (!isFinite(value)) return '×-';
  return '×' + value.toFixed(2).replace('.', ',');
}

export function formatVolumeCl(cl: number): string {
  if (!isFinite(cl)) return '-\u00A0cl';
  if (cl >= 100) {
    const liters = cl / 100;
    return liters.toFixed(liters % 1 === 0 ? 0 : 1).replace('.', ',') + '\u00A0L';
  }
  return String(cl).replace('.', ',') + '\u00A0cl';
}
