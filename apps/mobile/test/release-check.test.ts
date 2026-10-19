import { releaseProblems } from '../release-check';

const URL = 'https://futureflow-api.example.workers.dev';

test('a production build with an https address and no test flags is fine', () => {
  expect(releaseProblems({ profile: 'production', apiUrl: URL, e2e: false })).toEqual([]);
});

test('a production build needs an https server address', () => {
  expect(releaseProblems({ profile: 'production', apiUrl: undefined, e2e: false })).toEqual([
    'EXPO_PUBLIC_API_URL must be the https address of the deployed API',
  ]);
  expect(
    releaseProblems({ profile: 'production', apiUrl: 'http://10.0.2.2:8787', e2e: false }),
  ).toHaveLength(1);
});

test('a production build never carries the emulator flags', () => {
  expect(releaseProblems({ profile: 'production', apiUrl: URL, e2e: true })).toEqual([
    'E2E must not be set for a production build',
  ]);
});

test('other builds (preview, local, the emulator run) are not checked', () => {
  expect(
    releaseProblems({ profile: undefined, apiUrl: 'http://10.0.2.2:8787', e2e: true }),
  ).toEqual([]);
  expect(releaseProblems({ profile: 'preview', apiUrl: undefined, e2e: false })).toEqual([]);
});
