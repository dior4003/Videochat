'use strict';

const crypto = require('crypto');
const { getPool } = require('../config/db');
const { publicFromPeerRow } = require('./UserModel');
const { escapeLike } = require('../utils/validators');

function getChatId(a, b) {
  return [a, b].sort().join('__');
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    text: row.text,
    type: row.type || 'text',
    mediaUrl: row.media_url || null,
    status: row.status,
    createdAt: row.created_at,
  };
}

const PEER_COLUMNS = `u.id AS peer_id, u.username AS peer_username, u.display_name AS peer_display_name,
  u.bio AS peer_bio, u.avatar_color AS peer_avatar_color, u.avatar_url AS peer_avatar_url, u.last_seen AS peer_last_seen`;

const MessageModel = {
  async create({ senderId, receiverId, text, type = 'text', mediaUrl = null }) {
    const id = crypto.randomUUID();
    const chatId = getChatId(senderId, receiverId);
    await getPool().query(
      `INSERT INTO messages (id, chat_id, sender_id, receiver_id, text, type, media_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sent')`,
      [id, chatId, senderId, receiverId, String(text || ''), type, mediaUrl]
    );
    const [rows] = await getPool().query(`SELECT * FROM messages WHERE id = ? LIMIT 1`, [id]);
    return mapMessage(rows[0]);
  },

  /**
   * Suhbat tarixi: oxirgi `limit` ta xabar (eskidan yangiga), `before` (ISO sana) bilan sahifalash.
   */
  async getConversation(userId, peerId, { limit = 100, before = null } = {}) {
    const chatId = getChatId(userId, peerId);
    await getPool().query(
      `UPDATE messages SET status = 'read' WHERE chat_id = ? AND receiver_id = ? AND status <> 'read'`,
      [chatId, userId]
    );
    const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const params = [chatId];
    let beforeSql = '';
    if (before && !Number.isNaN(Date.parse(before))) {
      beforeSql = 'AND created_at < ?';
      params.push(new Date(before));
    }
    params.push(lim);
    const [rows] = await getPool().query(
      `SELECT * FROM (
         SELECT * FROM messages WHERE chat_id = ? ${beforeSql} ORDER BY created_at DESC, id DESC LIMIT ?
       ) t ORDER BY created_at ASC, id ASC`,
      params
    );
    return rows.map(mapMessage);
  },

  async searchMessages(userId, query) {
    const q = `%${escapeLike(query.trim().toLowerCase())}%`;
    const [rows] = await getPool().query(
      `SELECT m.*, ${PEER_COLUMNS}
         FROM messages m
         INNER JOIN users u ON u.id = IF(m.sender_id = ?, m.receiver_id, m.sender_id)
        WHERE (m.sender_id = ? OR m.receiver_id = ?) AND m.type = 'text' AND LOWER(m.text) LIKE ?
        ORDER BY m.created_at DESC
        LIMIT 50`,
      [userId, userId, userId, q]
    );
    return rows.map((r) => ({ message: mapMessage(r), peer: publicFromPeerRow(r) }));
  },

  async markRead(userId, peerId) {
    const [res] = await getPool().query(
      `UPDATE messages SET status = 'read' WHERE chat_id = ? AND receiver_id = ? AND status <> 'read'`,
      [getChatId(userId, peerId), userId]
    );
    return res.affectedRows > 0;
  },

  /** Har bir suhbatning oxirgi xabari (created_at teng bo'lsa ham dublikatsiz). */
  async getChatsForUser(userId) {
    const [rows] = await getPool().query(
      `SELECT m.*, ${PEER_COLUMNS},
              (SELECT COUNT(*) FROM messages um
                WHERE um.chat_id = m.chat_id AND um.receiver_id = ? AND um.status <> 'read') AS unread_count
         FROM messages m
         INNER JOIN users u ON u.id = IF(m.sender_id = ?, m.receiver_id, m.sender_id)
        WHERE (m.sender_id = ? OR m.receiver_id = ?)
          AND m.id = (
            SELECT m2.id FROM messages m2
             WHERE m2.chat_id = m.chat_id
             ORDER BY m2.created_at DESC, m2.id DESC
             LIMIT 1
          )
        ORDER BY m.created_at DESC`,
      [userId, userId, userId, userId]
    );
    return rows.map((r) => ({
      peer: publicFromPeerRow(r),
      lastMessage: mapMessage(r),
      unreadCount: Number(r.unread_count || 0),
    }));
  },

  /** Fayl ushbu foydalanuvchi ishtirok etgan xabarga biriktirilganmi? */
  async userCanSeeMedia(userId, mediaUrl) {
    const [rows] = await getPool().query(
      `SELECT 1 FROM messages WHERE media_url = ? AND (sender_id = ? OR receiver_id = ?) LIMIT 1`,
      [mediaUrl, userId, userId]
    );
    return rows.length > 0;
  },
};

module.exports = { MessageModel };
