import type { Api, Today } from './api/client';
import type { Coords, Locator } from './location';
import type { SecretStore } from './secrets';
import type { LocalStore } from './store/types';

/** Farther than this from home counts as away; nearer means the owner is home (spec §6.4, ADR 0012). */
export const AWAY_MIN_KM = 25;
export const HOME_KEY = 'home_location';
export const CHECK_EVERY_MS = 3_600_000;
const EARTH_KM = 6371;
const MAX_KM = 20_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle (haversine) distance. */
export function distanceKm(a: Coords, b: Coords): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type AwayVerdict = { verified: 'yes' | 'no' | 'unknown'; distanceKm?: number };

/** The only thing that leaves the phone: yes, no or unknown, and a distance rounded to 10 km. */
export function awayVerdict(home: Coords | null, here: Coords | null): AwayVerdict {
  if (home === null || here === null) return { verified: 'unknown' };
  const d = distanceKm(home, here);
  return {
    verified: d >= AWAY_MIN_KM ? 'yes' : 'no',
    distanceKm: Math.min(MAX_KM, Math.round(d / 10) * 10),
  };
}

export async function readHome(secrets: SecretStore): Promise<Coords | null> {
  const raw = await secrets.get(HOME_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof Coords, unknown>>;
    return typeof value.lat === 'number' && typeof value.lon === 'number'
      ? { lat: value.lat, lon: value.lon }
      : null;
  } catch {
    return null;
  }
}

export const saveHome = (secrets: SecretStore, coords: Coords): Promise<void> =>
  secrets.set(HOME_KEY, JSON.stringify({ lat: coords.lat, lon: coords.lon }));

export type AwayDeps = Readonly<{
  api: Pick<Api, 'sendAwayVerdict'>;
  store: LocalStore;
  secrets: SecretStore;
  locator: Locator;
  now: () => number;
}>;

/** At most hourly on an away day: measures on the device and sends only the verdict. */
export async function checkAway(deps: AwayDeps, today: Today): Promise<'sent' | 'skipped'> {
  if (today.dayRecord?.kind !== 'away') return 'skipped';
  const day = today.day;
  const window = (await deps.store.awayWindows()).find((w) => w.from <= day && day <= w.to);
  if (window === undefined) return 'skipped';
  const last = await deps.store.lastAwayCheck(day);
  if (last !== null && deps.now() - last < CHECK_EVERY_MS) return 'skipped';

  const verdict = awayVerdict(await readHome(deps.secrets), await deps.locator.coarse());
  const result = await deps.api.sendAwayVerdict(window.id, { day, ...verdict });
  if (!result.ok) return 'skipped';
  await deps.store.saveAwayCheck(day, deps.now());
  return 'sent';
}
