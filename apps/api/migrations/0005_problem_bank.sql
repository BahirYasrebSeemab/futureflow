-- P3c-3: word problems. Stories are AI-written; prompts, answers and steps come from math-engine.

CREATE TABLE problem_bank (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  week TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  story TEXT NOT NULL,
  prompt TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  hints_json TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX problem_bank_week ON problem_bank (week, status);
