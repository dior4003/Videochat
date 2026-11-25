'use strict';

const crypto = require('crypto');
const { getPool } = require('../config/db');
const { escapeLike } = require('../utils/validators');

const AVATAR_PALETTE = ['#6366F1', '#06B6D4', '#8B5CF6', '#EC4899', '#F59E0B', '#3B82F6', '#F43F5E'];

/** Ichki (to'liq) ko'rinish. Mijozga to'g'ridan-to'g'ri yubormang: selfUser()/publicUser() ishlating. */
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username || '',
    inviteCode: row.invite_code || '',
    phone: row.phone || '',
    displayName: row.display_name,
    bio: row.bio || '',
    avatarColor: row.avatar_color || '#6366F1',
    avatarUrl: row.avatar_url || null,
    role: row.role || 'user',
    isBanned: Boolean(row.is_banned),
    emailVerified: Boolean(row.email_verified),
    hasPassword: Boolean(row.password_hash),
    tokenVersion: Number(row.token_version || 0),
    createdAt: row.created_at,
    lastSeen: row.last_seen,
  };
}

/** Foydalanuvchining o'z profili (email, telefon bor; ichki maydonlarsiz). */
function selfUser(u) {
  if (!u) return null;
  const { tokenVersion, isBanned, ...rest } = u; // eslint-disable-line no-unused-vars
  return rest;
}

/** Boshqalarga ko'rsatiladigan minimal profil – email/telefon/rol YO'Q. */
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username || '',
    displayName: u.displayName,
    bio: u.bio || '',
    avatarColor: u.avatarColor || '#6366F1',
    avatarUrl: u.avatarUrl || null,
    lastSeen: u.lastSeen,
  };
}

/** SQL qatoridan (JOIN'dagi peer_* ustunlari) public profil. */
function publicFromPeerRow(r, prefix = 'peer_') {
  return {
    id: r[`${prefix}id`],
    username: r[`${prefix}username`] || '',
    displayName: r[`${prefix}display_name`],
    bio: r[`${prefix}bio`] || '',
    avatarColor: r[`${prefix}avatar_color`] || '#6366F1',
    avatarUrl: r[`${prefix}avatar_url`] || null,
    lastSeen: r[`${prefix}last_seen`],
  };
}

