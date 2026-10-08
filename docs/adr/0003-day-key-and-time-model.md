# ADR 0003: Day keys with a 04:00 boundary and an explicit UTC offset

- Status: Accepted
- Date: 2026-10-08

## Context

Plans, caps and expiry are per day. The owner stays up past midnight and travels (Dushanbe ↔ Toronto).
The domain core must stay pure: no reading the clock or the system timezone.

## Decision

A day is identified by a `DayKey` (`YYYY-MM-DD`) computed as
`dayKeyFor(instantMs, utcOffsetMinutes, boundaryHour = 4)`. The device supplies its current
UTC offset with every event. Weekly limits use ISO weeks and monthly limits use calendar months, both derived
from the day key. Durations are measured with a monotonic clock on the device (not in core).

## Alternatives

- **IANA timezone names in core:** needs `Intl` timezone data, which is inconsistent across Hermes/Workers.
  An offset is enough to bucket an instant.
- **Midnight boundary:** late-night work would count toward the wrong day.

## Consequences

- Pure, deterministic day bucketing that's easy to test.
- On travel days the offset changes, so a day can be shorter or longer. That's acceptable and covered by tests.
