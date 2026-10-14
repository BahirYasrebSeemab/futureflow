import { balance, mergeEvents, type LedgerEvent } from '@futureflow/core';

/** The balance the phone believes right now: what the server confirmed plus what is still unsent. */
export const projectBalance = (
  confirmed: readonly LedgerEvent[],
  pending: readonly LedgerEvent[],
): number => balance(mergeEvents(confirmed, pending).events);
