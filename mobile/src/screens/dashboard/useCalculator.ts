import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateAlcoholTax, parseLocaleFloat } from '@margebar/shared';

interface AlcoholTaxRates {
  droitAccise: number;
  cotisationSecu: number;
}

export function useCalculator() {
  const [calcVisible, setCalcVisible] = useState(false);
  const [calcPriceHD, setCalcPriceHD] = useState('');
  const [calcContainer, setCalcContainer] = useState('70');
  const [calcDegree, setCalcDegree] = useState('');
  const ratesRef = useRef<AlcoholTaxRates>({ droitAccise: 0, cotisationSecu: 0 });
  const [droitAccise, setDroitAccise] = useState(0);
  const [cotisationSecu, setCotisationSecu] = useState(0);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem('margebar_alcohol_tax').then((val) => {
      if (!mounted || !val) return;
      try {
        const parsed = JSON.parse(val);
        const da = parsed.droitAccise || 0;
        const cs = parsed.cotisationSecu || 0;
        if (da !== ratesRef.current.droitAccise || cs !== ratesRef.current.cotisationSecu) {
          ratesRef.current = { droitAccise: da, cotisationSecu: cs };
          setDroitAccise(da);
          setCotisationSecu(cs);
        }
      } catch {
        // Ignore corrupted data
      }
    });
    return () => { mounted = false; };
  }, []);

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
