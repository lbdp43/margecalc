/**
 * Réglages — the settings tab root.
 *
 *   Mon établissement · Objectifs de marge · Services & contenants ·
 *   Catégories · Taxes & droits · Aide & retours · (Administration) ·
 *   À propos · Compte
 *
 * Each group lives in ./parts (one component per section, each owning its
 * sheets and data). This file only composes them and wires pull-to-refresh.
 */
import React, { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { LargeTitleHeader, Screen } from '../../components/ui';
import { useAuthStore } from '../../store/auth.store';
import { useRatesStore } from '../../store/rates.store';
import { useSystemParamsStore } from '../../store/systemParams.store';
import { EstablishmentSection } from './parts/EstablishmentSection';
import { MarginTargetsSection } from './parts/MarginTargetsSection';
import { ServicesSection } from './parts/ServicesSection';
import { CategoriesSection } from './parts/CategoriesSection';
import { TaxesSection } from './parts/TaxesSection';
import { HelpSection } from './parts/HelpSection';
import { AdminSection } from './parts/AdminSection';
import { AboutSection } from './parts/AboutSection';
import { AccountSection } from './parts/AccountSection';
import { SETTINGS_KEYS } from './parts/data';

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [refreshing, setRefreshing] = useState(false);

  // Coming back to Réglages: refresh the unread replies badge and the barème
  // (cheap, cached for 6 h unless it changed).
  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.unread] });
      useRatesStore.getState().loadRates();
      useSystemParamsStore.getState().loadParams();
    }, [qc]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.servingTypes] }),
        qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.containers] }),
        qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.categories] }),
        qc.invalidateQueries({ queryKey: ['tickets'] }),
        qc.invalidateQueries({ queryKey: [...SETTINGS_KEYS.me] }),
        isAdmin ? qc.invalidateQueries({ queryKey: ['admin'] }) : Promise.resolve(),
        useRatesStore.getState().loadRates(true),
        useSystemParamsStore.getState().loadParams(true),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc, isAdmin]);

  let i = 0;
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="settings-screen">
      <LargeTitleHeader title="Réglages" />
      <EstablishmentSection index={i++} />
      <MarginTargetsSection index={i++} />
      <ServicesSection index={i++} />
      <CategoriesSection index={i++} />
      <TaxesSection index={i++} isAdmin={isAdmin} />
      <HelpSection index={i++} />
      {isAdmin ? <AdminSection index={i++} navigation={navigation} /> : null}
      <AboutSection index={i++} />
      <AccountSection index={i++} />
    </Screen>
  );
}
