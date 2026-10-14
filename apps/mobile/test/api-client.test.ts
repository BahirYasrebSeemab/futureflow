import { createApi, type Api, type ApiDeps } from '@/lib/api/client';
import { errBody, jsonResponse, ledgerEvent, okBody, sampleToday } from './support/fakes';

const TOKEN = 'a'.repeat(43);
const PAIR_BODY = {
  code: 'x'.repeat(16),
  token: TOKEN,
  deviceName: 'Phone',
  utcOffsetMinutes: -240,
};

function setup(
  reply: (url: string, init: RequestInit) => Promise<Response>,
  token: string | null = TOKEN,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const deps: ApiDeps = {
    baseUrl: 'https://api.test',
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return reply(url, init);
    }) as unknown as typeof fetch,
    getToken: async () => token,
    timeoutMs: 50,
  };
  return { api: createApi(deps), calls };
}

const header = (call: { init: RequestInit } | undefined, name: string) =>
  (call?.init.headers as Record<string, string> | undefined)?.[name];

test('pair posts the request without a token and returns the device id', async () => {
  const deviceId = '01920000-0000-7000-8000-0000000000d1';
  const { api, calls } = setup(async () => jsonResponse(201, okBody({ deviceId })));

  expect(await api.pair(PAIR_BODY)).toEqual({ ok: true, data: { deviceId } });
  expect(calls[0]?.url).toBe('https://api.test/v1/device/pair');
  expect(calls[0]?.init.method).toBe('POST');
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual(PAIR_BODY);
  expect(header(calls[0], 'authorization')).toBeUndefined();
});

test('today sends the bearer token and returns the validated snapshot', async () => {
  const { api, calls } = setup(async () => jsonResponse(200, okBody(sampleToday())));
  expect(await api.today()).toEqual({ ok: true, data: sampleToday() });
  expect(header(calls[0], 'authorization')).toBe(`Bearer ${TOKEN}`);
});

test('pullLedger and pushEvents use the ledger routes', async () => {
  const { api, calls } = setup(async (url) =>
    url.includes('/events')
      ? jsonResponse(200, okBody({ added: [ledgerEvent(1).id], ignored: [], rejected: [] }))
      : jsonResponse(200, okBody({ events: [ledgerEvent(2)], next: 7 })),
  );
  expect((await api.pushEvents([ledgerEvent(1)])).ok).toBe(true);
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ events: [ledgerEvent(1)] });
  expect(await api.pullLedger(5, 500)).toEqual({
    ok: true,
    data: { events: [ledgerEvent(2)], next: 7 },
  });
  expect(calls[1]?.url).toBe('https://api.test/v1/ledger?since=5&limit=500');
});

test('a thrown fetch is a network failure', async () => {
  const { api } = setup(async () => {
    throw new TypeError('Network request failed');
  });
  expect(await api.today()).toEqual({ ok: false, error: { kind: 'network' } });
});

