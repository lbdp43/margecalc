import { useState, useMemo, useCallback } from 'react';
import { calculateAlcoholTax, parseLocaleFloat } from '@margebar/shared';
import { useSystemParamsStore } from '../../store/systemParams.store';

export function useCalculator() {
  const [calcVisible, setCalcVisible] = useState(false);
  const [calcPriceHD, setCalcPriceHD] = useState('');
  const [calcContainer, setCalcContainer] = useState('70');
  const [calcDegree, setCalcDegree] = useState('');
  const droitAccise = useSystemParamsStore((s) => {
    const p = s.params.find((x) => x.key === 'droit_accise');
    return p ? parseFloat(p.value) || 0 : 0;
  });
  const cotisationSecu = useSystemParamsStore((s) => {
    const p = s.params.find((x) => x.key === 'cotisation_secu');
    return p ? parseFloat(p.value) || 0 : 0;
  });

  const calcTax = useMemo(() => {
    const price = parseLocaleFloat(calcPriceHD) || 0;
    const vol = parseLocaleFloat(calcContainer) || 0;
    const deg = parseLocaleFloat(calcDegree) || 0;
    const tax = calculateAlcoholTax(vol, deg, droitAccise, cotisationSecu);
    return { price, tax, total: price + tax };
  }, [calcPriceHD, calcContainer, calcDegree, droitAccise, cotisationSecu]);

  const openCalc = useCallback(() => {
    setCalcPriceHD('');
    setCalcContainer('70');
    setCalcDegree('');
    setCalcVisible(true);
  }, []);

  const closeCalc = useCallback(() => {
    setCalcVisible(false);
  }, []);

  return {
    calcVisible,
    calcPriceHD,
    setCalcPriceHD,
    calcContainer,
    setCalcContainer,
    calcDegree,
    setCalcDegree,
    calcTax,
    openCalc,
    closeCalc,
  };
}
