import type { DeviceRepo } from '../../ports';

type DeviceRow = { id: string; name: string; utc_offset_minutes: number };

export const d1Devices = (db: D1Database): DeviceRepo => ({
  async pair(codeHash, device, tokenHash, at) {
    // One transaction: the device is inserted only while the code is unused, then the code is used.
    const [inserted] = await db.batch([
      db
        .prepare(
          `INSERT INTO devices (id, name, token_hash, utc_offset_minutes, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5
           WHERE NOT EXISTS (SELECT 1 FROM used_setup_codes WHERE code_hash = ?6)`,
        )
        .bind(device.id, device.name, tokenHash, device.utcOffsetMinutes, at, codeHash),
      db
        .prepare('INSERT OR IGNORE INTO used_setup_codes (code_hash, used_at) VALUES (?1, ?2)')
        .bind(codeHash, at),
    ]);
    return inserted?.meta.changes === 1;
  },

  async findByTokenHash(tokenHash) {
    const row = await db
      .prepare(
        `SELECT id, name, utc_offset_minutes FROM devices
         WHERE token_hash = ?1 AND revoked_at IS NULL`,
      )
      .bind(tokenHash)
      .first<DeviceRow>();
    return row === null
      ? null
      : { id: row.id, name: row.name, utcOffsetMinutes: row.utc_offset_minutes };
  },

  async setUtcOffset(deviceId, minutes) {
    await db
      .prepare('UPDATE devices SET utc_offset_minutes = ?2 WHERE id = ?1')
      .bind(deviceId, minutes)
      .run();
  },
});
