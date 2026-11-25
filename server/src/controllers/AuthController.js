'use strict';

const {
  hashPassword, verifyPassword, needsRehash, burnPasswordCheck, signUserToken,
} = require('../auth');
const { UserModel, selfUser } = require('../models/UserModel');
const {
  normalizeEmail, validatePassword, validateUsername, cleanText, isValidPhone, isString,
} = require('../utils/validators');
const { HttpError } = require('../utils/asyncHandler');

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

const AuthController = {
  async register(req, res) {
    const { email: rawEmail, username, phone, displayName, password } = req.body || {};

    const email = normalizeEmail(rawEmail);
    if (!email) throw new HttpError(400, 'To‘g‘ri email manzilini kiriting');

    const pwError = validatePassword(password);
    if (pwError) throw new HttpError(400, pwError);

    let cleanUsername = null;
    if (username !== undefined && username !== null && username !== '') {
      const uError = validateUsername(username);
      if (uError) throw new HttpError(400, uError);
      cleanUsername = username.trim();
    }

    let cleanPhone = null;
    if (phone) {
      if (!isValidPhone(phone)) throw new HttpError(400, 'Telefon raqami noto‘g‘ri formatda');
      cleanPhone = phone.trim();
    }

    const name = displayName === undefined || displayName === '' ? email.split('@')[0] : cleanText(displayName, 60);
    if (!name) throw new HttpError(400, 'Ism 1-60 ta belgidan iborat bo‘lishi kerak');

    if (await UserModel.findByIdentifier(email)) throw new HttpError(409, 'Bu email allaqachon ro‘yxatdan o‘tgan');
    if (cleanUsername && (await UserModel.isUsernameTaken(cleanUsername, ''))) {
      throw new HttpError(409, 'Bu username allaqachon band');
    }

    const user = await UserModel.create({
      email,
      username: cleanUsername,
      phone: cleanPhone,
      displayName: name,
      passwordHash: await hashPassword(password),
      emailVerified: false,
    });
    res.status(201).json({ token: signUserToken(user), user: selfUser(user) });
  },

  async login(req, res) {
    const { identifier, password } = req.body || {};
    if (!isString(identifier) || !isString(password) || !identifier || !password || password.length > 128) {
      throw new HttpError(400, 'Email/username va parolni kiriting');
    }
    const record = await UserModel.findByIdentifier(identifier);
    if (!record || !record.password_hash) {
      await burnPasswordCheck(password); // vaqt farqi orqali akkaunt mavjudligini bildirmaslik uchun
      throw new HttpError(401, 'Email/username yoki parol noto‘g‘ri');
    }
    if (!(await verifyPassword(password, record.password_hash))) {
      throw new HttpError(401, 'Email/username yoki parol noto‘g‘ri');
    }
    if (record.is_banned) throw new HttpError(403, 'Sizning hisobingiz moderator tomonidan bloklangan');

    if (needsRehash(record.password_hash)) {
      await UserModel.setPasswordHash(record.id, await hashPassword(password)); // PBKDF2 -> scrypt
    }
    const user = await UserModel.findById(record.id);
    res.json({ token: signUserToken(user), user: selfUser(user) });
  },

  async googleLogin(req, res) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new HttpError(503, 'Google orqali kirish serverda sozlanmagan');

    const { idToken } = req.body || {};
    if (!isString(idToken) || idToken.length > 4096) throw new HttpError(400, 'Google ID token yuborilmadi');

    let info;
    try {
      const verifyRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!verifyRes.ok) throw new HttpError(401, 'Google tokeni tasdiqlanmadi');
      info = await verifyRes.json();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, 'Google xizmatiga ulanib bo‘lmadi');
    }

    if (info.aud !== clientId) throw new HttpError(401, 'Google Client ID mos kelmadi');
    if (!GOOGLE_ISSUERS.has(info.iss)) throw new HttpError(401, 'Google tokeni emitenti noto‘g‘ri');
    if (!info.sub || !info.email || String(info.email_verified) !== 'true') {
      throw new HttpError(401, 'Google email tasdiqlanmagan');
    }
    const email = normalizeEmail(info.email);
    if (!email) throw new HttpError(401, 'Google email noto‘g‘ri');

    const existing = await UserModel.findByEmailOrGoogleId(email, info.sub);
    let user;
    let notice = null;
    if (!existing) {
      user = await UserModel.create({
        email,
        googleId: info.sub,
        displayName: cleanText(info.name || '', 60) || email.split('@')[0],
        avatarUrl: isString(info.picture) && info.picture.startsWith('https://') ? info.picture.slice(0, 500) : null,
        emailVerified: true,
      });
    } else if (existing.google_id && existing.google_id !== info.sub) {
      throw new HttpError(409, 'Bu email boshqa Google akkauntiga bog‘langan');
    } else if (existing.is_banned) {
      throw new HttpError(403, 'Sizning hisobingiz moderator tomonidan bloklangan');
    } else if (existing.google_id === info.sub) {
      user = await UserModel.findById(existing.id);
    } else {
      const claimed = await UserModel.claimWithGoogle(existing, info.sub, info.picture);
      user = claimed.user;
      if (claimed.passwordReset) {
        notice = 'Xavfsizlik uchun avval o‘rnatilgan parol bekor qilindi. Kerak bo‘lsa profilda yangi parol o‘rnating.';
      }
    }
    res.json({ token: signUserToken(user), user: selfUser(user), notice });
  },
};

module.exports = { AuthController };
