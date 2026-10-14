import {
  envelope,
  LedgerPageSchema,
  LedgerSyncResultSchema,
  PairResponseSchema,
  type PairRequestSchema,
  TodaySchema,
} from '@futureflow/contracts';
import type { LedgerEvent } from '@futureflow/core';
import type { z } from 'zod';

export type Today = z.infer<typeof TodaySchema>;
export type PairRequest = z.infer<typeof PairRequestSchema>;
export type LedgerSyncResult = z.infer<typeof LedgerSyncResultSchema>;
export type LedgerPage = z.infer<typeof LedgerPageSchema>;

/** Why a call failed, in the terms the caller acts on: retry later, give up on this request, or update the app. */
export type ApiFailure =
  | { kind: 'network' }
  | { kind: 'server'; status: number; code: string; message: string }
  | { kind: 'rejected'; status: number; code: string; message: string }
  | { kind: 'invalid_response' };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export type ApiDeps = Readonly<{
  baseUrl: string;
  fetch: typeof fetch;
  getToken: () => Promise<string | null>;
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 15_000;
const NETWORK: ApiResult<never> = { ok: false, error: { kind: 'network' } };
const NOT_PAIRED: ApiResult<never> = {
  ok: false,
  error: {
    kind: 'rejected',
    status: 401,
    code: 'unauthorized',
    message: 'This phone is not paired.',
  },
};

/** An answer we can't read: a server error on 5xx, otherwise an app/server version mismatch. */
const unreadable = (status: number): ApiResult<never> =>
  status >= 500
    ? {
        ok: false,
        error: { kind: 'server', status, code: 'internal', message: 'The server had a problem.' },
      }
    : { ok: false, error: { kind: 'invalid_response' } };

/** The parsed envelope, spelled out: zod can't narrow its union through the generic `S`. */
type Envelope<T> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: { code: string; message: string } };

type Call = { method: 'GET' | 'POST'; path: string; body?: unknown; auth?: boolean };

async function request<S extends z.ZodType>(
  deps: ApiDeps,
  schema: S,
  call: Call,
): Promise<ApiResult<z.infer<S>>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (call.auth !== false) {
    const token = await deps.getToken();
    if (token === null) return NOT_PAIRED;
    headers.authorization = `Bearer ${token}`;
  }
  if (call.body !== undefined) headers['content-type'] = 'application/json';

  // The timeout covers the whole exchange, including reading the body.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await deps.fetch(`${deps.baseUrl}${call.path}`, {
        method: call.method,
        headers,
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
        signal: controller.signal,
      });
    } catch {
      return NETWORK;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return controller.signal.aborted ? NETWORK : unreadable(response.status);
    }
    return readEnvelope(response.status, body, schema);
  } finally {
    clearTimeout(timer);
  }
}

function readEnvelope<S extends z.ZodType>(
  status: number,
  body: unknown,
  schema: S,
): ApiResult<z.infer<S>> {
  const parsed = envelope(schema).safeParse(body);
  if (!parsed.success) return unreadable(status);
  const answer = parsed.data as Envelope<z.infer<S>>;
  if (answer.ok) return { ok: true, data: answer.data };
  const { code, message } = answer.error;
  return {
    ok: false,
    error: { kind: status >= 500 ? 'server' : 'rejected', status, code, message },
  };
}

export function createApi(deps: ApiDeps) {
  return {
    pair: (body: PairRequest) =>
      request(deps, PairResponseSchema, {
        method: 'POST',
        path: '/v1/device/pair',
        body,
        auth: false,
      }),
    today: () => request(deps, TodaySchema, { method: 'GET', path: '/v1/today' }),
    pushEvents: (events: readonly LedgerEvent[]) =>
      request(deps, LedgerSyncResultSchema, {
        method: 'POST',
        path: '/v1/ledger/events',
        body: { events },
      }),
    pullLedger: (since: number, limit: number) =>
      request(deps, LedgerPageSchema, {
        method: 'GET',
        path: `/v1/ledger?since=${since}&limit=${limit}`,
      }),
  };
}

export type Api = ReturnType<typeof createApi>;
