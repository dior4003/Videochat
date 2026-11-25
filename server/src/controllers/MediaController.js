'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { signMediaToken, verifyToken } = require('../auth');
const { resolveUser, extractBearer } = require('../middleware/authMiddleware');
const { UploadModel } = require('../models/UploadModel');
const { MessageModel } = require('../models/MessageModel');
const { HttpError } = require('../utils/asyncHandler');
const { sniffFile, isString } = require('../utils/validators');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o750 });

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.txt', '.zip']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MAX_BYTES = 5 * 1024 * 1024;
const STORED_NAME_RE = /^[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif|pdf|txt|zip)$/;

async function canAccess(userId, upload) {
  if (upload.owner_id === userId) return true;
  return MessageModel.userCanSeeMedia(userId, `/uploads/${upload.name}`);
}

const MediaController = {
  uploadsDir,

  async upload(req, res) {
    const { fileName, base64 } = req.body || {};
    if (!isString(fileName) || !isString(base64) || !fileName || !base64) {
      throw new HttpError(400, 'Fayl ma’lumoti yetishmayapti');
    }
    const ext = path.extname(fileName).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      throw new HttpError(400, 'Ruxsat etilmagan fayl turi. Faqat PNG, JPG, WEBP, GIF, PDF, TXT, ZIP yuklash mumkin.');
    }

    const cleanBase64 = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
    if (cleanBase64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) {
      throw new HttpError(413, 'Fayl hajmi 5 MB dan oshmasligi kerak');
    }
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length === 0) throw new HttpError(400, 'Fayl bo‘sh');
    if (buffer.length > MAX_BYTES) throw new HttpError(413, 'Fayl hajmi 5 MB dan oshmasligi kerak');

    const { ok, mime } = sniffFile(buffer, ext);
    if (!ok) throw new HttpError(400, 'Fayl mazmuni kengaytmaga mos kelmaydi');

    const used = await UploadModel.usedBytes(req.user.id);
    if (used + buffer.length > UploadModel.USER_QUOTA_BYTES) {
      throw new HttpError(413, 'Fayl yuklash kvotasi tugadi');
    }

    const storedName = `${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(uploadsDir, storedName);
    await fs.promises.writeFile(fullPath, buffer, { flag: 'wx', mode: 0o640 });
    try {
      await UploadModel.create({
        name: storedName,
        ownerId: req.user.id,
        originalName: path.basename(fileName),
        mime,
        size: buffer.length,
      });
    } catch (err) {
      await fs.promises.unlink(fullPath).catch(() => {});
      throw err;
    }

    res.status(201).json({
      url: `/uploads/${storedName}`,
      type: IMAGE_EXTS.has(ext) ? 'image' : 'file',
      fileName: path.basename(fileName),
    });
  },

  /** Brauzer/Linking.openURL uchun qisqa muddatli (2 daqiqa) imzolangan havola. */
  async link(req, res) {
    const name = req.params.name;
    if (!STORED_NAME_RE.test(name)) throw new HttpError(404, 'Fayl topilmadi');
    const upload = await UploadModel.find(name);
    if (!upload || !(await canAccess(req.user.id, upload))) throw new HttpError(404, 'Fayl topilmadi');
    res.json({ url: `/uploads/${name}?mt=${encodeURIComponent(signMediaToken(req.user.id, name))}`, expiresInSec: 120 });
  },

  /** GET /uploads/:name — Bearer sarlavhasi (+ruxsat tekshiruvi) yoki qisqa muddatli ?mt= token bilan. */
  async serve(req, res) {
    const name = req.params.name;
    if (!STORED_NAME_RE.test(name)) throw new HttpError(404, 'Fayl topilmadi');

    const upload = await UploadModel.find(name);
    if (!upload) throw new HttpError(404, 'Fayl topilmadi');

    if (typeof req.query.mt === 'string') {
      const payload = verifyToken(req.query.mt);
      if (!payload || payload.scope !== 'media' || payload.file !== name) throw new HttpError(401, 'Havola yaroqsiz yoki muddati tugagan');
    } else {
      const result = await resolveUser(extractBearer(req));
      if (result.error) throw new HttpError(result.status, result.error);
      if (!(await canAccess(result.user.id, upload))) throw new HttpError(404, 'Fayl topilmadi');
    }

    const isImage = IMAGE_EXTS.has(path.extname(name));
    res.setHeader('Content-Type', upload.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const safeName = encodeURIComponent(upload.original_name).replace(/['()]/g, escape);
    res.setHeader('Content-Disposition', `${isImage ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`);
    res.sendFile(path.join(uploadsDir, name), { dotfiles: 'deny', cacheControl: false }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fayl topilmadi' });
    });
  },
};

module.exports = { MediaController };
