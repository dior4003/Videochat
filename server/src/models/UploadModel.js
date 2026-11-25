'use strict';

const fs = require('fs');
const path = require('path');
const { getPool } = require('../config/db');

const USER_QUOTA_BYTES = 200 * 1024 * 1024;

const UploadModel = {
  USER_QUOTA_BYTES,

  async create({ name, ownerId, originalName, mime, size }) {
    await getPool().query(
      `INSERT INTO uploads (name, owner_id, original_name, mime, size) VALUES (?, ?, ?, ?, ?)`,
      [name, ownerId, originalName.slice(0, 255), mime, size]
    );
  },

  async find(name) {
    const [rows] = await getPool().query(`SELECT * FROM uploads WHERE name = ? LIMIT 1`, [name]);
    return rows[0] || null;
  },

  async usedBytes(ownerId) {
    const [rows] = await getPool().query(`SELECT COALESCE(SUM(size), 0) AS used FROM uploads WHERE owner_id = ?`, [ownerId]);
    return Number(rows[0].used || 0);
  },

  /** 24 soatdan eski va hech bir xabarga biriktirilmagan fayllarni o'chiradi. */
  async cleanupOrphans(uploadsDir) {
    const [rows] = await getPool().query(
      `SELECT u.name FROM uploads u
        WHERE u.created_at < (NOW() - INTERVAL 1 DAY)
          AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.media_url = CONCAT('/uploads/', u.name))
        LIMIT 500`
    );
    for (const { name } of rows) {
      await fs.promises.unlink(path.join(uploadsDir, name)).catch(() => {});
      await getPool().query(`DELETE FROM uploads WHERE name = ?`, [name]);
    }
    return rows.length;
  },
};

module.exports = { UploadModel };
