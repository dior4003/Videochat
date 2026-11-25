'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const PHONE_RE = /^[+0-9()\-\s]{5,20}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIA_URL_RE = /^\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|jpeg|webp|gif|pdf|txt|zip))$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'support', 'moderator', 'mod', 'system',
  'pulselink', 'help', 'security', 'staff', 'official', 'null', 'undefined',
]);

const MESSAGE_TYPES = new Set(['text', 'image', 'file']);
const MAX_MESSAGE_LENGTH = 4000;

const isString = (v) => typeof v === 'string';

function normalizeEmail(email) {
  if (!isString(email)) return null;
  const e = email.trim().toLowerCase();
  if (e.length > 190 || !EMAIL_RE.test(e)) return null;
  return e;
}

function validatePassword(password) {
  if (!isString(password)) return 'Parol matn bo‘lishi kerak';
  if (password.length < 8) return 'Parol kamida 8 ta belgidan iborat bo‘lishi kerak';
  if (password.length > 128) return 'Parol 128 ta belgidan oshmasligi kerak';
  return null;
}

function validateUsername(username) {
  if (!isString(username) || !USERNAME_RE.test(username.trim())) {
    return 'Username 3-24 ta harf, raqam yoki _ dan iborat bo‘lishi kerak';
  }
  if (RESERVED_USERNAMES.has(username.trim().toLowerCase())) {
    return 'Bu username band qilingan';
  }
  return null;
}

function cleanText(value, max) {
  if (!isString(value)) return null;
  // eslint-disable-next-line no-control-regex
  const v = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return v.length > max ? null : v;
}

function isValidPhone(phone) {
  return isString(phone) && PHONE_RE.test(phone.trim());
}

function isUuid(v) {
  return isString(v) && UUID_RE.test(v);
}

/** Returns stored file name ("<uuid>.<ext>") for a safe media URL, otherwise null. */
function parseMediaUrl(url) {
  if (!isString(url)) return null;
  const m = MEDIA_URL_RE.exec(url);
  return m ? m[1] : null;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Verifies that the file's magic bytes agree with its extension.
 * Returns { ok, mime }.
 */
function sniffFile(buffer, ext) {
  const startsWith = (...bytes) => bytes.every((b, i) => buffer[i] === b);
  switch (ext) {
    case '.png':
      return { ok: startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), mime: 'image/png' };
    case '.jpg':
    case '.jpeg':
      return { ok: startsWith(0xff, 0xd8, 0xff), mime: 'image/jpeg' };
    case '.gif':
      return { ok: buffer.slice(0, 6).toString('latin1').startsWith('GIF8'), mime: 'image/gif' };
    case '.webp':
      return {
        ok: buffer.slice(0, 4).toString('latin1') === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP',
        mime: 'image/webp',
      };
    case '.pdf':
      return { ok: buffer.slice(0, 5).toString('latin1') === '%PDF-', mime: 'application/pdf' };
    case '.zip':
      return { ok: startsWith(0x50, 0x4b, 0x03, 0x04) || startsWith(0x50, 0x4b, 0x05, 0x06), mime: 'application/zip' };
    case '.txt': {
      const sample = buffer.slice(0, 8000);
      return { ok: !sample.includes(0x00), mime: 'text/plain; charset=utf-8' };
    }
    default:
      return { ok: false, mime: 'application/octet-stream' };
  }
}

module.exports = {
  MESSAGE_TYPES,
  MAX_MESSAGE_LENGTH,
  RESERVED_USERNAMES,
  isString,
  normalizeEmail,
  validatePassword,
  validateUsername,
  cleanText,
  isValidPhone,
  isUuid,
  parseMediaUrl,
  escapeLike,
  sniffFile,
};
