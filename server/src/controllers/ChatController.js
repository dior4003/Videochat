'use strict';

const { UserModel, publicUser } = require('../models/UserModel');
const { MessageModel } = require('../models/MessageModel');
const { CallModel } = require('../models/CallModel');
const { FriendModel } = require('../models/FriendModel');
const { isOnline, sendToUser } = require('./SocketController');
const { HttpError } = require('../utils/asyncHandler');

const ChatController = {
  async listChats(req, res) {
    const chats = (await MessageModel.getChatsForUser(req.user.id)).map((c) => ({
      ...c,
      peer: { ...c.peer, online: isOnline(c.peer.id) },
    }));
    res.json({ chats });
  },

  async getMessages(req, res) {
    const peer = await UserModel.findById(req.params.peerId);
    if (!peer) throw new HttpError(404, 'Suhbatdosh topilmadi');
    const messages = await MessageModel.getConversation(req.user.id, peer.id, {
      limit: req.query.limit,
      before: typeof req.query.before === 'string' ? req.query.before : null,
    });
    if (!(await FriendModel.isBlockedBetween(req.user.id, peer.id))) {
      sendToUser(peer.id, 'chat:read', { byUserId: req.user.id });
    }
    res.json({ peer: { ...publicUser(peer), online: isOnline(peer.id) }, messages });
  },

  async searchMessages(req, res) {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json({ results: [] });
    const results = await MessageModel.searchMessages(req.user.id, q);
    res.json({ results });
  },

  async listCalls(req, res) {
    const calls = (await CallModel.listForUser(req.user.id)).map((c) => ({
      ...c,
      peer: c.peer ? { ...c.peer, online: isOnline(c.peer.id) } : null,
    }));
    res.json({ calls });
  },
};

module.exports = { ChatController };
