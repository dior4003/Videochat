'use strict';

const { UserModel, publicUser } = require('../models/UserModel');
const { FriendModel } = require('../models/FriendModel');
const { isOnline, sendToUser } = require('./SocketController');
const { HttpError } = require('../utils/asyncHandler');
const { isUuid, isString } = require('../utils/validators');

const FriendController = {
  async list(req, res) {
    const data = await FriendModel.listForUser(req.user.id);
    const withOnline = (arr) => arr.map((x) => ({ ...x, peer: { ...x.peer, online: isOnline(x.peer.id) } }));
    res.json({
      friends: withOnline(data.friends),
      incomingRequests: withOnline(data.incomingRequests),
      outgoingRequests: withOnline(data.outgoingRequests),
    });
  },

  async sendRequest(req, res) {
    const { targetUserId, username, inviteCode } = req.body || {};
    let target = null;
    if (targetUserId !== undefined) {
      if (!isUuid(targetUserId)) throw new HttpError(400, 'Noto‘g‘ri foydalanuvchi identifikatori');
      target = await UserModel.findById(targetUserId);
    } else if (isString(username)) target = await UserModel.findByUsername(username);
    else if (isString(inviteCode)) target = await UserModel.findByInviteCode(inviteCode);

    if (!target || target.isBanned) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    let result;
    try {
      result = await FriendModel.sendRequest(req.user.id, target.id);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    sendToUser(target.id, 'friend:update', { fromUserId: req.user.id });
    res.status(201).json({ ...result, target: publicUser(target) });
  },

  async accept(req, res) {
    const ok = await FriendModel.acceptRequest(req.params.id, req.user.id);
    if (!ok) throw new HttpError(404, 'So‘rov topilmadi');
    res.json({ ok: true });
  },

  async remove(req, res) {
    await FriendModel.removeFriend(req.user.id, req.params.peerId);
    res.json({ ok: true });
  },

  async block(req, res) {
    const { peerId } = req.body || {};
    if (!isUuid(peerId)) throw new HttpError(400, 'Noto‘g‘ri foydalanuvchi identifikatori');
    if (!(await UserModel.findById(peerId))) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    try {
      await FriendModel.block(req.user.id, peerId);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    res.json({ ok: true });
  },

  async unblock(req, res) {
    await FriendModel.unblock(req.user.id, req.params.peerId);
    res.json({ ok: true });
  },

  async publicProfileByUsername(req, res) {
    const user = await UserModel.findByUsername(req.params.username);
    if (!user || user.isBanned) throw new HttpError(404, 'Profil topilmadi');
    res.json({ profile: { ...publicUser(user), online: isOnline(user.id) } });
  },

  async lookupInvite(req, res) {
    const user = await UserModel.findByInviteCode(req.params.code);
    if (!user || user.isBanned) throw new HttpError(404, 'Taklif havolasi yaroqsiz');
    res.json({ inviter: { ...publicUser(user), online: isOnline(user.id) } });
  },
};

module.exports = { FriendController };
