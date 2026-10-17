# Future Flow P4d: reading log, coach chat, roadmap onboarding and GitHub link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The last phone screens over existing API routes:

- **Reading log:** `POST /v1/reading`. The judge scores it later, and the verdict shows on Today.
- **Coach chat:** `GET` and `POST /v1/coach/messages`, with nightly reviews in the same thread. When the coach is unavailable it shows a fixed supportive line and the crisis line.
- **Roadmap onboarding:** `GET` and `PUT /v1/onboarding/roadmap`, covering identities, skills and milestones.
- **GitHub link:** `GET`, `PUT` and `DELETE /v1/github/link`, with the default-branch and account-email note.
- A **More** screen gathers them.

**Architecture:** Same ports. New API client methods. Coach messages are cached in SQLite (migration 4), so the thread reads offline. A pure `roadmap-draft.ts` holds the roadmap editing and validation, mirroring `RoadmapSchema`. Navigation stays a Stack; Today gains Coach and More buttons.

**Spec:** §9.1 (onboarding), §9.2 (persona and distress guardrail), §9.3 (memory), §6.3 (reading), §11 (routes), §13.3 (privacy). ADRs 0008 (verification), 0009 (coach and upkeep), 0011–0014.

## Global Constraints

- **Machine (1.8 GB of RAM):** one test file at a time (`bun x jest --maxWorkers=1 test/<file>`). Never repo-wide commands. CI runs everything.
- Bun only. No AI attribution.
- **Distress guardrail on the phone:** when the coach can't answer (`coach_unavailable`, 503, network or any failure), the chat shows a fixed line, never AI text: "The coach can't answer right now. If things feel heavy, you don't have to wait: call or text 9-8-8 (Suicide Crisis Helpline, Canada, 24/7). In an emergency, call 9-1-1." The owner's message stays in the thread, marked "not answered yet", and retrying reuses its id.
- **Privacy:**
  - Logs carry no chat text, summaries, tokens or repo names.
  - The GitHub token goes only to `PUT /github/link`. It is never stored on the phone, never shown after sending, and the input is `secureTextEntry`.
- **The roadmap follows `RoadmapSchema`:**
  - 1–3 identities (title ≤ 80, why ≤ 500, optional deadline)
  - ≤ 12 skills (name ≤ 80, rubric ≤ 500, a verifier, an optional rest weekday)
  - ≤ 100 milestones (title ≤ 120, optional target date, done)
  - ids are UUIDv7 from the phone
  - the phone validates before `PUT`
- **Reading follows `ReadingLogSchema`:** title ≤ 200, a source (book, pdf or article), pages 1–2000 and/or minutes 1–1440, summary 1–2000 characters, and a client id reused on retry. A log may be for today or yesterday (the server allows yesterday).
- Tests live in `apps/mobile/test/**`, and coverage stays at 80% or above.

## Review Focus

1. **The coach fails:** the fixed supportive line and 9-8-8 appear, no AI text, the message is kept, and a retry reuses its id. Test "coach unavailable shows the crisis line".
2. **A GitHub token is never stored or shown again** after linking. Test "the token is cleared and never stored".
3. **A roadmap edit that breaks the schema** (no identity, a skill pointing at a removed identity) can't be saved, and the reason is shown. Test "removing an identity removes its skills and milestones".
4. **A retried reading log** reuses its id, so the server doesn't double-log it. Test "a retried reading log reuses its id".
5. **The coach thread offline** shows the cached messages. Test "the thread shows cached messages offline".

---

### Task 1: API client and coach cache (migration 4)

- **Client** (`client.ts`):
  - `sendReading(log)`, `POST /v1/reading` → `{ id, created }`
  - `coachMessages(since, limit = 50)`, `GET` → `CoachPageSchema`
  - `sendCoachMessage({ id, text })`, `POST` → `{ message, reply }`, both `CoachMessageSchema`
  - `getRoadmap` (already exists), `saveRoadmap(r)` via `PUT` → `RoadmapSchema`
  - `getGithubLink()`, `GET` → `GithubLinkSchema`, with 404 meaning `null`
  - `linkGithub({ token, repos })` via `PUT` → `GithubLinkSchema`
  - `unlinkGithub()` via `DELETE`
  - Add `'DELETE'` to the request methods.
- **Store:**
  - migration 4: `coach_messages(id PK, seq INTEGER, created_at, message TEXT)` and kv `coach_cursor`
  - `saveCoachMessages(messages, next?)`, `coachThread(): CoachMessage[]` (ordered by `createdAt`, then rowid), `coachCursor()`
  - `clearServerCopy` keeps the thread but resets `coach_cursor`
