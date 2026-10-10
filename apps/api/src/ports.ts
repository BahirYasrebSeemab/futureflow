/** Repository ports. Routes depend on these; `adapters/d1` implements them. */

export type Device = Readonly<{ id: string; name: string; utcOffsetMinutes: number }>;

export interface DeviceRepo {
  /** Creates the device and marks the setup code used, atomically. False if the code was used. */
  pair(codeHash: string, device: Device, tokenHash: string, at: number): Promise<boolean>;
  /** A device that is not revoked, or null. */
  findByTokenHash(tokenHash: string): Promise<Device | null>;
  setUtcOffset(deviceId: string, minutes: number): Promise<void>;
}

export type Repos = Readonly<{ devices: DeviceRepo }>;
