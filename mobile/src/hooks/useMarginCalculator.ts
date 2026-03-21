import { useMemo } from 'react';
import { calculateMargin, MarginInput, MarginResult } from '@margebar/shared';

export function useMarginCalculator(input: Partial<MarginInput>): MarginResult | null {
  return useMemo(() => {
    const { purchasePriceHT, containerVolumeCl, doseVolumeCl, marginMode, tvaRate } = input;

    if (
      purchasePriceHT === undefined || purchasePriceHT < 0 ||
      !containerVolumeCl || containerVolumeCl <= 0 ||
      !doseVolumeCl || doseVolumeCl <= 0 ||
      !marginMode ||
      tvaRate === undefined
    ) {
      return null;
    }

    try {
      return calculateMargin(input as MarginInput);
    } catch {
      return null;
    }
  }, [
    input.purchasePriceHT,
    input.containerVolumeCl,
    input.doseVolumeCl,
    input.marginMode,
    input.sellingPriceTTC,
    input.targetMarginPercent,
    input.coefficient,
    input.tvaRate,
  ]);
}
