import * as Location from 'expo-location';

export type Coords = Readonly<{ lat: number; lon: number }>;

/** Coarse location only; null when permission is refused or no fix arrives in time. */
export interface Locator {
  coarse(): Promise<Coords | null>;
}

const FIX_TIMEOUT_MS = 15_000;

export const expoLocator: Locator = {
  async coarse() {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS));
    const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }).catch(
      () => null,
    );
    const position =
      (await Promise.race([fix, timeout])) ?? (await Location.getLastKnownPositionAsync());
    return position === null
      ? null
      : { lat: position.coords.latitude, lon: position.coords.longitude };
  },
};
