import type { EventContext, LedgerEvent } from '../src/ledger';

let counter = 0;

export function ev(
  over: Partial<LedgerEvent> & Pick<LedgerEvent, 'kind' | 'seconds'>,
): LedgerEvent {
  counter += 1;
  return { id: `e-${counter}`, day: '2026-10-08', at: 0, ...over };
}

export function idGen(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

export function ctx(over: Partial<EventContext> = {}): EventContext {
  return { day: '2026-10-08', at: 1_000, newId: idGen('new'), ...over };
}
