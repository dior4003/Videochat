'use strict';

const { UserModel, selfUser, publicUser } = require('../models/UserModel');
const { isOnline, disconnectUser } = require('./SocketController');
const { hashPassword, verifyPassword, signUserToken, issueWsTicket } = require('../auth');
const {
  validateUsername, validatePassword, cleanText, isValidPhone, isString,
} = require('../utils/validators');
const { HttpError } = require('../utils/asyncHandler');

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function getIceServers({ includeTurn }) {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (!includeTurn || !process.env.TURN_URL) return servers;

  const turn = { urls: process.env.TURN_URL };
  if (process.env.TURN_SECRET) {
    // coturn "use-auth-secret" (TURN REST API): vaqtinchalik login/parol
    const crypto = require('crypto');
    const expiry = Math.floor(Date.now() / 1000) + 60 * 60;
    turn.username = String(expiry);
    turn.credential = crypto.createHmac('sha1', process.env.TURN_SECRET).update(turn.username).digest('base64');
  } else if (process.env.TURN_USERNAME) {
    turn.username = process.env.TURN_USERNAME;
    turn.credential = process.env.TURN_CREDENTIAL || '';
  }
  servers.push(turn);
  return servers;
}

const UserController = {
  /** Ochiq konfiguratsiya: maxfiy ma'lumot yo'q (TURN faqat /api/ice orqali, login qilinganlarga). */
  config(_req, res) {
    res.json({
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      database: 'MySQL/MariaDB',
      iceServers: getIceServers({ includeTurn: false }),
    });
  },

  ice(_req, res) {
    res.json({ iceServers: getIceServers({ includeTurn: true }) });
  },

  wsTicket(req, res) {
    res.json({ ticket: issueWsTicket(req.user.id), expiresInSec: 30 });
  },

  getMe(req, res) {
    res.json({ user: { ...req.selfUser, online: true } });
  },

  async updateMe(req, res) {
    const body = req.body || {};
    const updates = {};

    if (body.displayName !== undefined) {
      const v = cleanText(body.displayName, 60);
      if (!v) throw new HttpError(400, 'Ism 1-60 ta belgidan iborat bo‘lishi kerak');
      updates.displayName = v;
    }
    if (body.username !== undefined) {
      const raw = isString(body.username) ? body.username.trim() : '';
      if (raw) {
        const err = validateUsername(raw);
        if (err) throw new HttpError(400, err);
        if (await UserModel.isUsernameTaken(raw, req.user.id)) throw new HttpError(409, 'Bu username allaqachon band');
      }
      updates.username = raw;
    }
    if (body.bio !== undefined) {
      const v = cleanText(body.bio, 200);
      if (v === null) throw new HttpError(400, 'Bio 200 belgidan oshmasligi kerak');
      updates.bio = v;
    }
    if (body.phone !== undefined) {
      const raw = isString(body.phone) ? body.phone.trim() : '';
      if (raw && !isValidPhone(raw)) throw new HttpError(400, 'Telefon raqami noto‘g‘ri formatda');
      updates.phone = raw;
    }
    if (body.avatarColor !== undefined) {
      if (!isString(body.avatarColor) || !COLOR_RE.test(body.avatarColor.trim())) {
        throw new HttpError(400, 'Rang formati noto‘g‘ri (#RRGGBB)');
      }
      updates.avatarColor = body.avatarColor.trim();
    }

    const updated = await UserModel.updateProfile(req.user.id, updates);
    res.json({ user: { ...selfUser(updated), online: isOnline(updated.id) } });
  },

  /** Parolni o'zgartirish/o'rnatish. Barcha eski sessiyalar bekor qilinadi, yangi token qaytariladi. */
  async changePassword(req, res) {
    const { currentPassword, newPassword } = req.body || {};
    const pwError = validatePassword(newPassword);
    if (pwError) throw new HttpError(400, pwError);

    const existingHash = await UserModel.getPasswordHash(req.user.id);
    if (existingHash) {
      if (!isString(currentPassword) || !(await verifyPassword(currentPassword, existingHash))) {
        throw new HttpError(401, 'Joriy parol noto‘g‘ri');
      }
    }
    await UserModel.setPasswordHash(req.user.id, await hashPassword(newPassword), { revokeTokens: true });
    disconnectUser(req.user.id, 4002, 'Password changed');
    const fresh = await UserModel.findById(req.user.id);
    res.json({ ok: true, token: signUserToken(fresh) });
  },

  /** Barcha qurilmalardan chiqish. */
  async logoutAll(req, res) {
    await UserModel.bumpTokenVersion(req.user.id);
    disconnectUser(req.user.id, 4002, 'Logged out');
    res.json({ ok: true });
  },

  async listUsers(req, res) {
    const users = (await UserModel.listOthers(req.user.id, String(req.query.q || '').slice(0, 64))).map((u) => ({
      ...publicUser(u),
      online: isOnline(u.id),
    }));
    res.json({ users });
  },
};

module.exports = { UserController };
