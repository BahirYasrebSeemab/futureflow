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
    utcOffsetMinutes: () => 0,
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

const EVENING = Date.UTC(2026, 9, 14, 21); // 21:00, after the grace period

test('home sends no in the evening', async () => {
  const { deps, sent } = await setup(NEAR, EVENING);
  await saveHome(deps.secrets, TORONTO);
  await deps.store.saveAwayWindow(WINDOW);
  await checkAway(deps, awayToday);
  expect(sent).toEqual([
    { id: WINDOW.id, body: { day: '2026-10-14', verified: 'no', distanceKm: 0 } },
  ]);
});

test('refused permission sends unknown in the evening, once per hour', async () => {
  const { deps, sent } = await setup(null, EVENING);
  await deps.store.saveAwayWindow(WINDOW);
  await checkAway(deps, awayToday);
  await checkAway(deps, awayToday);
  expect(sent).toEqual([{ id: WINDOW.id, body: { day: '2026-10-14', verified: 'unknown' } }]);
  await checkAway({ ...deps, now: () => EVENING + 3_600_000 }, awayToday);
  expect(sent).toHaveLength(2);
});

test('nothing is checked on a normal day or without a saved window', async () => {
  const { deps, sent } = await setup(MONTREAL);
  expect(await checkAway(deps, sampleToday())).toBe('skipped');
  expect(await checkAway(deps, awayToday)).toBe('skipped');
  expect(sent).toEqual([]);
});

test('a failed send is retried next time', async () => {
  const { deps } = await setup(MONTREAL, Date.UTC(2026, 9, 14, 21));
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

test('a snapshot from another day sends nothing (the trip may have ended)', async () => {
  const { deps, sent } = await setup(TORONTO);
  await saveHome(deps.secrets, TORONTO);
  await deps.store.saveAwayWindow({ ...WINDOW, from: '2026-10-12', to: '2026-10-13' });
  const yesterday = sampleToday({
    day: '2026-10-13',
    dayRecord: {
      day: '2026-10-13',
      kind: 'away',
      away: { place: 'Montreal', keptTaskIds: [], verified: 'yes' },
    },
  });
  expect(await checkAway(deps, yesterday)).toBe('skipped');
  expect(sent).toEqual([]);
});

test('the day follows the 04:00 boundary in local time', async () => {
  const early = Date.UTC(2026, 9, 15, 3); // 03:00 on the 15th is still the 14th's day
  const { deps, sent } = await setup(MONTREAL, early);
  await saveHome(deps.secrets, TORONTO);
  await deps.store.saveAwayWindow(WINDOW);
  expect(await checkAway(deps, awayToday)).toBe('sent');
  expect(sent).toHaveLength(1);
});

test('a day already confirmed away is not measured again', async () => {
  const { deps, sent } = await setup(TORONTO);
  await saveHome(deps.secrets, TORONTO);
  await deps.store.saveAwayWindow(WINDOW);
  const confirmed = sampleToday({
    dayRecord: {
      day: '2026-10-14',
      kind: 'away',
      away: { place: 'Montreal', keptTaskIds: [], verified: 'yes' },
    },
  });
  expect(await checkAway(deps, confirmed)).toBe('skipped');
  expect(sent).toEqual([]);
});

describe('grace period: before 20:00 only being away counts', () => {
  const MORNING = Date.UTC(2026, 9, 14, 9);

  test('at home in the morning sends nothing, but the check is remembered', async () => {
    const { deps, sent } = await setup(NEAR, MORNING);
    await saveHome(deps.secrets, TORONTO);
    await deps.store.saveAwayWindow(WINDOW);
    expect(await checkAway(deps, awayToday)).toBe('skipped');
    expect(sent).toEqual([]);
    expect(await deps.store.lastAwayCheck('2026-10-14')).toBe(MORNING);
  });

  test('no location fix in the morning sends nothing', async () => {
    const { deps, sent } = await setup(null, MORNING);
    await deps.store.saveAwayWindow(WINDOW);
    expect(await checkAway(deps, awayToday)).toBe('skipped');
    expect(sent).toEqual([]);
  });

  test('away in the morning is sent at once', async () => {
    const { deps, sent } = await setup(MONTREAL, MORNING);
    await saveHome(deps.secrets, TORONTO);
    await deps.store.saveAwayWindow(WINDOW);
    expect(await checkAway(deps, awayToday)).toBe('sent');
    expect(sent).toEqual([
      { id: WINDOW.id, body: { day: '2026-10-14', verified: 'yes', distanceKm: 500 } },
    ]);
  });

  test('at home at 20:00 sends no', async () => {
    const { deps, sent } = await setup(NEAR, Date.UTC(2026, 9, 14, 20));
    await saveHome(deps.secrets, TORONTO);
    await deps.store.saveAwayWindow(WINDOW);
    await checkAway(deps, awayToday);
    expect(sent).toEqual([
      { id: WINDOW.id, body: { day: '2026-10-14', verified: 'no', distanceKm: 0 } },
    ]);
  });

  test('03:00 still belongs to the same day, after its grace period', async () => {
    const { deps, sent } = await setup(NEAR, Date.UTC(2026, 9, 15, 3));
    await saveHome(deps.secrets, TORONTO);
    await deps.store.saveAwayWindow(WINDOW);
    await checkAway(deps, awayToday);
    expect(sent).toEqual([
      { id: WINDOW.id, body: { day: '2026-10-14', verified: 'no', distanceKm: 0 } },
    ]);
  });

  test('the grace period follows local time', async () => {
    // 22:00 UTC is 18:00 in Toronto (UTC-4): still inside the grace period.
    const { deps, sent } = await setup(NEAR, Date.UTC(2026, 9, 14, 22));
    await saveHome(deps.secrets, TORONTO);
    await deps.store.saveAwayWindow(WINDOW);
    await checkAway({ ...deps, utcOffsetMinutes: () => -240 }, awayToday);
    expect(sent).toEqual([]);
  });
});
