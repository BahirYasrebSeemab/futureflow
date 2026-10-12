import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Every failure the API can answer with. Messages are fixed text: they never echo input. */
export const ERRORS = {
  invalid_request: [400, 'The request is invalid.'],
  unauthorized: [401, 'Missing or invalid device token.'],
  invalid_code: [401, 'The setup code is wrong.'],
  not_found: [404, 'Not found.'],
  code_used: [409, 'This setup code was already used.'],
  plan_locked: [409, 'The plan is locked and cannot change.'],
  already_declared: [409, 'This day already has a day type.'],
  verdict_not_pending: [409, 'Only a pending verdict can be decided by hand.'],
  bad_day_limit_reached: [409, "This week's bad day is already used."],
  payload_too_large: [413, 'The request body is too large.'],
  duplicate_task_id: [422, 'Two tasks share an id.'],
  too_few_tasks: [422, 'The plan needs more tasks before it can lock.'],
  too_many_tasks: [422, 'The plan has too many tasks to lock.'],
  day_out_of_range: [422, 'That day cannot be changed now.'],
  github_token_invalid: [
    422,
    'GitHub rejected the token. Create a new fine-grained, read-only token.',
  ],
  github_repo_unavailable: [422, 'One of the repositories cannot be read with this token.'],
  plan_not_locked: [422, 'Lock the plan first.'],
  nothing_to_plan: [422, 'No skill is active on that day. Set up the roadmap first.'],
  rate_limited: [429, 'Too many requests. Try again in a minute.'],
  internal: [500, 'Something went wrong on the server.'],
  github_unavailable: [502, 'GitHub is not answering right now. Try again later.'],
  pairing_disabled: [503, 'Pairing is not configured on the server.'],
  github_key_missing: [503, 'GitHub linking is not configured on the server.'],
} as const satisfies Record<string, readonly [ContentfulStatusCode, string]>;

export type ErrorCode = keyof typeof ERRORS;

export const ok = <T>(c: Context, data: T, status: ContentfulStatusCode = 200) =>
  c.json({ ok: true, data, error: null }, status);

export const fail = (c: Context, code: ErrorCode, message: string = ERRORS[code][1]) =>
  c.json({ ok: false, data: null, error: { code, message } }, ERRORS[code][0]);
