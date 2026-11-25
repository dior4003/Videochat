'use strict';

const crypto = require('crypto');
const { getPool } = require('../config/db');
const { mapUser, publicUser } = require('./UserModel');

const pairKey = (a, b) => [a, b].sort().join(':');

const FriendModel = {
  /**
   * Do'stlik so'rovi. Teskari juftlik uchun ham yagona yozuv (pair_key UNIQUE) – race condition yo'q.
   * Bloklangan holatda umumiy xabar qaytariladi (kim kimni bloklaganini oshkor qilmaydi).
   */
  async sendRequest(userId, friendId) {
    if (userId === friendId) throw new Error('O‘zingizga do‘stlik so‘rovi yubora olmaysiz');
    const key = pairKey(userId, friendId);
    const pool = getPool();

    const load = async () => {
      const [rows] = await pool.query(`SELECT * FROM friendships WHERE pair_key = ? LIMIT 1`, [key]);
      return rows[0] || null;
    };

    let existing = await load();
    if (!existing) {
      const id = crypto.randomUUID();
      try {
        await pool.query(
          `INSERT INTO friendships (id, user_id, friend_id, status, pair_key) VALUES (?, ?, ?, 'pending', ?)`,
          [id, userId, friendId, key]
        );
        return { id, status: 'pending' };
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
        existing = await load(); // parallel so'rov oldin yozilgan
      }
    }

    if (existing.status === 'blocked') throw new Error('Bu foydalanuvchiga so‘rov yuborib bo‘lmaydi');
    if (existing.status === 'accepted') throw new Error('Siz allaqachon do‘stsiz');
    if (existing.friend_id === userId && existing.status === 'pending') {
      await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = ? AND status = 'pending'`, [existing.id]);
      return { id: existing.id, status: 'accepted' };
    }
    return { id: existing.id, status: existing.status };
  },

  async acceptRequest(friendshipId, currentUserId) {
    const [res] = await getPool().query(
      `UPDATE friendships SET status = 'accepted' WHERE id = ? AND friend_id = ? AND status = 'pending'`,
      [friendshipId, currentUserId]
    );
    return res.affectedRows > 0;
  },

  /** Do'stlikni (yoki so'rovni) olib tashlaydi; bloklangan yozuvni faqat bloklagan kishi olib tashlay oladi. */
  async removeFriend(userId, peerId) {
    const [res] = await getPool().query(
      `DELETE FROM friendships
        WHERE pair_key = ? AND NOT (status = 'blocked' AND user_id <> ?)`,
      [pairKey(userId, peerId), userId]
    );
    return res.affectedRows > 0;
  },

  async block(userId, peerId) {
    if (userId === peerId) throw new Error('O‘zingizni bloklay olmaysiz');
    const pool = getPool();
    await pool.query(`DELETE FROM friendships WHERE pair_key = ? AND NOT (status = 'blocked' AND user_id <> ?)`, [pairKey(userId, peerId), userId]);
    try {
      await pool.query(
        `INSERT INTO friendships (id, user_id, friend_id, status, pair_key) VALUES (?, ?, ?, 'blocked', ?)`,
        [crypto.randomUUID(), userId, peerId, pairKey(userId, peerId)]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return; // allaqachon bloklangan (yoki peer bizni bloklagan)
      throw err;
    }
  },

  async unblock(userId, peerId) {
    const [res] = await getPool().query(
      `DELETE FROM friendships WHERE pair_key = ? AND status = 'blocked' AND user_id = ?`,
      [pairKey(userId, peerId), userId]
    );
    return res.affectedRows > 0;
  },

  /** Ikki tomondan istalgani bloklagan bo'lsa true. */
  async isBlockedBetween(a, b) {
    const [rows] = await getPool().query(
      `SELECT 1 FROM friendships WHERE pair_key = ? AND status = 'blocked' LIMIT 1`,
      [pairKey(a, b)]
    );
    return rows.length > 0;
  },

  async friendIds(userId) {
    const [rows] = await getPool().query(
      `SELECT IF(user_id = ?, friend_id, user_id) AS peer_id
         FROM friendships WHERE status = 'accepted' AND (user_id = ? OR friend_id = ?)`,
      [userId, userId, userId]
    );
    return rows.map((r) => r.peer_id);
  },

  async listForUser(userId) {
    const [rows] = await getPool().query(
      `SELECT f.id AS rel_id, f.user_id, f.friend_id, f.status, u.*
         FROM friendships f
         INNER JOIN users u ON u.id = IF(f.user_id = ?, f.friend_id, f.user_id)
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status IN ('accepted', 'pending')
        ORDER BY f.created_at DESC`,
      [userId, userId, userId]
    );

    const friends = [];
    const incomingRequests = [];
    const outgoingRequests = [];
    for (const r of rows) {
      const peer = publicUser(mapUser({ ...r, id: r.id }));
      if (r.status === 'accepted') friends.push({ relationId: r.rel_id, peer });
      else if (r.friend_id === userId) incomingRequests.push({ relationId: r.rel_id, peer });
      else outgoingRequests.push({ relationId: r.rel_id, peer });
    }
    return { friends, incomingRequests, outgoingRequests };
  },
};

module.exports = { FriendModel };
