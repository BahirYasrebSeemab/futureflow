import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';
import { useColorScheme, type TextStyle } from 'react-native';

/** Brand blue from the app icon; the hero card and primary buttons use it. */
export const LIGHT = {
  background: '#F5F6FB',
  surface: '#FFFFFF',
  text: '#1A1D29',
  muted: '#5F6577',
  border: '#E3E6EF',
  accent: '#3657E8',
  /** The darker lip under a raised button. */
  accentEdge: '#2440C2',
  accentText: '#FFFFFF',
  accentSoft: '#E8EDFF',
  accentSoftText: '#2440C2',
  // White text on the success face needs 4.5:1, so light mode uses a deeper green.
  success: '#15803D',
  successEdge: '#0F6630',
  successSoft: '#E2F6EB',
  successText: '#0F6B3E',
  gold: '#B86E00',
  goldSoft: '#FFF3D6',
  danger: '#E5484D',
  warningBg: '#FFF4D6',
  warningText: '#5C4300',
  dangerBg: '#FCE8E6',
  dangerText: '#8C1D18',
  heroBg: '#2747C9',
  heroText: '#FFFFFF',
  heroMuted: 'rgba(255,255,255,0.8)',
  heroTrack: 'rgba(255,255,255,0.24)',
  /** Behind the hero's small text: darker than the card, so white text stays readable. */
  heroChip: 'rgba(8,16,64,0.3)',
  track: '#E3E6EF',
  /** A text field's edge must stand out from the page (3:1). */
  fieldBorder: '#8E95A8',
};

export type Palette = typeof LIGHT;

export const DARK: Palette = {
  background: '#0F1220',
  surface: '#191D30',
  text: '#EEF0F7',
  muted: '#A0A6BA',
  border: '#292E46',
  accent: '#7C93FF',
  accentEdge: '#5A72E6',
  accentText: '#0B1026',
  accentSoft: '#232B50',
  accentSoftText: '#B4C2FF',
  success: '#3DD68C',
  successEdge: '#25B26E',
  successSoft: '#132F21',
  successText: '#7BE7AF',
  gold: '#F5B83D',
  goldSoft: '#33280F',
  danger: '#FF6B6B',
  warningBg: '#3A2F0B',
  warningText: '#FFE08A',
  dangerBg: '#41100D',
  dangerText: '#FFB4AB',
  heroBg: '#2A3A99',
  heroText: '#FFFFFF',
  heroMuted: 'rgba(255,255,255,0.78)',
  heroTrack: 'rgba(255,255,255,0.2)',
  heroChip: 'rgba(4,8,32,0.35)',
  track: '#292E46',
  fieldBorder: '#646B88',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 20, xl: 28, full: 999 } as const;

/** Named text styles; colours are applied by the caller from the palette. */
export const type = {
  display: { fontSize: 48, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  heading: { fontSize: 20, fontWeight: '700' },
  headline: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23 },
  subhead: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  caption: { fontSize: 13, lineHeight: 18 },
} as const satisfies Record<string, TextStyle>;

export const shadow = {
  card: '0 1px 2px rgba(16, 24, 64, 0.06)',
  raised: '0 6px 16px rgba(16, 24, 64, 0.12)',
} as const;

/** Durations in ms: press feedback, element transitions, bars filling. */
export const motion = { fast: 120, base: 240, slow: 600 } as const;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

/** The navigation theme (stack headers, tab bar, screen background) drawn from the palette. */
export function navTheme(p: Palette, dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark,
    colors: {
      ...base.colors,
      primary: p.accent,
      background: p.background,
      card: p.background,
      text: p.text,
      border: p.border,
      notification: p.danger,
    },
  };
}