const UserModel = {
  async create({
    email, googleId = null, username = null, phone = null, displayName,
    avatarUrl = null, passwordHash = null, role = 'user', emailVerified = false,
  }) {
    const id = crypto.randomUUID();
    const inviteCode = crypto.randomBytes(8).toString('hex');
    const color = AVATAR_PALETTE[crypto.randomInt(AVATAR_PALETTE.length)];
    await getPool().query(
      `INSERT INTO users (id, email, google_id, username, invite_code, phone, display_name, avatar_color, avatar_url, password_hash, role, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        email.trim().toLowerCase(),
        googleId,
        username ? username.trim().toLowerCase() : null,
        inviteCode,
        phone || null,
        displayName.trim(),
        color,
        avatarUrl,
        passwordHash,
        role,
        emailVerified ? 1 : 0,
      ]
    );
    return this.findById(id);
  },

  /** Xom qator (password_hash bilan) – faqat autentifikatsiya uchun. */
  async findByIdentifier(identifier) {
    const norm = String(identifier || '').trim().toLowerCase();
    const [rows] = await getPool().query(`SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1`, [norm, norm]);
    return rows[0] || null;
  },

  async findByUsername(username) {
    const norm = String(username || '').trim().toLowerCase().replace(/^@/, '');
    const [rows] = await getPool().query(`SELECT * FROM users WHERE username = ? LIMIT 1`, [norm]);
    return mapUser(rows[0]);
  },

  async findByInviteCode(code) {
    const [rows] = await getPool().query(`SELECT * FROM users WHERE invite_code = ? LIMIT 1`, [String(code || '').trim()]);
    return mapUser(rows[0]);
  },

  async findByEmailOrGoogleId(email, googleId) {
    const normEmail = String(email || '').trim().toLowerCase();
    const [rows] = await getPool().query(
      `SELECT * FROM users WHERE google_id = ? OR email = ? ORDER BY (google_id = ?) DESC LIMIT 1`,
      [googleId, normEmail, googleId]
    );
    return rows[0] || null;
  },

  /**
   * Google orqali egalik isbotlangan email'ni akkauntga bog'laydi.
   * Agar akkaunt oldin parol bilan (email tasdiqlanmasdan) ochilgan bo'lsa, parol o'chiriladi
   * va barcha eski tokenlar bekor qilinadi (pre-hijacking himoyasi).
   */
  async claimWithGoogle(row, googleId, avatarUrl) {
    const unverifiedPasswordAccount = !row.email_verified && Boolean(row.password_hash);
    await getPool().query(
      `UPDATE users
          SET google_id = ?,
              avatar_url = COALESCE(avatar_url, ?),
              email_verified = 1,
              password_hash = ${unverifiedPasswordAccount ? 'NULL' : 'password_hash'},
              token_version = token_version + ${unverifiedPasswordAccount ? 1 : 0}
        WHERE id = ?`,
      [googleId, avatarUrl || null, row.id]
    );
    return { user: await this.findById(row.id), passwordReset: unverifiedPasswordAccount };
  },

  async findById(id) {
    const [rows] = await getPool().query(`SELECT * FROM users WHERE id = ? LIMIT 1`, [id]);
    return mapUser(rows[0]);
  },

  async getPasswordHash(id) {
    const [rows] = await getPool().query(`SELECT password_hash FROM users WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ? rows[0].password_hash : null;
  },

  async setPasswordHash(id, hash, { revokeTokens = false } = {}) {
    await getPool().query(
      `UPDATE users SET password_hash = ?, token_version = token_version + ? WHERE id = ?`,
      [hash, revokeTokens ? 1 : 0, id]
    );
  },

  async bumpTokenVersion(id) {
    await getPool().query(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [id]);
  },

  async isUsernameTaken(username, excludeUserId) {
    const [rows] = await getPool().query(
      `SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1`,
      [username.trim().toLowerCase(), excludeUserId || '']
    );
    return rows.length > 0;
  },

  async updateProfile(id, updates) {
    const fields = [];
    const values = [];
    if (updates.displayName !== undefined) { fields.push('display_name = ?'); values.push(updates.displayName); }
    if (updates.username !== undefined) { fields.push('username = ?'); values.push(updates.username ? updates.username.toLowerCase() : null); }
    if (updates.bio !== undefined) { fields.push('bio = ?'); values.push(updates.bio); }
    if (updates.phone !== undefined) { fields.push('phone = ?'); values.push(updates.phone || null); }
    if (updates.avatarColor !== undefined) { fields.push('avatar_color = ?'); values.push(updates.avatarColor); }
    if (fields.length > 0) {
      values.push(id);
      await getPool().query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    }
    return this.findById(id);
  },

  async updateLastSeen(id) {
    await getPool().query(`UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  },

  /** Katalog qidiruvi: faqat ism/username bo'yicha (email/telefon orqali qidirib bo'lmaydi). */
  async listOthers(excludeId, query = '', limit = 50) {
    const q = `%${escapeLike(String(query).trim().toLowerCase())}%`;
    const [rows] = await getPool().query(
      `SELECT u.* FROM users u
        WHERE u.id <> ? AND u.is_banned = 0
          AND (LOWER(u.display_name) LIKE ? OR LOWER(COALESCE(u.username, '')) LIKE ?)
          AND NOT EXISTS (
            SELECT 1 FROM friendships f
             WHERE f.status = 'blocked' AND f.user_id = u.id AND f.friend_id = ?
          )
        ORDER BY u.display_name ASC
        LIMIT ?`,
      [excludeId, q, q, excludeId, Math.min(Number(limit) || 50, 100)]
    );
    return rows.map(mapUser);
  },
};

module.exports = { UserModel, mapUser, selfUser, publicUser, publicFromPeerRow };
