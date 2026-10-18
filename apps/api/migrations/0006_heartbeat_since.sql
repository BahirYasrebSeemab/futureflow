-- P5b: when the guard's service last connected (uptime seconds), so a beat held back by Doze is
-- not read as the guard switched off; and one row per beat, so a resent batch adds nothing.
ALTER TABLE heartbeats ADD COLUMN guard_since_uptime INTEGER;
CREATE UNIQUE INDEX heartbeats_device_beat ON heartbeats (device_id, boot_id, at);
