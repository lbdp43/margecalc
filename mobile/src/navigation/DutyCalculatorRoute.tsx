/**
 * « Calculateur de droits » as a pushed screen of the Tableau de bord stack
 * (the tab bar stays visible, spec §3.11). Also reachable logged-out from the
 * landing (AuthNavigator). For now it hosts the existing DroitsCalculator; the
 * dashboard/calculator screen agent replaces the content.
 */
import React from 'react';
import { DroitsCalculator } from '../components/ui/DroitsCalculator';
import { Badge, NavBar, Screen } from '../components/ui';
import { useSystemParamsStore } from '../store/systemParams.store';

export function DutyCalculatorRoute() {
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  return (
    <Screen header={<NavBar title="Calculateur de droits" trailing={<Badge variant="brand" icon="shield-checkmark" label={`Tarifs ${year}`} />} />}>
      <DroitsCalculator />
    </Screen>
  );
}
