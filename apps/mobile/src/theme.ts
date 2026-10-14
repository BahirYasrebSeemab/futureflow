import { useColorScheme } from 'react-native';

const light = {
  background: '#F7F6F2',
  surface: '#FFFFFF',
  text: '#1B1B1F',
  muted: '#5E5E66',
  border: '#E3E1DA',
  accent: '#2F5BEA',
  accentText: '#FFFFFF',
  warningBg: '#FFF4D6',
  warningText: '#5C4300',
  dangerBg: '#FCE8E6',
  dangerText: '#8C1D18',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#111114',
  surface: '#1C1C21',
  text: '#F2F1EE',
  muted: '#A3A3AD',
  border: '#2C2C33',
  accent: '#8FA8FF',
  accentText: '#0B1026',
  warningBg: '#3A2F0B',
  warningText: '#FFE08A',
  dangerBg: '#41100D',
  dangerText: '#FFB4AB',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { md: 12, lg: 20 } as const;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
