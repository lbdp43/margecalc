/**
 * FiscalCategorySheet (graft 7): the fiscal category picker shared by the
 * duties calculator, the product form and the landing teaser.
 *
 *   <FiscalCategorySheet visible={open} value={slug}
 *     onSelect={(rate) => setSlug(rate.slug)} onClose={() => setOpen(false)} />
 *
 * - Rates come from the rates store (official barème, refreshed from the API;
 *   DEFAULT_RATES offline), or from `rates`.
 * - Grouped under caps headers (Spiritueux & liqueurs · Bières · Vins, cidres &
 *   produits intermédiaires); each row shows its description on 2 lines and
 *   its official rate (« 1 932,42 €/hl AP »).
 * - Search over label + description. Selecting pops the radio, waits 120 ms,
 *   then calls onSelect and onClose.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { DEFAULT_RATES, Rate } from '@margebar/shared';
import { useRatesStore } from '../../store/rates.store';
import { useSystemParamsStore } from '../../store/systemParams.store';
import { formatRate } from '../../utils/format';
import { BottomSheet } from './BottomSheet';
import { EmptyState } from './EmptyState';
import { ListRow, SectionHeader } from './ListRow';

export const FISCAL_GROUPS: { key: string; title: string; calcType: string; order: string[] }[] = [
  { key: 'spirits', title: 'Spiritueux & liqueurs', calcType: 'C', order: ['spiritueux', 'rhum_dom', 'rhum_hors_dom', 'liqueur'] },
  { key: 'beers', title: 'Bières', calcType: 'B', order: ['biere', 'petite_brasserie', 'biere_legere'] },
  {
    key: 'wines',
    title: 'Vins, cidres & produits intermédiaires',
    calcType: 'A',
    order: ['vin_tranquille', 'vin_mousseux', 'cidre_poire', 'prod_interm_vdl_vdn', 'prod_interm_autre', 'boisson_fermentee'],
  },
];

const UNIT_LABELS: Record<string, string> = {
  'euro/hl': 'hl',
  'euro/hl_degree': 'hl/degré',
  'euro/hlap': 'hl AP',
};

/** « 1 932,42 €/hl AP » for a rate's excise. */
export function fiscalRateLabel(rate: Pick<Rate, 'acciseRate' | 'acciseUnit'>): string {
  return formatRate(rate.acciseRate, UNIT_LABELS[rate.acciseUnit] ?? rate.acciseUnit.replace(/^euro\//, ''));
}

/** Rates grouped and ordered for the picker (unknown slugs go last in their group). */
export function groupFiscalRates(rates: Rate[]): { title: string; key: string; rates: Rate[] }[] {
  return FISCAL_GROUPS.map((g) => {
    const rank = (r: Rate) => {
      const i = g.order.indexOf(r.slug);
      return i === -1 ? 100 + r.sortOrder : i;
    };
    return { title: g.title, key: g.key, rates: rates.filter((r) => r.calcType === g.calcType).sort((a, b) => rank(a) - rank(b)) };
  }).filter((g) => g.rates.length > 0);
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export interface FiscalCategorySheetProps {
  visible: boolean;
  /** Selected rate slug. */
  value?: string | null;
  onSelect: (rate: Rate) => void;
  onClose: () => void;
  /** Override the rates (default: rates store). */
  rates?: Rate[];
  title?: string;
  testID?: string;
}

export function FiscalCategorySheet({ visible, value, onSelect, onClose, rates: ratesProp, title = 'Catégorie fiscale', testID = 'fiscal-category-sheet' }: FiscalCategorySheetProps) {
  const storeRates = useRatesStore((s) => s.rates);
  const year = useSystemParamsStore((s) => s.params.find((p) => p.key === 'tarif_annee')?.value || '2026');
  const rates = ratesProp ?? (storeRates?.length ? storeRates : DEFAULT_RATES);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null | undefined>(value);

  useEffect(() => {
    if (visible) {
      setPicked(value);
      setQuery('');
    }
  }, [visible, value]);

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    const filtered = q ? rates.filter((r) => normalize(`${r.label} ${r.examples ?? ''}`).includes(q)) : rates;
    return groupFiscalRates(filtered);
  }, [rates, query]);

  const choose = (rate: Rate) => {
    setPicked(rate.slug);
    setTimeout(() => {
      onSelect(rate);
      onClose();
    }, 120);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subline={`${rates.length} catégories · barème des douanes ${year}`}
      search={{ value: query, onChangeText: setQuery, placeholder: 'Porto, IPA, Lillet, cidre…' }}
      contentPadding={8}
      testID={testID}
    >
      {groups.map((g, gi) => (
        <View key={g.key}>
          <SectionHeader variant="caps" title={g.title} style={{ paddingHorizontal: 12, marginTop: gi === 0 ? 0 : 12 }} />
          {g.rates.map((r, i) => {
            const next = g.rates[i + 1];
            return (
              <ListRow
                key={r.slug}
                title={r.label}
                subtitle={r.examples ?? undefined}
                detail={fiscalRateLabel(r)}
                right="radio"
                selected={picked === r.slug}
                divider={!!next && picked !== r.slug && picked !== next.slug}
                onPress={() => choose(r)}
                testID={`fiscal-${r.slug}`}
              />
            );
          })}
        </View>
      ))}
      {groups.length === 0 ? <EmptyState variant="noResults" query={query} surface="surface" /> : null}
    </BottomSheet>
  );
}
