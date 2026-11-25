'use strict';

const crypto = require('crypto');
const { verifyPassword, burnPasswordCheck, signModToken } = require('../auth');
const { UserModel, selfUser } = require('../models/UserModel');
const { ModeratorModel } = require('../models/ModeratorModel');
const { disconnectUser } = require('./SocketController');
const { HttpError } = require('../utils/asyncHandler');
const { isString, isUuid, cleanText } = require('../utils/validators');

/** Doimiy vaqtda solishtirish (uzunlikni ham yashiradi). */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const ModeratorController = {
  async login(req, res) {
    const expectedKey = process.env.MOD_PASSKEY;
    if (!expectedKey || expectedKey.length < 16) {
      throw new HttpError(503, 'Moderator kirishi serverda sozlanmagan');
    }
    const { identifier, password, modPasskey } = req.body || {};
    if (!isString(identifier) || !isString(password) || !isString(modPasskey)) {
      throw new HttpError(400, 'Login, parol va maxfiy kalitni kiriting');
    }

    const record = await UserModel.findByIdentifier(identifier);
    const keyOk = safeEqual(modPasskey, expectedKey);
    const passOk = record && record.password_hash ? await verifyPassword(password, record.password_hash) : (await burnPasswordCheck(password), false);
    const isMod = record && (record.role === 'moderator' || record.role === 'admin');

    // Qaysi shart bajarilmaganini oshkor qilmaymiz
    if (!keyOk || !passOk || !isMod || record.is_banned) {
      throw new HttpError(403, 'Moderator ma’lumotlari noto‘g‘ri');
    }

    const user = await UserModel.findById(record.id);
    await ModeratorModel.audit(user.id, 'mod.login', user.id, req.ip);
    res.json({ modToken: signModToken(user), moderator: selfUser(user) });
  },

  async stats(_req, res) {
    res.json({ stats: await ModeratorModel.getStats() });
  },

  async listUsers(_req, res) {
    res.json({ users: await ModeratorModel.listAllUsers() });
  },

  async toggleBan(req, res) {
    const { isBanned } = req.body || {};
    if (typeof isBanned !== 'boolean') throw new HttpError(400, 'isBanned true/false bo‘lishi kerak');
    const target = await UserModel.findById(req.params.id);
    if (!target) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    if (target.id === req.moderator.id) throw new HttpError(400, 'O‘zingizni bloklay olmaysiz');
    // Rollar ierarxiyasi: moderator faqat oddiy foydalanuvchilarni bloklay oladi
    if (target.role !== 'user' && req.moderator.role !== 'admin') {
      throw new HttpError(403, 'Moderator va adminlarni faqat admin bloklay oladi');
    }
    if (target.role === 'admin' && req.moderator.role === 'admin') {
      throw new HttpError(403, 'Adminni bloklab bo‘lmaydi');
    }
    await ModeratorModel.setBan(target.id, isBanned);
    if (isBanned) disconnectUser(target.id, 4003, 'Banned');
    await ModeratorModel.audit(req.moderator.id, isBanned ? 'user.ban' : 'user.unban', target.id);
    res.json({ ok: true });
  },

  async listReports(_req, res) {
    res.json({ reports: await ModeratorModel.listReports() });
  },

  async resolveReport(req, res) {
    if (!(await ModeratorModel.resolveReport(req.params.id))) throw new HttpError(404, 'Shikoyat topilmadi');
    await ModeratorModel.audit(req.moderator.id, 'report.resolve', req.params.id);
    res.json({ ok: true });
  },

  async deleteMessage(req, res) {
    if (!(await ModeratorModel.deleteMessage(req.params.id))) throw new HttpError(404, 'Xabar topilmadi');
    await ModeratorModel.audit(req.moderator.id, 'message.delete', req.params.id);
    res.json({ ok: true });
  },

  async submitReport(req, res) {
    const { targetUserId, reason } = req.body || {};
    const cleanReason = cleanText(reason, 255);
    if (!isUuid(targetUserId) || !cleanReason || cleanReason.length < 3) {
      throw new HttpError(400, 'Shikoyat sababini (3-255 belgi) kiriting');
    }
    if (targetUserId === req.user.id) throw new HttpError(400, 'O‘zingizga shikoyat qila olmaysiz');
    if (!(await UserModel.findById(targetUserId))) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    if (await ModeratorModel.hasOpenReport(req.user.id, targetUserId)) {
      throw new HttpError(409, 'Bu foydalanuvchi bo‘yicha shikoyatingiz allaqachon ko‘rib chiqilmoqda');
    }
    const id = await ModeratorModel.createReport({ reporterId: req.user.id, targetUserId, reason: cleanReason });
    res.status(201).json({ id, ok: true });
  },
};

module.exports = { ModeratorController };
