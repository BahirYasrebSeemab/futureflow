# ADR 0002: Hexagonal core; zod only at the edges

- Status: Accepted
- Date: 2026-10-08

## Context

Rules (earning, caps, plan locking, day types) must behave identically on the phone and the
server, be fast to test, and survive swapping infrastructure (Gemini → Jev, D1 → Postgres,
Workers → Node).

## Decision

`@mflow/core` contains only pure functions and types. It performs no I/O, reads no clock, and
generates no IDs (time and ID generators are injected). Infrastructure lives in adapters inside the
apps. Runtime validation (zod) lives in `@mflow/contracts` and is applied where untrusted data
enters: HTTP bodies, AI outputs, third-party API responses, stored JSON. Inside the boundary, plain
TypeScript types are trusted.

## Alternatives

- **Validate everywhere:** redundant work and noise; types already guarantee internal shapes.
- **Classes/ORM entities in the domain:** couples rules to persistence and makes tests slower.
- **Valibot / ArkType instead of zod:** smaller and faster, but zod v4 has native JSON Schema
  export (`z.toJSONSchema`), which we hand to LLMs for structured output, and broader ecosystem
  support.

## Consequences

- Core tests run in milliseconds with no mocks.
- Expected failures are returned as `Result` values; exceptions mean bugs.
