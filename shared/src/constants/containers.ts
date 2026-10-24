export interface ContainerPreset {
  label: string;
  volumeCl: number;
}

export const CONTAINER_PRESETS: ContainerPreset[] = [
  { label: '2 cl', volumeCl: 2 },
  { label: '4 cl', volumeCl: 4 },
  { label: '5 cl', volumeCl: 5 },
  { label: '12,5 cl', volumeCl: 12.5 },
  { label: '20 cl', volumeCl: 20 },
  { label: '25 cl', volumeCl: 25 },
  { label: '33 cl', volumeCl: 33 },
  { label: '50 cl', volumeCl: 50 },
  { label: '70 cl', volumeCl: 70 },
  { label: '75 cl', volumeCl: 75 },
  { label: '1 L', volumeCl: 100 },
  { label: 'Magnum', volumeCl: 150 },
  { label: 'Jeroboam', volumeCl: 300 },
  { label: 'BIB 5L', volumeCl: 500 },
  { label: 'BIB 10L', volumeCl: 1000 },
  { label: 'Fut 20L', volumeCl: 2000 },
  { label: 'Fut 30L', volumeCl: 3000 },
];

export const DEFAULT_CONTAINER_VOLUME_CL = 70;
