-- P3a schema. Append-only tables keep a server sequence (`seq`) for sync cursors.

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  utc_offset_minutes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE used_setup_codes (
  code_hash TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);

CREATE TABLE ledger_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  day TEXT NOT NULL,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  ref_id TEXT,
  reason TEXT,
  semantic_key TEXT UNIQUE,
  device_id TEXT,
  received_at INTEGER NOT NULL
);
CREATE INDEX ledger_events_day ON ledger_events (day);

CREATE TABLE plans (
  day TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('draft', 'locked')),
  tasks_json TEXT NOT NULL,
  locked_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE away_windows (
  id TEXT PRIMARY KEY,
  place TEXT NOT NULL,
  from_day TEXT NOT NULL,
  to_day TEXT NOT NULL,
  kept_task_ids_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE day_records (
  day TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('normal', 'bad', 'away')),
  away_window_id TEXT,
  place TEXT,
  kept_task_ids_json TEXT,
  verified TEXT CHECK (verified IN ('pending', 'yes', 'no', 'unknown')),
  distance_km INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE heartbeats (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  boot_id TEXT NOT NULL,
  uptime_seconds INTEGER NOT NULL,
  guard_enabled INTEGER NOT NULL CHECK (guard_enabled IN (0, 1)),
  received_at INTEGER NOT NULL
);
CREATE INDEX heartbeats_device_received ON heartbeats (device_id, received_at);

CREATE TABLE reading_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('book', 'pdf', 'article')),
  pages INTEGER,
  minutes INTEGER,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE math_attempts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,
  at INTEGER NOT NULL,
  topic_id TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  answer_type TEXT NOT NULL CHECK (answer_type IN ('typed', 'choice')),
  received_at INTEGER NOT NULL
);
CREATE INDEX math_attempts_day ON math_attempts (day);
