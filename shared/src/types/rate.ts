export type CalcType = 'A' | 'B' | 'C';

export interface Rate {
  id: string;
  slug: string;
  label: string;
  examples: string | null;
  calcType: CalcType;
  acciseRate: number;
  acciseUnit: string;
  cotisationRate: number;
  cotisationUnit: string | null;
  cotisationCond: string | null; // ">18" or null
  sortOrder: number;
  updatedAt: string;
}

export interface DroitsResult {
  accise: number;
  cotisationSS: number;
  totalDroits: number;
  prixHTAvecDroits: number;
  prixTTC: number;
  prixAuLitreHT: number;
}
