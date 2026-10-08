# ADR 0001: TypeScript monorepo with Bun workspaces

- Status: Accepted
- Date: 2026-10-08

## Context

The phone app (Expo), the API (Cloudflare Worker) and shared libraries (domain rules, schemas,
math engine) must share types and logic. A single developer maintains everything.

## Decision

One repository, Bun workspaces, TypeScript everywhere. Bun is the package manager and
script runner (one-off tools run via `bun x`). Vitest stays the test runner because Cloudflare's
Workers test pool (P3) is built on it. `apps/*` are deployables and `packages/*` are libraries.
Internal packages export TypeScript source directly (`"exports": "./src/index.ts"`), so there is no
build step. Each app's bundler (Metro, wrangler/esbuild, Vite for tests) compiles them.

TypeScript is pinned to **6.x**: TypeScript 7 (the native compiler) is not yet supported by
typescript-eslint, and Expo and wrangler tooling also assume the 6.x API.

## Alternatives

- **Separate repos:** shared code would need publishing or copying, and types would drift.
- **Turborepo / Nx:** task caching pays off in large repos. With fewer than 10 packages it adds
  config without a felt need (YAGNI). Revisit when CI time hurts.
- **pnpm:** strict dependency isolation, but it's slower to install and is another tool. Bun
  installs fast, runs TypeScript scripts directly, and Expo supports it as a package manager.
- **`bun test` instead of Vitest:** it's faster, but there's no Workers pool and its coverage
  thresholds are less mature.

## Consequences

- One `bun install`, one CI pipeline, atomic cross-package changes.
- Bun hoists dependencies, so undeclared imports can slip through. ESLint and code review guard that.
- Expo + Bun workspaces Metro setup is handled in P4.
- Revisit the TypeScript 7 upgrade once typescript-eslint supports it.
