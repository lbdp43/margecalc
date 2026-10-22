/**
 * Legacy entry point of the duties calculator, kept for the screens that
 * still embed it (LandingScreen, SubscriptionScreen) and for the
 * `SaveProductData` type (ProductFormScreen). It renders the D1 calculator
 * (screens/dashboard/parts/DutyCalculator) built from the kit.
 * New code: navigate to the « Calculateur de droits » screen with
 * `openDutyCalculator(navigation)` instead of embedding this.
 */
import React from 'react';
import { DutyCalculator } from '../../screens/dashboard/parts/DutyCalculator';

export interface SaveProductData {
  name: string;
  fiscalCategory: string;
  prixHTHorsDroit: number;
  volumeCl: number;
  degree: number;
  prixHTAvecDroits: number;
  prixTTC: number;
}

interface DroitsCalculatorProps {
  /** Kept for compatibility (the result is always shown in full). */
  compact?: boolean;
  onSaveProduct?: (data: SaveProductData) => void;
  /** Container chips bleed to the screen edges (default true, for a 20 px gutter). */
  bleed?: boolean;
}

export function DroitsCalculator({ onSaveProduct, bleed = true }: DroitsCalculatorProps) {
  return (
    <DutyCalculator
      bleed={bleed}
      onSaveLegacy={
        onSaveProduct
          ? (d) =>
              onSaveProduct({
                name: d.rate.label,
                fiscalCategory: d.rate.slug,
                prixHTHorsDroit: d.price,
                volumeCl: d.volumeCl,
                degree: d.degree,
                prixHTAvecDroits: d.result.prixHTAvecDroits,
                prixTTC: d.result.prixTTC,
              })
          : undefined
      }
    />
  );
}