- **Tests:** api-client (each method's path, method and body; GitHub 404 → null) and store (thread order, upsert, cursor).
- Commit: `feat: add reading, coach, roadmap and GitHub calls, and cache the coach thread`

### Task 2: Reading log screen (`/reading`)

- **Fields:** title, source chips (`source-book`, `source-pdf`, `source-article`), pages, minutes, and "What did you learn?" (summary).
- **Day:** a "Read yesterday" toggle (`read-yesterday`), defaulting to today, using `currentDayKey` and `addDays(-1)`.
- **Submit:** `submit-reading` is disabled until the title, the summary and pages or minutes are valid. On success it shows "Saved. It's checked tonight; the result shows on Today." and resets the form with a new id.
- **Errors** keep the form and reuse the same id: network → "Saving needs a connection.", `day_out_of_range` → "You can log today's or yesterday's reading."
- **Tests:** a valid log is sent with the right body; validation disables submit; a retried log reuses its id; yesterday's day key.
- Commit: `feat: log reading with what you learned`

### Task 3: Coach chat (`/coach`)

- **Thread:** cached messages, then a sync of `coachMessages(cursor)` on open and on focus. Owner messages sit on the right, coach messages on the left, and `kind: 'review'` shows a "Nightly review" label.
- **Composer:** `coach-input` (≤ 2000 characters) and `coach-send`.
  - Sending adds the owner message optimistically with a new id, then calls `sendCoachMessage`.
  - On success both messages are saved to the cache.
  - On any failure the message is marked `not-answered` with a `retry-<id>` button that resends the same id and text, and the **fixed crisis-line text** appears (`coach-unavailable`).
- **Tests:** a reply is shown and cached; "coach unavailable shows the crisis line" (503 and network) with no AI text; "retry reuses the id"; "the thread shows cached messages offline"; reviews are labelled.
- Commit: `feat: chat with the coach, with a fixed safety line when it can't answer`

### Task 4: Roadmap editor (`/roadmap`)

- **Pure** (`src/lib/roadmap-draft.ts`):
  - `emptyRoadmap()`
  - `addIdentity`, `removeIdentity` (which also removes its skills and their milestones)
  - `addSkill(identityId, verifier)`, `removeSkill` (which also removes its milestones)
  - `addMilestone(skillId)`, `edit*`
  - `roadmapProblems(r)` → messages: "Add at least one identity.", "Up to 3 identities.", empty fields, "Up to 12 skills.", "Up to 100 milestones."
  - ids from `ids.newId`
- **Screen:** loads `getRoadmap()` (null → `emptyRoadmap` plus an intro: "Who do you want to become? Up to 3 identities, each with the skills that get you there.").
  - Identity cards: title, why, deadline (optional `YYYY-MM-DD` text, validated with `DayKeySchema`).
  - Skill rows: name, rubric, verifier chips, rest weekday chips (or none).
  - Milestone rows: title and a done toggle.
  - `save-roadmap` is disabled while there are problems or no changes. Save maps errors: network → "Saving needs a connection."
- **Tests:** the pure cascade removals and problems; the screen loads and saves the expected body; problems block saving.
- Commit: `feat: build and edit the roadmap on the phone`

### Task 5: GitHub link (`/github`) and the More screen

- **GitHub:**
  - Shows the linked `login`, the repos, and the status (ok, or invalid → "Reconnect GitHub"), plus `unreadableRepos` ("can't be read with this token").
  - The form has a token (`secureTextEntry`) and repos as `owner/name` lines (1–10, validated by `RepoNameSchema`), and states: "Use a fine-grained, read-only token (Contents and Metadata). Only commits on each repo's default branch, made with your GitHub account's email, count."
  - Link → on success the token field is cleared. Errors: `github_token_invalid`, `github_repo_unavailable`, `github_key_missing` → their server messages; network → "Linking needs a connection."
  - `unlink-github` asks for confirmation.
- **More** (`/more`): rows for Roadmap, GitHub, Reading log, Diagnostics. Today gets `open-coach` and `open-more` buttons. The Diagnostics link moves into More, and the Today footer link stays.
- **Tests:** link sends `{token, repos}`, then clears the token; "the token is cleared and never stored" (secrets and store hold no token); unlink confirmation; the More rows navigate; Today's buttons.
- Commit: `feat: link GitHub and gather settings under More`

### Task 6: Emulator flow, ADR 0015 and docs

- **Maestro:** Today → `open-coach` (screenshot; the CI Worker has no AI key, so the coach answers 503 and the crisis line shows; screenshot `11-coach-unavailable`) → back → `open-more` → Roadmap (screenshot `12-roadmap`) → back.
- **ADR 0015:** the screens, the phone-side safety line, the coach cache, form-based onboarding (the spec's conversational onboarding with coach-proposed skills and the Xiaomi checklist come later: P5 for the guard, P6 for polish), the GitHub token's handling, and the default-branch note.
- **README:** a line about the new screens.
- Push, open the PR (stacked on #16), run the final review and fixes, then merge only when told.
