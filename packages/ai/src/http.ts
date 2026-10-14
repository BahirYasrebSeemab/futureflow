import { err, ok, type Result } from '@futureflow/core';
import type { FetchLike, ProviderError } from './types';

/** POST a JSON body and parse a JSON reply. Never throws: failures become `ProviderError`s. */
export async function postJson(
  fetch: FetchLike,
  url: string,
  headers: Readonly<Record<string, string>>,
  body: unknown,
): Promise<Result<unknown, ProviderError>> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    return err('unavailable');
  }
  if (res.status === 401 || res.status === 403) return err('unauthorized');
  if (res.status === 429) return err('rate_limited');
  if (res.status < 200 || res.status >= 300) return err('unavailable');
  try {
    return ok(JSON.parse(await res.text()) as unknown);
  } catch {
    return err('invalid_output');
  }
}
