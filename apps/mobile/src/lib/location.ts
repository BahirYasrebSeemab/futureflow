import * as Location from 'expo-location';

export type Coords = Readonly<{ lat: number; lon: number }>;

/** Coarse location only; null when permission is refused or no fix arrives in time. */
export interface Locator {
  coarse(): Promise<Coords | null>;
}

const FIX_TIMEOUT_MS = 15_000;
/** An older last-known fix may be from before the trip: it must never decide "at home". */
const LAST_KNOWN_MAX_AGE_MS = 3_600_000;

export const expoLocator: Locator = {
  async coarse() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return null;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), FIX_TIMEOUT_MS);
      });
      const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }).catch(
        () => null,
      );
      const position =
        (await Promise.race([fix, timeout])) ??
        (await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS }));
      return position === null
        ? null
        : { lat: position.coords.latitude, lon: position.coords.longitude };
    } catch {
      return null; // no location service: the day reads as unknown
    } finally {
      clearTimeout(timer);
    }
  },
};
