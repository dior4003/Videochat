'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const USER_TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 kun
const MOD_TOKEN_TTL_SEC = 60 * 60; // 1 soat
const MEDIA_TOKEN_TTL_SEC = 120; // 2 daqiqa
const WS_TICKET_TTL_MS = 30 * 1000;

// scrypt parametrlari (OWASP tavsiyasi: N>=2^15, r=8, p=1)
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

let cachedSecret = null;

function getSecret() {
  if (cachedSecret) return cachedSecret;
  const s = process.env.JWT_SECRET;
  const weak = !s || s.length < 32 || /change[-_ ]?this|change[-_ ]?in[-_ ]?production/i.test(s);
  if (!weak) {
    cachedSecret = s;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET o‘rnatilmagan yoki juda zaif (kamida 32 belgi, tasodifiy bo‘lishi shart).');
  }
  console.warn('[auth] JWT_SECRET o‘rnatilmagan: vaqtinchalik tasodifiy kalit ishlatilmoqda (server qayta ishga tushsa tokenlar bekor bo‘ladi).');
  cachedSecret = crypto.randomBytes(48).toString('hex');
  return cachedSecret;
}

/** Server ishga tushishida chaqiring: production'da sozlama xatosi bo'lsa darhol to'xtaydi. */
function assertAuthConfig() {
  getSecret();
}

/* ---------------------------- Parol xeshlash ---------------------------- */

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false;

  if (storedHash.startsWith('scrypt$')) {
    const [, n, r, p, saltHex, keyHex] = storedHash.split('$');
    if (!saltHex || !keyHex) return false;
    const key = Buffer.from(keyHex, 'hex');
    const derived = await scrypt(password, Buffer.from(saltHex, 'hex'), key.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
    return derived.length === key.length && crypto.timingSafeEqual(derived, key);
  }

  // Eski (v1.0) PBKDF2 xeshlari: "salt:hex"
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = await promisify(crypto.pbkdf2)(password, salt, 100000, 32, 'sha256');
  const keyBuf = Buffer.from(key, 'hex');
  return derived.length === keyBuf.length && crypto.timingSafeEqual(derived, keyBuf);
}

function needsRehash(storedHash) {
  return typeof storedHash === 'string' && !storedHash.startsWith('scrypt$');
}

let dummyHashPromise = null;
/** Mavjud bo'lmagan foydalanuvchi uchun ham bir xil vaqt sarflash (timing orqali enumeratsiyaga qarshi). */
async function burnPasswordCheck(password) {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(String(password || ''), await dummyHashPromise);
}

/* ------------------------------- Tokenlar -------------------------------- */

const b64u = {
  enc: (input) => Buffer.from(input).toString('base64url'),
  dec: (input) => Buffer.from(input, 'base64url').toString('utf8'),
};

function sign(data) {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

function signToken(payload, ttlSec = USER_TOKEN_TTL_SEC) {
  const header = b64u.enc(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64u.enc(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(sign(`${header}.${body}`));
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const head = JSON.parse(b64u.dec(header));
    if (head.alg !== 'HS256') return null;
    const decoded = JSON.parse(b64u.dec(body));
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

const signUserToken = (user) => signToken({ userId: user.id, tv: user.tokenVersion || 0, scope: 'user' }, USER_TOKEN_TTL_SEC);
const signModToken = (user) => signToken({ userId: user.id, tv: user.tokenVersion || 0, scope: 'moderator', role: user.role }, MOD_TOKEN_TTL_SEC);
const signMediaToken = (userId, file) => signToken({ userId, file, scope: 'media' }, MEDIA_TOKEN_TTL_SEC);

/* ----------------------- WebSocket bir martalik bilet --------------------- */

const wsTickets = new Map();

function issueWsTicket(userId) {
  const ticket = crypto.randomBytes(24).toString('hex');
  wsTickets.set(ticket, { userId, exp: Date.now() + WS_TICKET_TTL_MS });
  return ticket;
}

function consumeWsTicket(ticket) {
  if (typeof ticket !== 'string') return null;
  const entry = wsTickets.get(ticket);
  if (!entry) return null;
  wsTickets.delete(ticket);
  return entry.exp > Date.now() ? entry.userId : null;
}

setInterval(() => {
  const now = Date.now();
  for (const [t, e] of wsTickets) if (e.exp <= now) wsTickets.delete(t);
}, 60 * 1000).unref();

module.exports = {
  assertAuthConfig,
  hashPassword,
  verifyPassword,
  needsRehash,
  burnPasswordCheck,
  signToken,
  verifyToken,
  signUserToken,
  signModToken,
  signMediaToken,
  issueWsTicket,
  consumeWsTicket,
};
