'use strict';

const { resolveUser, extractBearer } = require('./authMiddleware');

async function moderatorMiddleware(req, res, next) {
  try {
    const result = await resolveUser(extractBearer(req), 'moderator');
    if (result.error) {
      return res.status(result.status === 401 ? 403 : result.status).json({ error: 'Moderator autentifikatsiyasi talab qilinadi' });
    }
    const { user } = result;
    if (user.role !== 'moderator' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Moderator huquqi yo‘q' });
    }
    req.moderator = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { moderatorMiddleware };
