import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from '../src/result';

describe('Result', () => {
  it('ok wraps a value', () => {
    const r: Result<number, 'nope'> = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it('err wraps an error code', () => {
    const r: Result<number, 'nope'> = err('nope');
    expect(r).toEqual({ ok: false, error: 'nope' });
  });
});
