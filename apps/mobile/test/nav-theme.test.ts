import { DARK, LIGHT, navTheme } from '@/theme';

test('the dark navigation theme takes its header, screen and text colours from the dark palette', () => {
  const theme = navTheme(DARK, true);
  expect(theme.dark).toBe(true);
  expect(theme.colors.card).toBe(DARK.background);
  expect(theme.colors.background).toBe(DARK.background);
  expect(theme.colors.text).toBe(DARK.text);
  expect(theme.colors.primary).toBe(DARK.accent);
});

test('the light navigation theme follows the light palette', () => {
  const theme = navTheme(LIGHT, false);
  expect(theme.dark).toBe(false);
  expect(theme.colors.card).toBe(LIGHT.background);
  expect(theme.colors.border).toBe(LIGHT.border);
});
