-- P3c-2: coach chat and memory, nightly runs, heartbeat gaps.

CREATE TABLE coach_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'coach')),
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'review')),
  text TEXT NOT NULL,
  day TEXT NOT NULL,
  week TEXT NOT NULL,
  reply_to TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX coach_messages_day ON coach_messages (day);
CREATE INDEX coach_messages_week ON coach_messages (week);

CREATE TABLE coach_summaries (
  week TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE nightly_runs (
  day TEXT PRIMARY KEY,
  done_at INTEGER NOT NULL
);

CREATE TABLE guard_cursor (
  device_id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL
);

CREATE TABLE guard_gaps (
  device_id TEXT NOT NULL,
  from_at INTEGER NOT NULL,
  to_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('phone_off', 'guard_disabled')),
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, from_at)
);
CREATE INDEX guard_gaps_day ON guard_gaps (day);
