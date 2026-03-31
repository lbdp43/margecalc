export interface ContainerPreset {
  label: string;
  volumeCl: number;
}

export const CONTAINER_PRESETS: ContainerPreset[] = [
  { label: '33 cl', volumeCl: 33 },
  { label: '50 cl', volumeCl: 50 },
  { label: '70 cl', volumeCl: 70 },
  { label: '75 cl', volumeCl: 75 },
  { label: '1 L', volumeCl: 100 },
  { label: 'Magnum', volumeCl: 150 },
  { label: 'Jéroboam', volumeCl: 300 },
  { label: 'BIB 5L', volumeCl: 500 },
  { label: 'BIB 10L', volumeCl: 1000 },
  { label: 'Fût 20L', volumeCl: 2000 },
  { label: 'Fût 30L', volumeCl: 3000 },
];

export const DEFAULT_CONTAINER_VOLUME_CL = 70;
