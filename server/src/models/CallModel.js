'use strict';

const crypto = require('crypto');
const { getPool } = require('../config/db');
const { publicFromPeerRow } = require('./UserModel');

const CallModel = {
  async create({ id, callerId, receiverId, callType, status }) {
    const callId = id || crypto.randomUUID();
    await getPool().query(
      `INSERT INTO calls (id, caller_id, receiver_id, call_type, status) VALUES (?, ?, ?, ?, ?)`,
      [callId, callerId, receiverId, callType === 'video' ? 'video' : 'audio', status || 'ringing']
    );
    return callId;
  },

  async update(callId, { status, durationSec, endedAt }) {
    const fields = [];
    const values = [];
    if (status) { fields.push('status = ?'); values.push(status); }
    if (typeof durationSec === 'number') { fields.push('duration_sec = ?'); values.push(durationSec); }
    if (endedAt) { fields.push('ended_at = ?'); values.push(new Date(endedAt)); }
    if (fields.length > 0) {
      values.push(callId);
      await getPool().query(`UPDATE calls SET ${fields.join(', ')} WHERE id = ?`, values);
    }
  },

  /** Server qayta ishga tushganda xotirada yo'qolgan qo'ng'iroqlarni yopadi. */
  async failStale() {
    await getPool().query(
      `UPDATE calls SET status = IF(status = 'active', 'ended', 'missed'), ended_at = CURRENT_TIMESTAMP(3)
        WHERE status IN ('ringing', 'active')`
    );
  },

  async listForUser(userId) {
    const [rows] = await getPool().query(
      `SELECT c.*,
              u.id AS peer_id, u.username AS peer_username, u.display_name AS peer_display_name,
              u.bio AS peer_bio, u.avatar_color AS peer_avatar_color, u.avatar_url AS peer_avatar_url,
              u.last_seen AS peer_last_seen
         FROM calls c
         INNER JOIN users u ON u.id = IF(c.caller_id = ?, c.receiver_id, c.caller_id)
        WHERE c.caller_id = ? OR c.receiver_id = ?
        ORDER BY c.started_at DESC
        LIMIT 100`,
      [userId, userId, userId]
    );
    return rows.map((r) => ({
      id: r.id,
      callerId: r.caller_id,
      receiverId: r.receiver_id,
      callType: r.call_type,
      status: r.status,
      durationSec: r.duration_sec,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      direction: r.caller_id === userId ? 'outgoing' : 'incoming',
      peer: publicFromPeerRow(r),
    }));
  },
};

module.exports = { CallModel };
