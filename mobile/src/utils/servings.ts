/**
 * How a product's own dose is named (no service type): one rule for the
 * product card, the quick price sheet and the product detail, so the same
 * price never has two names.
 *
 *   soldWhole(33, 33)   → true   (a can, a bottle sold as is)
 *   doseLabel(33, 33)   → « À l’unité »
 *   doseLabel(70, 4)    → « Dose 4 cl »
 */
import { formatVolumeCl, NBSP } from './format';

/** True when one dose is the whole container (a can, a bottle sold as is). */
export const soldWhole = (containerCl: number, doseCl: number) => containerCl > 0 && doseCl > 0 && doseCl >= containerCl;

/** « À l’unité » for a product sold whole, otherwise « Dose 25 cl ». */
export function doseLabel(containerCl: number, doseCl: number): string {
  return soldWhole(containerCl, doseCl) ? 'À l’unité' : `Dose${NBSP}${formatVolumeCl(doseCl)}`;
}
