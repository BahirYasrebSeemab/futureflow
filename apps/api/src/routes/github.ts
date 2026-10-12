import { GithubLinkRequestSchema } from '@mflow/contracts';
import { Hono } from 'hono';
import { importSecretKey, seal } from '../crypto/secret-box';
import type { AppEnv } from '../env';
import { githubClient, type GithubError } from '../github/client';
import { fail, ok, type ErrorCode } from '../http/envelope';
import { valid } from '../http/validate';

/** A new link looks one day back, so today's earlier commits still count. */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

const linkError = (error: GithubError): ErrorCode =>
  error === 'unauthorized'
    ? 'github_token_invalid'
    : error === 'not_found' || error === 'forbidden'
      ? 'github_repo_unavailable'
      : 'github_unavailable';

export const githubRoutes = new Hono<AppEnv>()
  .get('/github/link', async (c) => {
    const link = await c.var.deps.repos.verification.link();
    return link === null
      ? fail(c, 'not_found')
      : ok(c, { login: link.login, repos: link.repos, status: link.status });
  })
  .put('/github/link', valid('json', GithubLinkRequestSchema), async (c) => {
    const { deps } = c.var;
    const body = c.req.valid('json');
    const key = await importSecretKey(deps.settings.githubTokenKey);
    if (key === null) return fail(c, 'github_key_missing');

    const client = githubClient(body.token, deps.fetch);
    const user = await client.user();
    if (!user.ok) return fail(c, linkError(user.error));
    for (const repo of body.repos) {
      const checked = await client.repo(repo);
      if (!checked.ok) return fail(c, linkError(checked.error));
    }

    const now = deps.now();
    await deps.repos.verification.saveLink(
      {
        login: user.value.login,
        tokenSealed: await seal(key, body.token),
        repos: body.repos,
        status: 'ok',
      },
      now,
      new Date(now - LOOKBACK_MS).toISOString(),
    );
    return ok(c, { login: user.value.login, repos: body.repos, status: 'ok' as const });
  })
  .delete('/github/link', async (c) => {
    await c.var.deps.repos.verification.deleteLink();
    return ok(c, { deleted: true });
  });
