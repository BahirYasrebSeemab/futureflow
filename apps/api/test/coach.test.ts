import type { FetchLike } from '@futureflow/ai';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { DISTRESS_GUARDRAIL } from '../src/coach/persona';
import { call, geminiReply, makeApp, pairDevice, sampleRoadmap, type App } from './helpers';

type Sent = {
  systemInstruction: { parts: { text: string }[] };
  contents: { parts: { text: string }[] }[];
};

async function setup(
  reply: (n: number) => ReturnType<typeof geminiReply> | 'down' = () =>
    geminiReply('Ship the login fix first.'),
) {
  const sent: Sent[] = [];
  const fetch: FetchLike = async (_url, init) => {
    sent.push(JSON.parse(init.body ?? '{}') as Sent);
    const r = reply(sent.length);
    if (r === 'down') return { status: 503, text: async () => '{}' };
    return r;
  };
  const app: App = makeApp(undefined, { fetch });
  const { token } = await pairDevice(app);
  await call(app, 'PUT', '/v1/onboarding/roadmap', { token, body: sampleRoadmap() });
  const send = (text: string, id = uuidv7()) =>
    call<{ message: { id: string; text: string }; reply: { text: string; replyTo: string } }>(
      app,
      'POST',
      '/v1/coach/messages',
      {
        token,
        body: { id, text },
        env: { GEMINI_API_KEY: 'g-key' },
      },
    );
  return { app, token, send, sent };
}

describe('coach chat', () => {
  it('answers as the future self, with the guardrail and only minimal context', async () => {
    const { send, sent } = await setup();

    const reply = await send('What should I do first tomorrow?');

    expect(reply.status).toBe(201);
    expect(reply.body.data.reply).toMatchObject({
      text: 'Ship the login fix first.',
      replyTo: reply.body.data.message.id,
    });
    const system = sent[0]?.systemInstruction.parts[0]?.text ?? '';
    expect(system).toContain('Senior software engineer');
    expect(system).toContain('Build things that last');
    expect(system).toContain(DISTRESS_GUARDRAIL);
    const prompt = sent[0]?.contents[0]?.parts[0]?.text ?? '';
    expect(prompt).toContain('What should I do first tomorrow?');
  });

  it('sends only the last 10 messages, not the full history', async () => {
    const { send, sent } = await setup();
    for (let i = 0; i < 12; i++) await send(`message ${i}`);
    const prompt = sent.at(-1)?.contents[0]?.parts[0]?.text ?? '';
    expect(prompt).not.toContain('message 0\n');
    expect(prompt).toContain('message 10');
  });

  it('answers 503 when the AI is down, and a retry with the same id gets one reply', async () => {
    let down = true;
    const { app, token, send } = await setup(() => (down ? 'down' : geminiReply('Back.')));
    const id = uuidv7();

    const first = await send('hello', id);
    down = false;
    const retry = await send('hello', id);
    const again = await send('hello', id);
    const page = await call<{ messages: { role: string }[] }>(app, 'GET', '/v1/coach/messages', {
      token,
    });

    expect([first.status, first.body.error?.code]).toEqual([503, 'coach_unavailable']);
    expect([retry.status, again.status]).toEqual([201, 200]);
    expect(page.body.data.messages.map((m) => m.role)).toEqual(['owner', 'coach']);
  });
});
