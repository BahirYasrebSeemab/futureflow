import { awayVerdict, checkAway, distanceKm, readHome, saveHome } from '@/lib/away';
import type { Coords } from '@/lib/location';
import { memorySecrets, NOW, sampleToday, testServices } from './support/fakes';

const TORONTO = { lat: 43.6532, lon: -79.3832 };
const MONTREAL = { lat: 45.5019, lon: -73.5674 };
const NEAR = { lat: 43.66, lon: -79.39 }; // about 1 km from TORONTO

test('distanceKm is the great-circle distance', () => {
  expect(Math.round(distanceKm(TORONTO, MONTREAL))).toBe(504);
  expect(distanceKm(TORONTO, TORONTO)).toBe(0);
});

test('far from home is yes, home sends no, and missing data is unknown', () => {
  expect(awayVerdict(TORONTO, MONTREAL)).toEqual({ verified: 'yes', distanceKm: 500 });
  expect(awayVerdict(TORONTO, NEAR)).toEqual({ verified: 'no', distanceKm: 0 });
  expect(awayVerdict(null, MONTREAL)).toEqual({ verified: 'unknown' });
  expect(awayVerdict(TORONTO, null)).toEqual({ verified: 'unknown' });
});

test('the distance is capped at 20000 km', () => {
  expect(awayVerdict({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }).distanceKm).toBe(20000);
});

test('the home location round-trips and bad data reads as none', async () => {
  const secrets = memorySecrets();
  expect(await readHome(secrets)).toBeNull();
  await saveHome(secrets, TORONTO);
  expect(await readHome(secrets)).toEqual(TORONTO);
  await secrets.set('home_location', 'not json');
  expect(await readHome(secrets)).toBeNull();
  await secrets.set('home_location', '{"lat":"x"}');
  expect(await readHome(secrets)).toBeNull();
});

const WINDOW = { id: '01920000-0000-7000-8000-0000000000e1', from: '2026-10-14', to: '2026-10-15' };
const awayToday = sampleToday({
  dayRecord: {
    day: '2026-10-14',
    kind: 'away',
    away: { place: 'Montreal', keptTaskIds: [], verified: 'pending' },
  },
});

async function setup(here: Coords | null, now = NOW) {
  const services = await testServices();
  const sent: unknown[] = [];
  const deps = {
    api: {
      sendAwayVerdict: async (id: string, body: unknown) => {
        sent.push({ id, body });
        return { ok: true as const, data: { day: '2026-10-14', kind: 'away' as const } };
      },
    },
    store: services.store,
    secrets: services.secrets,
    locator: { coarse: async () => here },
    now: () => now,
  };
  return { deps, sent };
}

test('the request carries no coordinates, only the rounded distance', async () => {
  const { deps, sent } = await setup(MONTREAL);
  await saveHome(deps.secrets, TORONTO);
  await deps.store.saveAwayWindow(WINDOW);
  expect(await checkAway(deps, awayToday)).toBe('sent');
  expect(sent).toEqual([
    { id: WINDOW.id, body: { day: '2026-10-14', verified: 'yes', distanceKm: 500 } },
  ]);
  expect(JSON.stringify(sent)).not.toMatch(/45\.5|73\.5|43\.6|79\.3/);
});

test('home sends no', async () => {
  const { deps, sent } = await setup(NEAR);
  await saveHome(deps.secrets, TORONTO);
  await deps.store.saveAwayWindow(WINDOW);
  await checkAway(deps, awayToday);
  expect(sent).toEqual([
    { id: WINDOW.id, body: { day: '2026-10-14', verified: 'no', distanceKm: 0 } },
  ]);
});

test('refused permission sends unknown, once per hour', async () => {
  const { deps, sent } = await setup(null);
  await deps.store.saveAwayWindow(WINDOW);
  await checkAway(deps, awayToday);
  await checkAway(deps, awayToday);
  expect(sent).toEqual([{ id: WINDOW.id, body: { day: '2026-10-14', verified: 'unknown' } }]);
  await checkAway({ ...deps, now: () => NOW + 3_600_000 }, awayToday);
  expect(sent).toHaveLength(2);
});

test('nothing is checked on a normal day or without a saved window', async () => {
  const { deps, sent } = await setup(MONTREAL);
  expect(await checkAway(deps, sampleToday())).toBe('skipped');
  expect(await checkAway(deps, awayToday)).toBe('skipped');
  expect(sent).toEqual([]);
});

test('a failed send is retried next time', async () => {
  const { deps } = await setup(MONTREAL);
  await deps.store.saveAwayWindow(WINDOW);
  const failing = {
    ...deps,
    api: {
      sendAwayVerdict: async () => ({ ok: false as const, error: { kind: 'network' as const } }),
    },
  };
  expect(await checkAway(failing, awayToday)).toBe('skipped');
  expect(await deps.store.lastAwayCheck('2026-10-14')).toBeNull();
});