test('a request that never answers times out as a network failure', async () => {
  const { api } = setup(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
  expect(await api.today()).toEqual({ ok: false, error: { kind: 'network' } });
});

test('a body that never finishes arriving times out as a network failure', async () => {
  const { api } = setup(
    async (_url, init) =>
      ({
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      }) as unknown as Response,
  );
  expect(await api.today()).toEqual({ ok: false, error: { kind: 'network' } });
});

test('a 4xx envelope is rejected with its code and fixed message', async () => {
  const { api } = setup(async () =>
    jsonResponse(401, errBody('invalid_code', 'The setup code is wrong.')),
  );
  expect(await api.pair(PAIR_BODY)).toEqual({
    ok: false,
    error: {
      kind: 'rejected',
      status: 401,
      code: 'invalid_code',
      message: 'The setup code is wrong.',
    },
  });
});

test('a 5xx is a server failure, even when the body is not JSON', async () => {
  const { api } = setup(async () =>
    jsonResponse(503, errBody('pairing_disabled', 'Pairing is not configured on the server.')),
  );
  expect(await api.today()).toEqual({
    ok: false,
    error: {
      kind: 'server',
      status: 503,
      code: 'pairing_disabled',
      message: 'Pairing is not configured on the server.',
    },
  });
  const broken = setup(
    async () =>
      ({
        status: 502,
        json: async () => {
          throw new SyntaxError('html');
        },
      }) as unknown as Response,
  );
  expect(await broken.api.today()).toEqual({
    ok: false,
    error: { kind: 'server', status: 502, code: 'internal', message: 'The server had a problem.' },
  });
});

test('a 200 that breaks the contract is an invalid response, JSON or not', async () => {
  const { api } = setup(async () => jsonResponse(200, okBody({ day: 'nope' })));
  expect(await api.today()).toEqual({ ok: false, error: { kind: 'invalid_response' } });
  const html = setup(
    async () =>
      ({
        status: 200,
        json: async () => {
          throw new SyntaxError('html');
        },
      }) as unknown as Response,
  );
  expect(await html.api.today()).toEqual({ ok: false, error: { kind: 'invalid_response' } });
});

test('an authenticated call without a token is refused before the network', async () => {
  const { api, calls } = setup(async () => jsonResponse(200, okBody(sampleToday())), null);
  expect(await api.today()).toEqual({
    ok: false,
    error: {
      kind: 'rejected',
      status: 401,
      code: 'unauthorized',
      message: 'This phone is not paired.',
    },
  });
  expect(calls).toHaveLength(0);
});

const PAIRED_ID = '01920000-0000-7000-8000-0000000000d1';
const plan = sampleToday().plan!;
const record = { day: '2026-10-14', kind: 'bad' as const };
const away = {
  id: PAIRED_ID,
  from: '2026-10-15',
  to: '2026-10-16',
  place: 'Montreal',
  keptTaskIds: [],
};
const verdict = {
  day: '2026-10-14',
  taskId: 't1',
  outcome: 'pass' as const,
  confidence: 1,
  by: 'owner' as const,
  evidenceIds: [],
};

type Case = [string, (a: Api) => Promise<unknown>, string, string, unknown, unknown];
const cases: Case[] = [
  [
    'savePlan',
    (a) => a.savePlan('2026-10-15', plan.tasks),
    'PUT',
    '/v1/plans/2026-10-15',
    { tasks: plan.tasks },
    plan,
  ],
  [
    'proposePlan',
    (a) => a.proposePlan('2026-10-15'),
    'POST',
    '/v1/plans/2026-10-15/propose',
    undefined,
    { plan, source: 'template' },
  ],
  [
    'lockPlan',
    (a) => a.lockPlan('2026-10-15'),
    'POST',
    '/v1/plans/2026-10-15/lock',
    undefined,
    plan,
  ],
  [
    'declareBadDay',
    (a) => a.declareBadDay('2026-10-14'),
    'POST',
    '/v1/day-type',
    { day: '2026-10-14', kind: 'bad' },
    record,
  ],
  [
    'declareAway',
    (a) => a.declareAway(away),
    'POST',
    '/v1/away',
    away,
    { id: PAIRED_ID, days: [record] },
  ],
  [
    'sendAwayVerdict',
    (a) => a.sendAwayVerdict(PAIRED_ID, { day: '2026-10-15', verified: 'yes', distanceKm: 540 }),
    'POST',
    `/v1/away/${PAIRED_ID}/verdict`,
    { day: '2026-10-15', verified: 'yes', distanceKm: 540 },
    record,
  ],
  [
    'decideVerdict',
    (a) => a.decideVerdict('t1', { day: '2026-10-14', outcome: 'pass' }),
    'POST',
    '/v1/verdicts/t1',
    { day: '2026-10-14', outcome: 'pass' },
    verdict,
  ],
];

test.each(cases)('%s calls %s %s', async (_name, call, method, path, body, data) => {
  const { api, calls } = setup(async () => jsonResponse(200, okBody(data)));
  expect(await call(api)).toEqual({ ok: true, data });
  expect(calls[0]?.init.method).toBe(method);
  expect(calls[0]?.url).toBe(`https://api.test${path}`);
  const sent = calls[0]?.init.body;
  expect(sent === undefined ? undefined : JSON.parse(String(sent))).toEqual(body);
});

test('getPlan answers null for a day without a plan', async () => {
  const { api } = setup(async () => jsonResponse(404, errBody('not_found', 'Not found.')));
  expect(await api.getPlan('2026-10-15')).toEqual({ ok: true, data: null });
});

test('getPlan passes other failures through', async () => {
  const { api } = setup(async () => {
    throw new TypeError('offline');
  });
  expect(await api.getPlan('2026-10-15')).toEqual({ ok: false, error: { kind: 'network' } });
});

test('getPlan returns the plan, and getRoadmap may be empty', async () => {
  const withPlan = setup(async () => jsonResponse(200, okBody(plan)));
  expect(await withPlan.api.getPlan('2026-10-14')).toEqual({ ok: true, data: plan });
  expect(withPlan.calls[0]?.url).toBe('https://api.test/v1/plans/2026-10-14');
  const empty = setup(async () => jsonResponse(200, okBody(null)));
  expect(await empty.api.getRoadmap()).toEqual({ ok: true, data: null });
  expect(empty.calls[0]?.url).toBe('https://api.test/v1/onboarding/roadmap');
});
