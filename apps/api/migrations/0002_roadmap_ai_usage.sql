-- P3b: the owner's roadmap (onboarding) and daily AI request counters.

CREATE TABLE identities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  why TEXT NOT NULL,
  deadline TEXT,
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES identities (id),
  name TEXT NOT NULL,
  rubric TEXT NOT NULL,
  verifier TEXT NOT NULL CHECK (verifier IN ('github', 'math', 'reading', 'usage')),
  rest_weekday INTEGER CHECK (rest_weekday BETWEEN 0 AND 6),
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills (id),
  title TEXT NOT NULL,
  target_date TEXT,
  done INTEGER NOT NULL CHECK (done IN (0, 1)),
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE ai_usage (
  provider TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (provider, day)
);
