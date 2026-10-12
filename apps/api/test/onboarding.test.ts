import { env } from 'cloudflare:test';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { call, makeApp, pairDevice, sampleRoadmap } from './helpers';

describe('onboarding roadmap', () => {
  it('starts empty, then stores and returns the roadmap in order', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const empty = await call(app, 'GET', '/v1/onboarding/roadmap', { token });
    const roadmap = sampleRoadmap();

    const put = await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: roadmap });
    const got = await call(app, 'GET', '/v1/onboarding/roadmap', { token });

    expect(empty.body.data).toEqual({ identities: [], skills: [], milestones: [] });
    expect(put.body.data).toEqual(roadmap);
    expect(got.body.data).toEqual(roadmap);
  });

  it('replaces the whole roadmap: nothing of the old one remains', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
    const next = sampleRoadmap();

    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: next });

    expect((await call(app, 'GET', '/v1/onboarding/roadmap', { token })).body.data).toEqual(next);
    const skills = await env.DB.prepare('SELECT count(*) AS n FROM skills').first<{ n: number }>();
    expect(skills?.n).toBe(2);
  });

  it('rejects an inconsistent roadmap and keeps the stored one', async () => {
    const app = makeApp();
    const { token } = await pairDevice(app);
    const stored = sampleRoadmap();
    await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: stored });
    const broken = sampleRoadmap();
    const skill = broken.skills[0];
    if (skill !== undefined) skill.identityId = uuidv7();

    const reply = await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: broken });

    expect(reply.status).toBe(400);
    expect((await call(app, 'GET', '/v1/onboarding/roadmap', { token })).body.data).toEqual(stored);
  });
});
