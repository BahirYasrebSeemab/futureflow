# 0015. Reading, coach chat, roadmap onboarding and GitHub on the phone

- Status: accepted
- Date: 2026-10-15

## Context

The API already serves reading logs, coach chat, the roadmap and the GitHub link (ADRs 0007–0009).
P4d gives them phone screens. Spec §9.2 requires a distress guardrail.

## Decision

- **Reading log:** title, source, pages and/or minutes, and "What did you learn?". The id is made
  on the phone and reused on retry, so a log is never counted twice. Today or yesterday only.
  The judge scores it tonight; the verdict shows on Today.
- **Coach chat:**
  - The thread is cached in SQLite, so it reads offline.
  - Nightly reviews appear in the same thread, labelled.
  - **When the coach can't answer** (503, network, anything), the phone shows a fixed line,
    never AI text: the supportive message, **9-8-8** (Suicide Crisis Helpline, Canada, 24/7) and
    **9-1-1**. The owner's message stays with a retry that reuses its id.
- **Roadmap onboarding** is a form (identities → skills → milestones), validated on the phone
  against `RoadmapSchema`. Removing an identity or skill removes what hangs off it. The spec's
  conversational onboarding (coach-proposed skills, guard checklist) comes later.
- **GitHub:**
  - The token goes to `PUT /github/link` once. It is never stored on the phone and the field is
    cleared after linking.
  - The screen says what counts: a fine-grained, read-only token, and only commits on each repo's
    default branch made with the account's email.
- **Navigation** stays a Stack: Today has Plan, Away, Math, Coach and More; More holds Roadmap,
  GitHub, Reading and Diagnostics. Tabs can come with a UI polish phase.

## Consequences

- An unanswered coach message is kept only while the chat screen is open.
- Onboarding is less guided than the spec's conversation until coach proposals land.
