import { mergeEvents, semanticKey, type LedgerEvent } from '@mflow/core';
import type { LedgerRepo } from '../ports';

/**
 * Appends events with core's merge rules (same id or same business key = already there; a
 * repayment of a dropped reward is dropped too). The unique columns in D1 make a concurrent
 * duplicate a no-op. Returns the ids actually written.
 */
export async function appendEvents(
  repo: LedgerRepo,
  incoming: readonly LedgerEvent[],
  deviceId: string | null,
  receivedAt: number,
): Promise<string[]> {
  if (incoming.length === 0) return [];
  const keys = incoming.map(semanticKey).filter((k): k is string => k !== null);
  const existing = await repo.findMatching(
    incoming.map((e) => e.id),
    keys,
  );
  const { added } = mergeEvents(existing, incoming);
  return repo.insert(added, deviceId, receivedAt);
}
