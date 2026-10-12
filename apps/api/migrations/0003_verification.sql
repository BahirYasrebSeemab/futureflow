-- P3c-1: GitHub link (token sealed with AES-GCM), commit evidence, verdicts.

CREATE TABLE github_link (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  login TEXT NOT NULL,
  token_sealed TEXT NOT NULL,
  repos_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'invalid')),
  -- Repositories the token currently cannot read (403/404), shown to the owner.
  unreadable_json TEXT NOT NULL DEFAULT '[]',
  linked_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);

CREATE TABLE github_cursor (
  repo TEXT PRIMARY KEY,
  since TEXT NOT NULL
);

CREATE TABLE github_commits (
  sha TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  day TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  captured_at INTEGER NOT NULL
);
CREATE INDEX github_commits_day ON github_commits (day, committed_at);

CREATE TABLE verdicts (
  day TEXT NOT NULL,
  task_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'pending')),
  confidence REAL NOT NULL,
  by TEXT NOT NULL CHECK (by IN ('code', 'judge', 'coach', 'owner')),
  suggestion TEXT CHECK (suggestion IN ('pass', 'fail')),
  evidence_ids_json TEXT NOT NULL,
  decided_at INTEGER NOT NULL,
  PRIMARY KEY (day, task_id)
);
