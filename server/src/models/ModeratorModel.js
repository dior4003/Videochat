'use strict';

const crypto = require('crypto');
const { getPool } = require('../config/db');
const { mapUser, selfUser } = require('./UserModel');

const ModeratorModel = {
  async getStats() {
    const [[row]] = await getPool().query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS totalUsers,
         (SELECT COUNT(*) FROM users WHERE is_banned = 1) AS bannedUsers,
         (SELECT COUNT(*) FROM messages) AS totalMessages,
         (SELECT COUNT(*) FROM calls) AS totalCalls,
         (SELECT COUNT(*) FROM reports WHERE status = 'open') AS openReports`
    );
    return {
      totalUsers: Number(row.totalUsers),
      bannedUsers: Number(row.bannedUsers),
      totalMessages: Number(row.totalMessages),
      totalCalls: Number(row.totalCalls),
      openReports: Number(row.openReports),
    };
  },

  async listAllUsers() {
    const [rows] = await getPool().query(`SELECT * FROM users ORDER BY created_at DESC LIMIT 200`);
    return rows.map((r) => ({ ...selfUser(mapUser(r)), isBanned: Boolean(r.is_banned) }));
  },

  async setBan(userId, isBanned) {
    // Ban qilinganda barcha tokenlar bekor qilinadi
    const [res] = await getPool().query(
      `UPDATE users SET is_banned = ?, token_version = token_version + ? WHERE id = ?`,
      [isBanned ? 1 : 0, isBanned ? 1 : 0, userId]
    );
    return res.affectedRows > 0;
  },

  async hasOpenReport(reporterId, targetUserId) {
    const [rows] = await getPool().query(
      `SELECT 1 FROM reports WHERE reporter_id = ? AND target_user_id = ? AND status = 'open' LIMIT 1`,
      [reporterId, targetUserId]
    );
    return rows.length > 0;
  },

  async createReport({ reporterId, targetUserId, reason }) {
    const id = crypto.randomUUID();
    await getPool().query(
      `INSERT INTO reports (id, reporter_id, target_user_id, reason) VALUES (?, ?, ?, ?)`,
      [id, reporterId, targetUserId, String(reason || '').slice(0, 255)]
    );
    return id;
  },

  async listReports() {
    const [rows] = await getPool().query(
      `SELECT r.*, rep.display_name AS reporter_name, tgt.display_name AS target_name
         FROM reports r
         INNER JOIN users rep ON rep.id = r.reporter_id
         INNER JOIN users tgt ON tgt.id = r.target_user_id
        ORDER BY r.created_at DESC
        LIMIT 100`
    );
    return rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
      reporterName: r.reporter_name,
      targetUserId: r.target_user_id,
      targetName: r.target_name,
    }));
  },

  async resolveReport(reportId) {
    const [res] = await getPool().query(`UPDATE reports SET status = 'resolved' WHERE id = ?`, [reportId]);
    return res.affectedRows > 0;
  },

  async deleteMessage(messageId) {
    const [res] = await getPool().query(`DELETE FROM messages WHERE id = ?`, [messageId]);
    return res.affectedRows > 0;
  },

  async audit(actorId, action, targetId = null, details = null) {
    await getPool().query(
      `INSERT INTO audit_log (actor_id, action, target_id, details) VALUES (?, ?, ?, ?)`,
      [actorId, action, targetId, details ? String(details).slice(0, 500) : null]
    );
  },
};

module.exports = { ModeratorModel };
