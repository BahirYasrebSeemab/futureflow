import { describe, expect, it } from 'vitest';
import { GithubLinkRequestSchema, TodaySchema, VerdictSchema } from '../src';

describe('GithubLinkRequestSchema', () => {
  const token = 'github_pat_' + 'x'.repeat(40);

  it('accepts owner/name repositories', () => {
    expect(
      GithubLinkRequestSchema.safeParse({ token, repos: ['bahir/mflow', 'a.b/c-d_e'] }).success,
    ).toBe(true);
  });

  it.each([
    ['a short token', { token: 'short', repos: ['a/b'] }],
    ['no repository', { token, repos: [] }],
    ['a repository without an owner', { token, repos: ['mflow'] }],
    ['a URL instead of a name', { token, repos: ['https://github.com/a/b'] }],
    ['a repeated repository', { token, repos: ['a/b', 'a/b'] }],
  ])('rejects %s', (_label, value) => {
    expect(GithubLinkRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe('VerdictSchema and TodaySchema', () => {
  const verdict = {
    day: '2026-10-09',
    taskId: '01920000-0000-7000-8000-000000000001',
    outcome: 'pending',
    confidence: 0.9,
    by: 'judge',
    evidenceIds: ['7fd1a60'],
    suggestion: 'pass',
  };

  it('round-trips a pending verdict with a suggestion inside today', () => {
    expect(VerdictSchema.parse(verdict)).toEqual(verdict);
    const today = {
      day: '2026-10-09',
      serverTime: 1,
      plan: null,
      dayRecord: null,
      balanceSeconds: 0,
      earnedTodaySeconds: 0,
      verdicts: [verdict],
    };
    expect(TodaySchema.parse(today)).toEqual(today);
  });
});
