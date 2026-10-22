/**
 * Calculations saved from the duty calculator (« margebar_saved_calcs »):
 * picking one prefills the form with the price excluding duties, the fiscal
 * category, the container and the degree.
 */
import React from 'react';
import { BottomSheet, ListRow } from '../../../components/ui';
import { useRatesStore } from '../../../store/rates.store';
import { formatEuro, formatNumber, formatVolumeCl } from '../../../utils/format';

export interface SavedCalc {
  id: string;
  name: string;
  fiscalCategory: string;
  prixHTHorsDroit: number;
  volumeCl: number;
  degree: number;
  prixHTAvecDroits: number;
  prixTTC: number;
}

export const SAVED_CALCS_KEY = 'margebar_saved_calcs';

export function parseSavedCalcs(raw: string | null): SavedCalc[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((c) => c && typeof c.name === 'string' && c.volumeCl > 0) : [];
  } catch {
    return [];
  }
}

export function SavedCalcsSheet({
  visible,
  calcs,
  onPick,
  onClose,
}: {
  visible: boolean;
  calcs: SavedCalc[];
  onPick: (c: SavedCalc) => void;
  onClose: () => void;
}) {
  const rates = useRatesStore((s) => s.rates);
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Depuis le calculateur"
      subline={`${calcs.length} calcul${calcs.length > 1 ? 's' : ''} · prix hors droits`}
      contentPadding={8}
    >
      {calcs.map((c, i) => {
        const rate = rates.find((r) => r.slug === c.fiscalCategory);
        const meta = [rate?.label ?? c.fiscalCategory, formatVolumeCl(c.volumeCl), c.degree ? `${formatNumber(c.degree, Number.isInteger(c.degree) ? 0 : 1)}°` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <ListRow
            key={c.id ?? i}
            icon="calculator-outline"
            title={c.name}
            subtitle={meta}
            detail={`${formatEuro(c.prixHTAvecDroits)} HT avec droits`}
            onPress={() => {
              onPick(c);
              setTimeout(onClose, 120);
            }}
            divider={i < calcs.length - 1}
          />
        );
      })}
    </BottomSheet>
  );
}
