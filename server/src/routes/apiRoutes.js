'use strict';

const express = require('express');
const { wrapController } = require('../utils/asyncHandler');
const { isUuid } = require('../utils/validators');
const { AuthController } = require('../controllers/AuthController');
const { UserController } = require('../controllers/UserController');
const { ChatController } = require('../controllers/ChatController');
const { MediaController } = require('../controllers/MediaController');
const { FriendController } = require('../controllers/FriendController');
const { ModeratorController } = require('../controllers/ModeratorController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { moderatorMiddleware } = require('../middleware/moderatorMiddleware');
const {
  authRateLimit, loginIdentifierLimit, modRateLimit, apiRateLimit, publicLookupLimit, uploadRateLimit,
} = require('../middleware/rateLimitMiddleware');

const auth = wrapController(AuthController);
const users = wrapController(UserController);
const chats = wrapController(ChatController);
const media = wrapController(MediaController);
const friends = wrapController(FriendController);
const mod = wrapController(ModeratorController);

const router = express.Router();

// :id / :peerId parametrlari UUID bo'lishi shart
for (const p of ['id', 'peerId']) {
  router.param(p, (req, res, next, value) => (isUuid(value) ? next() : res.status(400).json({ error: 'Noto‘g‘ri identifikator' })));
}

router.get('/health', (_req, res) => res.json({ ok: true, service: 'PulseLink Server' }));
router.get('/config', users.config);

// Auth
router.post('/auth/register', authRateLimit, auth.register);
router.post('/auth/login', authRateLimit, loginIdentifierLimit, auth.login);
router.post('/auth/google', authRateLimit, auth.googleLogin);

// Ochiq profil/taklif (enumeratsiyaga qarshi cheklangan)
router.get('/u/:username', publicLookupLimit, friends.publicProfileByUsername);
router.get('/invite/:code', publicLookupLimit, friends.lookupInvite);

// Mod kirishi (alohida, qattiq cheklov)
router.post('/mod/login', modRateLimit, mod.login);

// ---- Quyidagi barcha route'lar tizimga kirgan foydalanuvchi uchun ----
router.get('/ice', authMiddleware, apiRateLimit, users.ice);
router.post('/ws-ticket', authMiddleware, apiRateLimit, users.wsTicket);

router.get('/me', authMiddleware, apiRateLimit, users.getMe);
router.put('/me', authMiddleware, apiRateLimit, users.updateMe);
router.post('/me/password', authMiddleware, apiRateLimit, authRateLimit, users.changePassword);
router.post('/me/logout-all', authMiddleware, apiRateLimit, users.logoutAll);
router.get('/users', authMiddleware, apiRateLimit, users.listUsers);

router.get('/friends', authMiddleware, apiRateLimit, friends.list);
router.post('/friends/request', authMiddleware, apiRateLimit, friends.sendRequest);
router.post('/friends/block', authMiddleware, apiRateLimit, friends.block);
router.delete('/friends/block/:peerId', authMiddleware, apiRateLimit, friends.unblock);
router.post('/friends/:id/accept', authMiddleware, apiRateLimit, friends.accept);
router.delete('/friends/:peerId', authMiddleware, apiRateLimit, friends.remove);

router.get('/chats', authMiddleware, apiRateLimit, chats.listChats);
router.get('/chats/search', authMiddleware, apiRateLimit, chats.searchMessages);
router.get('/chats/:peerId/messages', authMiddleware, apiRateLimit, chats.getMessages);
router.get('/calls', authMiddleware, apiRateLimit, chats.listCalls);

router.post('/reports', authMiddleware, apiRateLimit, mod.submitReport);
router.post('/media', authMiddleware, uploadRateLimit, media.upload);
router.get('/media/:name/link', authMiddleware, apiRateLimit, media.link);

// ---- Moderator route'lari ----
router.get('/mod/stats', moderatorMiddleware, mod.stats);
router.get('/mod/users', moderatorMiddleware, mod.listUsers);
router.post('/mod/users/:id/ban', moderatorMiddleware, mod.toggleBan);
router.get('/mod/reports', moderatorMiddleware, mod.listReports);
router.post('/mod/reports/:id/resolve', moderatorMiddleware, mod.resolveReport);
router.delete('/mod/messages/:id', moderatorMiddleware, mod.deleteMessage);

module.exports = router;
