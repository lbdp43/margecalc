export function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',') + ' €';
}

export function formatPercent(value: number): string {
  return value.toFixed(1).replace('.', ',') + ' %';
}

export function formatCoefficient(value: number): string {
  return 'x' + value.toFixed(2).replace('.', ',');
}

export function formatVolumeCl(cl: number): string {
  if (cl >= 100) {
    const liters = cl / 100;
    return liters.toFixed(liters % 1 === 0 ? 0 : 1).replace('.', ',') + ' L';
  }
  return cl + ' cl';
}
