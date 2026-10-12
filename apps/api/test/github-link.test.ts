import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { call, makeApp, pairDevice, T0, type App } from './helpers';
import { githubFake } from './github-fake';

const TOKEN = 'github_pat_' + 'x'.repeat(40);

async function linked(
  fake = githubFake(),
  body: object = { token: TOKEN, repos: ['bahir/mflow'] },
) {
  const app: App = makeApp(undefined, { fetch: fake.fetch });
  const { token } = await pairDevice(app);
  const reply = await call<{ login: string; repos: string[]; status: string }>(
    app,
    'PUT',
    '/v1/github/link',
    {
      token,
      body,
    },
  );
  return { app, token, reply, fake };
}

describe('GitHub link', () => {
  it('checks the token and repositories, seals the token and starts cursors a day back', async () => {
    const { app, token, reply } = await linked();

    expect(reply.body.data).toEqual({
      login: 'bahir',
      repos: ['bahir/mflow'],
      status: 'ok',
      unreadableRepos: [],
    });
    const row = await env.DB.prepare('SELECT token_sealed FROM github_link').first<{
      token_sealed: string;
    }>();
    expect(row?.token_sealed.startsWith('v1.')).toBe(true);
    expect(row?.token_sealed).not.toContain(TOKEN);
    const cursor = await env.DB.prepare('SELECT since FROM github_cursor').first<{
      since: string;
    }>();
    expect(cursor?.since).toBe(new Date(T0 - 86_400_000).toISOString());
    const got = await call(app, 'GET', '/v1/github/link', { token });
    expect(got.body.data).toEqual({
      login: 'bahir',
      repos: ['bahir/mflow'],
      status: 'ok',
      unreadableRepos: [],
    });
    expect(JSON.stringify(got.body)).not.toContain(TOKEN);
  });

  it('refuses a token GitHub rejects, storing nothing', async () => {
    const { reply } = await linked(
      githubFake({ status: (url) => (url.endsWith('/user') ? 401 : undefined) }),
    );
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'github_token_invalid']);
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM github_link').first<{ n: number }>(),
    ).toEqual({ n: 0 });
  });

  it('refuses a repository the token cannot read', async () => {
    const { reply } = await linked(githubFake(), {
      token: TOKEN,
      repos: ['bahir/mflow', 'bahir/secret'],
    });
    expect([reply.status, reply.body.error?.code]).toEqual([422, 'github_repo_unavailable']);
  });

  it('answers 502 when GitHub is down', async () => {
    const { reply } = await linked(githubFake({ status: () => 503 }));
    expect([reply.status, reply.body.error?.code]).toEqual([502, 'github_unavailable']);
  });

  it('is disabled without the sealing key', async () => {
    const fake = githubFake();
    const app = makeApp(undefined, { fetch: fake.fetch });
    const { token } = await pairDevice(app);
    const reply = await call(app, 'PUT', '/v1/github/link', {
      token,
      body: { token: TOKEN, repos: ['bahir/mflow'] },
      env: { GITHUB_TOKEN_KEY: undefined },
    });
    expect([reply.status, reply.body.error?.code]).toEqual([503, 'github_key_missing']);
    expect(fake.urls).toEqual([]);
  });

  it('unlinks', async () => {
    const { app, token } = await linked();
    expect((await call(app, 'DELETE', '/v1/github/link', { token })).body.data).toEqual({
      deleted: true,
    });
    expect((await call(app, 'GET', '/v1/github/link', { token })).status).toBe(404);
  });
});
