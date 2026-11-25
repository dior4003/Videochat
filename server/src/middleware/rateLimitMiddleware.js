'use strict';

/**
 * Oddiy xotiradagi "sliding window" cheklovchi. Eski yozuvlar avtomatik tozalanadi.
 * Ko'p nusxali (cluster) joylashtirishda Redis asosidagi yechimga almashtiring.
 */
function createRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (now > entry.resetAt) hits.delete(key);
  }, Math.max(windowMs, 30000)).unref();

  const middleware = (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: message || 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.' });
    }
    next();
  };
  middleware._hits = hits;
  return middleware;
}

const ipKey = (req) => req.ip || 'unknown';

// IP bo'yicha: login/ro'yxatdan o'tish
const authRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyFn: (req) => `auth:${ipKey(req)}`,
});

// Akkaunt bo'yicha (turli IP'lardan brute-force'ga qarshi)
const loginIdentifierLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `ident:${String((req.body && req.body.identifier) || '').trim().toLowerCase().slice(0, 200)}`,
  message: 'Bu akkaunt uchun urinishlar ko‘p. 15 daqiqadan so‘ng qayta urinib ko‘ring.',
});

// Moderator kirishi uchun qattiq cheklov
const modRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyFn: (req) => `mod:${ipKey(req)}`,
});

// Umumiy API (autentifikatsiyalangan foydalanuvchi yoki IP bo'yicha)
const apiRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  keyFn: (req) => `api:${(req.user && req.user.id) || ipKey(req)}`,
});

// Ochiq (autentifikatsiyasiz) qidiruvlar: profil/taklif kodi enumeratsiyasiga qarshi
const publicLookupLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyFn: (req) => `pub:${ipKey(req)}`,
});

const uploadRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyFn: (req) => `up:${(req.user && req.user.id) || ipKey(req)}`,
  message: 'Juda ko‘p fayl yuklandi. Keyinroq urinib ko‘ring.',
});

module.exports = {
  createRateLimiter,
  authRateLimit,
  loginIdentifierLimit,
  modRateLimit,
  apiRateLimit,
  publicLookupLimit,
  uploadRateLimit,
};
