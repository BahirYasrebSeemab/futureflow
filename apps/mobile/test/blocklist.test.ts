import {
  changeBlocklist,
  DEFAULT_BLOCKLIST,
  effectiveBlocklist,
  type BlocklistState,
} from '@/lib/guard/blocklist';
import { BLOCKED_APPS } from '@/lib/guard/types';

const TODAY = '2026-10-18';
const start: BlocklistState = { current: { apps: ['a', 'b'], games: true }, pending: null };

test('the default blocks the known social apps and games', () => {
  expect(DEFAULT_BLOCKLIST).toEqual({
    apps: [...new Set(BLOCKED_APPS.map(([pkg]) => pkg))],
    games: true,
  });
});

test('blocking another app applies at once', () => {
  expect(changeBlocklist(start, { apps: ['a', 'b', 'c'], games: true }, TODAY)).toEqual({
    current: { apps: ['a', 'b', 'c'], games: true },
    pending: null,
  });
});

test('unblocking an app waits for the next day', () => {
  expect(changeBlocklist(start, { apps: ['a'], games: true }, TODAY)).toEqual({
    current: { apps: ['a', 'b'], games: true },
    pending: { apps: ['a'], games: true, from: '2026-10-19' },
  });
});

test('turning games off waits; turning them on does not', () => {
  const off = changeBlocklist(start, { apps: ['a', 'b'], games: false }, TODAY);
  expect(off.current.games).toBe(true);
  expect(off.pending).toEqual({ apps: ['a', 'b'], games: false, from: '2026-10-19' });
  const noGames: BlocklistState = { current: { apps: ['a'], games: false }, pending: null };
  expect(changeBlocklist(noGames, { apps: ['a'], games: true }, TODAY).current.games).toBe(true);
});

test('a mixed change blocks the new app now and unblocks the old one tomorrow', () => {
  expect(changeBlocklist(start, { apps: ['a', 'c'], games: true }, TODAY)).toEqual({
    current: { apps: ['a', 'b', 'c'], games: true },
    pending: { apps: ['a', 'c'], games: true, from: '2026-10-19' },
  });
});

test('blocking an app again cancels its pending unblock', () => {
  const waiting = changeBlocklist(start, { apps: ['a'], games: true }, TODAY);
  expect(changeBlocklist(waiting, { apps: ['a', 'b'], games: true }, TODAY)).toEqual(start);
});

test('a pending change applies from its day, not before', () => {
  const waiting = changeBlocklist(start, { apps: ['a'], games: true }, TODAY);
  expect(effectiveBlocklist(waiting, TODAY)).toBe(waiting);
  expect(effectiveBlocklist(waiting, '2026-10-19')).toEqual({
    current: { apps: ['a'], games: true },
    pending: null,
  });
  expect(effectiveBlocklist(waiting, '2026-10-25').pending).toBeNull();
});

test('a change made days after a pending one applied starts from what applies now', () => {
  const waiting = changeBlocklist(start, { apps: ['a'], games: true }, TODAY);
  expect(changeBlocklist(waiting, { apps: [], games: true }, '2026-10-20')).toEqual({
    current: { apps: ['a'], games: true },
    pending: { apps: [], games: true, from: '2026-10-21' },
  });
});
