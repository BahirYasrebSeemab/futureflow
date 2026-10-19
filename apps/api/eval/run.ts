/**
 * Runs the judge eval set through the production judge path and writes docs/judge-eval/report.md.
 * Usage (in apps/api): put JEV_API_KEY and/or GEMINI_API_KEY in .dev.vars, then `bun run judge:eval`.
 * It makes one judge call per case (50 calls); keys and evidence are never printed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryUsage } from '@futureflow/ai';
import { DEFAULT_RULES } from '@futureflow/core';
import { aiFromEnv, timeoutFetch } from '../src/ai';
import type { Bindings } from '../src/env';
import { report, scoreCase, summarize, type CaseResult } from '../src/verification/eval';
import { judgeGithub, judgeReading } from '../src/verification/judge';
import { JUDGE_CASES } from './judge-cases';

const here = dirname(fileURLToPath(import.meta.url));
const REPORT = `${here}/../../../docs/judge-eval/report.md`;
const say = (line: string) => process.stdout.write(`${line}\n`);

/** KEY=VALUE lines from .dev.vars, as wrangler reads them: comments, spaces and quotes handled. */
function devVars(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const pairs = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const key = line.slice(0, line.indexOf('=')).trim();
      let value = line.slice(line.indexOf('=') + 1).trim();
      const quoted = /^(["'])(.*)\1$/.exec(value);
      value = quoted ? (quoted[2] ?? '') : value.replace(/\s+#.*$/, '');
      return [key, value] as const;
    });
  return Object.fromEntries(pairs);
}

// The shell's values win, but an empty one doesn't hide the file's.
const shell = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ''),
);
const vars: Record<string, string | undefined> = { ...devVars(`${here}/../.dev.vars`), ...shell };
const providers = [
  ...(vars.JEV_API_KEY ? ['Jev'] : []),
  ...(vars.GEMINI_API_KEY ? ['Gemini (fallback)'] : []),
];
if (providers.length === 0) {
  say('Set JEV_API_KEY and/or GEMINI_API_KEY in apps/api/.dev.vars first.');
  process.exit(1);
}

// The eval may use more than a day's production quota, so its own limits are generous.
const env = {
  JEV_API_KEY: vars.JEV_API_KEY,
  GEMINI_API_KEY: vars.GEMINI_API_KEY,
  JEV_DAILY_LIMIT: '1000',
  GEMINI_DAILY_LIMIT: '1000',
} as unknown as Bindings;
const ai = aiFromEnv(env, memoryUsage(), timeoutFetch, () => Date.now());

const results: CaseResult[] = [];
for (const c of JUDGE_CASES) {
  const decision =
    c.kind === 'github'
      ? await judgeGithub(ai, c.task, c.commits)
      : await judgeReading(ai, c.task, c.logs);
  const scored = scoreCase(c.expected, decision, DEFAULT_RULES.judgeConfidenceThreshold);
  results.push({ id: c.id, kind: c.kind, expected: c.expected, decision, ...scored });
  say(`${c.id}: ${scored.outcome}${scored.auto ? '' : ' (would ask the owner)'}`);
  // Five unanswered calls in a row at the start mean bad keys or no network: stop, keep the old report.
  if (results.length === 5 && results.every((r) => r.outcome === 'unavailable')) {
    say('\nNo answer from any provider for the first 5 cases. Check the keys and the network.');
    process.exit(1);
  }
}

const summary = summarize(results);
const header = [
  `<!-- ${new Date().toISOString()} · providers: ${providers.join(', ')} · threshold ${DEFAULT_RULES.judgeConfidenceThreshold} -->`,
  '',
].join('\n');
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, header + report(summary, results));
say(
  `\nAccuracy ${(summary.accuracy * 100).toFixed(1)}%, decided alone ${summary.autoDecided}, ` +
    `false passes ${summary.falsePasses}. Report: docs/judge-eval/report.md`,
);
