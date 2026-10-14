-- Test-only roadmap for the emulator run: one identity, three skills, two milestones.
INSERT INTO identities (id, title, why, deadline, position, updated_at) VALUES
  ('01920000-0000-7000-8000-00000000c001', 'Software engineer', 'Build things that matter', NULL, 0, 0);
INSERT INTO skills (id, identity_id, name, rubric, verifier, rest_weekday, position, updated_at) VALUES
  ('01920000-0000-7000-8000-00000000b001', '01920000-0000-7000-8000-00000000c001', 'Coding', 'Ship small commits', 'github', NULL, 0, 0),
  ('01920000-0000-7000-8000-00000000b002', '01920000-0000-7000-8000-00000000c001', 'Reading', 'Read and summarize', 'reading', NULL, 1, 0),
  ('01920000-0000-7000-8000-00000000b003', '01920000-0000-7000-8000-00000000c001', 'Math', 'Practice problems', 'math', NULL, 2, 0);
INSERT INTO milestones (id, skill_id, title, target_date, done, position, updated_at) VALUES
  ('01920000-0000-7000-8000-00000000d001', '01920000-0000-7000-8000-00000000b001', 'Finish the sync engine', NULL, 0, 0, 0),
  ('01920000-0000-7000-8000-00000000d002', '01920000-0000-7000-8000-00000000b002', 'Read chapter 1', NULL, 0, 1, 0);
