# 0008. Verification: evidence, judge, owner confirmation, rewards

- Status: accepted
- Date: 2026-10-12

## Context

Future Flow pays phone time for verified work. GitHub and reading tasks need judgment; math and phone
usage are computed by the phone. The owner benefits from every "pass", so the judge must not be
easy to fool, and nothing may be silently passed or failed (spec §6.3, §13.1).

## Decision

- **GitHub link:** a fine-grained, read-only token (Contents + Metadata), checked with `GET /user`
  and each repository, sealed with AES-256-GCM (random IV, `v1.` format) under `GITHUB_TOKEN_KEY`
  (Worker secret), opened only during a run. A 401 marks the link `invalid`; runs then stop calling
  GitHub until the owner relinks.
- **Evidence:** the owner's commits per repository from a cursor (one day back at link time),
  stored once per SHA with its day on the owner's clock. At most 20 commit details per run (the
  free plan allows 50 subrequests per invocation); the rest come next hour. Patches are cut to
  1,500 characters, 15 files per commit, 40,000 patch characters per judge call (Jev: 32k tokens).
- **Judging:** GitHub tasks ask Jev's `noul` "do the commits complete the task?"; reading tasks ask
  a 0–5 `score`, passing on P(score ≥ 3). Confidence is max(p, 1 − p), and core `resolveDecision`
  turns anything under 0.75 into `pending`. Tasks are re-judged only when their evidence changes.
  When the AI is down (or the GitHub token is dead) a task with evidence becomes `pending` with no
  suggestion and an empty evidence list (spec §13.1), so the owner can decide it by hand and the
  judge still retries next run.
- **Owner confirmation first:** until the judge eval set (spec §14, with prompt-injection cases) is
  recorded, `JUDGE_AUTO_DECIDE` stays off and every judge verdict is `pending` with a `suggestion`.
  Only a pending GitHub/reading verdict can be decided by hand; math and usage verdicts come from
  the phone. A `pass` is final.
- **Rewards:** `settle` pays each passed task's reward and the all-done bonus through core `earn`
  as server events. It is idempotent, so the route, the owner's confirmation and the cron can all
  call it.
- **Grace window:** for 12 hours after the 04:00 boundary, runs also judge and settle yesterday, and
  the owner can still decide yesterday's pending verdicts (late-night commits, morning confirmations).
- **Repository health:** a 403/404 on a linked repository (how fine-grained tokens report lost
  access) is listed as `unreadableRepos` on the link until access returns.
- **Free-plan budget:** one run reads all cursors and known SHAs in one query each, writes evidence
  and cursors in one batch, counts AI usage with one atomic statement per call, and writes all
  payments at once. A test pins a busy run (5 repos, 25 commits, 5 tasks) at ≤ 32 D1 statements
  (measured 29; the free limit is 50).
- **Cron:** hourly (`0 * * * *`, 1 of 5 free triggers), logging counts only.

## Consequences

- With auto-decide off, the owner taps "confirm" for judged tasks; the judge still does the work of
  reading diffs and summaries and says what it thinks.
- The phone is trusted for math and usage verdicts in v1 (single owner); server-side math checks
  are a product-version task.
- Only one page (100) of commits per repository per run is listed; days with more commits per repo
  are not expected for one owner.
- **Only default-branch commits whose author email belongs to the GitHub account count.** That is
  what `GET /repos/{o}/{r}/commits?author=<login>` returns. Work on a feature branch counts when it
  is merged; commits made with an email not added to the account never count. Onboarding (P4) must
  say so; watching extra branches per repository is a later option.
