import { describe, expect, it } from 'vitest';
import { CoachMessageRequestSchema, CoachQuerySchema } from '../src';

describe('coach contracts', () => {
  const id = '01920000-0000-7000-8000-000000000001';

  it('accepts a message and trims it', () => {
    expect(CoachMessageRequestSchema.parse({ id, text: '  hi  ' })).toEqual({ id, text: 'hi' });
  });

  it.each([
    ['blank text', { id, text: '   ' }],
    ['text over 2000 characters', { id, text: 'x'.repeat(2001) }],
    ['no client id', { text: 'hi' }],
  ])('rejects %s', (_label, value) => {
    expect(CoachMessageRequestSchema.safeParse(value).success).toBe(false);
  });

  it('pages at most 100 messages', () => {
    expect(CoachQuerySchema.parse({})).toEqual({ since: 0, limit: 50 });
    expect(CoachQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
