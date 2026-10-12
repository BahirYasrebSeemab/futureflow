import type { FetchLike } from '../src/types';

export type FakeResponse = Readonly<{ status: number; body: string }> | 'network_error';
export type Call = Readonly<{ url: string; headers: Record<string, string>; body: unknown }>;

export const jsonResponse = (status: number, body: unknown): FakeResponse => ({
  status,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

/** Answers each call with the next response (the last one repeats) and records every request. */
export function fakeFetch(responses: readonly FakeResponse[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      headers: { ...init.headers },
      body: init.body === undefined ? undefined : (JSON.parse(init.body) as unknown),
    });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next === undefined || next === 'network_error') throw new Error('network down');
    return { status: next.status, text: async () => next.body };
  };
  return { fetch, calls };
}
