import type { LedgerEvent } from '@mflow/core';

/** Repository ports. Routes depend on these; `adapters/d1` implements them. */

export type Device = Readonly<{ id: string; name: string; utcOffsetMinutes: number }>;

export interface DeviceRepo {
  /** Creates the device and marks the setup code used, atomically. False if the code was used. */
  pair(codeHash: string, device: Device, tokenHash: string, at: number): Promise<boolean>;
  /** A device that is not revoked, or null. */
  findByTokenHash(tokenHash: string): Promise<Device | null>;
  setUtcOffset(deviceId: string, minutes: number): Promise<void>;
}

export interface LedgerRepo {
  /** Stored events that share an id or a business key (`semanticKey`) with the candidates. */
  findMatching(ids: readonly string[], keys: readonly string[]): Promise<LedgerEvent[]>;
  /** Inserts in order, skipping ids or business keys already stored; returns the ids written. */
  insert(
    events: readonly LedgerEvent[],
    deviceId: string | null,
    receivedAt: number,
  ): Promise<string[]>;
  /** Events after the cursor `since`, in server order; `next` is the cursor to send next time. */
  page(since: number, limit: number): Promise<{ events: LedgerEvent[]; next: number }>;
}

export type Repos = Readonly<{ devices: DeviceRepo; ledger: LedgerRepo }>;
