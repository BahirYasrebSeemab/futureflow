import {
  type AwayRequestSchema,
  CoachMessageSchema,
  CoachPageSchema,
  type GithubLinkRequestSchema,
  GithubLinkSchema,
  type ReadingLogSchema,
  BankProblemSchema,
  type AwayVerdictRequestSchema,
  DayRecordSchema,
  envelope,
  LedgerPageSchema,
  LedgerSyncResultSchema,
  type MathAttempt,
  PairResponseSchema,
  type PairRequestSchema,
  PlanSchema,
  ProposeResponseSchema,
  RoadmapSchema,
  TodaySchema,
  VerdictSchema,
} from '@futureflow/contracts';
import type { LedgerEvent, TaskSpec } from '@futureflow/core';
import { z } from 'zod';

export type Today = z.infer<typeof TodaySchema>;
export type PairRequest = z.infer<typeof PairRequestSchema>;
export type LedgerSyncResult = z.infer<typeof LedgerSyncResultSchema>;
export type LedgerPage = z.infer<typeof LedgerPageSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type DayRecord = z.infer<typeof DayRecordSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;
export type ProposeResult = z.infer<typeof ProposeResponseSchema>;
export type AwayRequest = z.input<typeof AwayRequestSchema>;
export type AwayVerdictRequest = z.input<typeof AwayVerdictRequestSchema>;

export type CoachMessage = z.infer<typeof CoachMessageSchema>;
export type GithubLink = z.infer<typeof GithubLinkSchema>;
export type ReadingLog = z.input<typeof ReadingLogSchema>;
export type GithubLinkRequest = z.input<typeof GithubLinkRequestSchema>;

const ReadingSavedSchema = z.object({ id: z.string(), created: z.boolean() });
const CoachExchangeSchema = z.object({ message: CoachMessageSchema, reply: CoachMessageSchema });
const DeletedSchema = z.object({ deleted: z.boolean() });

const BankPageSchema = z.object({
  problems: z.array(BankProblemSchema),
  next: z.number().int().nonnegative(),
});
export type BankPage = z.infer<typeof BankPageSchema>;

const AwayResponseSchema = z.object({ id: z.uuid(), days: z.array(DayRecordSchema) });

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

type Call = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  auth?: boolean;
};

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
    /** A day without a plan is not an error here: it answers null. */
    getPlan: async (day: string): Promise<ApiResult<Plan | null>> => {
      const result = await request(deps, PlanSchema, { method: 'GET', path: `/v1/plans/${day}` });
      const missing =
        !result.ok && result.error.kind === 'rejected' && result.error.code === 'not_found';
      return missing ? { ok: true, data: null } : result;
    },
    savePlan: (day: string, tasks: readonly TaskSpec[]) =>
      request(deps, PlanSchema, { method: 'PUT', path: `/v1/plans/${day}`, body: { tasks } }),
    proposePlan: (day: string) =>
      request(deps, ProposeResponseSchema, { method: 'POST', path: `/v1/plans/${day}/propose` }),
    lockPlan: (day: string) =>
      request(deps, PlanSchema, { method: 'POST', path: `/v1/plans/${day}/lock` }),
    declareBadDay: (day: string) =>
      request(deps, DayRecordSchema, {
        method: 'POST',
        path: '/v1/day-type',
        body: { day, kind: 'bad' },
      }),
    declareAway: (body: AwayRequest) =>
      request(deps, AwayResponseSchema, { method: 'POST', path: '/v1/away', body }),
    sendAwayVerdict: (id: string, body: AwayVerdictRequest) =>
      request(deps, DayRecordSchema, {
        method: 'POST',
        path: `/v1/away/${id}/verdict`,
        body,
      }),
    decideVerdict: (taskId: string, body: { day: string; outcome: 'pass' | 'fail' }) =>
      request(deps, VerdictSchema, { method: 'POST', path: `/v1/verdicts/${taskId}`, body }),
    /** Same answer shape as the ledger push: added, ignored and (future-dated) rejected ids. */
    pushMathAttempts: (attempts: readonly MathAttempt[]) =>
      request(deps, LedgerSyncResultSchema, {
        method: 'POST',
        path: '/v1/math/attempts',
        body: { attempts },
      }),
    /** Accepted word problems after the cursor (the server never sends pending ones). */
    getBank: (since: number, limit = 50) =>
      request(deps, BankPageSchema, {
        method: 'GET',
        path: `/v1/math/bank?since=${since}&limit=${limit}`,
      }),
    sendReading: (log: ReadingLog) =>
      request(deps, ReadingSavedSchema, { method: 'POST', path: '/v1/reading', body: log }),
    coachMessages: (since: number, limit = 50) =>
      request(deps, CoachPageSchema, {
        method: 'GET',
        path: `/v1/coach/messages?since=${since}&limit=${limit}`,
      }),
    sendCoachMessage: (body: { id: string; text: string }) =>
      request(deps, CoachExchangeSchema, { method: 'POST', path: '/v1/coach/messages', body }),
    saveRoadmap: (roadmap: Roadmap) =>
      request(deps, RoadmapSchema, {
        method: 'PUT',
        path: '/v1/onboarding/roadmap',
        body: roadmap,
      }),
    /** Nothing linked is not an error here: it answers null. */
    getGithubLink: async (): Promise<ApiResult<GithubLink | null>> => {
      const result = await request(deps, GithubLinkSchema, {
        method: 'GET',
        path: '/v1/github/link',
      });
      const missing =
        !result.ok && result.error.kind === 'rejected' && result.error.code === 'not_found';
      return missing ? { ok: true, data: null } : result;
    },
    /** The token goes only here: the phone never stores it. */
    linkGithub: (body: GithubLinkRequest) =>
      request(deps, GithubLinkSchema, { method: 'PUT', path: '/v1/github/link', body }),
    unlinkGithub: () => request(deps, DeletedSchema, { method: 'DELETE', path: '/v1/github/link' }),
    getRoadmap: () =>
      request(deps, RoadmapSchema.nullable(), { method: 'GET', path: '/v1/onboarding/roadmap' }),
  };
}

export type Api = ReturnType<typeof createApi>;
