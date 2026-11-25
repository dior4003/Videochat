'use strict';

const { verifyToken } = require('../auth');
const { UserModel, selfUser } = require('../models/UserModel');

function extractBearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Tokenni tekshiradi va foydalanuvchini qaytaradi.
 * Xato bo'lsa { error, status } qaytaradi.
 */
async function resolveUser(token, expectedScope = 'user') {
  const payload = verifyToken(token);
  if (!payload || !payload.userId || payload.scope !== expectedScope) {
    return { status: 401, error: 'Avtorizatsiya talab qilinadi' };
  }
  const user = await UserModel.findById(payload.userId);
  if (!user) return { status: 401, error: 'Foydalanuvchi topilmadi' };
  if ((payload.tv || 0) !== user.tokenVersion) {
    return { status: 401, error: 'Sessiya muddati tugagan, qayta kiring' };
  }
  if (user.isBanned) {
    return { status: 403, error: 'Sizning hisobingiz moderator tomonidan bloklangan' };
  }
  return { user };
}

async function authMiddleware(req, res, next) {
  try {
    const result = await resolveUser(extractBearer(req));
    if (result.error) return res.status(result.status).json({ error: result.error });
    req.user = result.user; // ichki obyekt (tokenVersion bilan); javobda selfUser() ishlating
    req.selfUser = selfUser(result.user);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authMiddleware, resolveUser, extractBearer };
