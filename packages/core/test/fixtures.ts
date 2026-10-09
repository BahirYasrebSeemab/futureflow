import type { EventContext, LedgerEvent } from '../src/ledger';
import type { TaskSpec } from '../src/plan';

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

export function task(id: string, skillId = 'swe'): TaskSpec {
  return {
    id,
    skillId,
    when: '20:00 at my desk',
    verifier: 'github',
    full: { title: `Task ${id}`, criteria: 'commits that finish it', seconds: 1200 },
    twoMinute: { title: `Tiny ${id}`, criteria: 'one commit', seconds: 300 },
  };
}
