'use strict';

const crypto = require('crypto');
const { verifyToken, consumeWsTicket } = require('../auth');
const { UserModel, publicUser } = require('../models/UserModel');
const { MessageModel } = require('../models/MessageModel');
const { CallModel } = require('../models/CallModel');
const { FriendModel } = require('../models/FriendModel');
const { UploadModel } = require('../models/UploadModel');
const { MESSAGE_TYPES, MAX_MESSAGE_LENGTH, isUuid, isString, parseMediaUrl } = require('../utils/validators');

const CALL_RING_TIMEOUT_MS = 40000;
const DISCONNECT_GRACE_MS = 12000;
const MAX_SOCKETS_PER_USER = 5;
const HEARTBEAT_MS = 30000;
const MAX_SIGNAL_BYTES = 32 * 1024;

const onlineSockets = new Map();
const activeCalls = new Map();
const disconnectTimers = new Map();

function isOnline(userId) {
  const set = onlineSockets.get(userId);
  return Boolean(set && set.size > 0);
}

function isUserInCall(userId) {
  for (const s of activeCalls.values()) if (s.callerId === userId || s.receiverId === userId) return true;
  return false;
}

function sendToUser(userId, event, data) {
  const sockets = onlineSockets.get(userId);
  if (!sockets) return false;
  const payload = JSON.stringify({ event, data });
  let sent = false;
  for (const ws of sockets) {
    if (ws.readyState === 1) {
      ws.send(payload);
      sent = true;
    }
  }
  return sent;
}

/** Online holati faqat do'stlarga yuboriladi (hammaga broadcast qilinmaydi). */
async function broadcastPresence(userId, online) {
  let friendIds = [];
  try {
    friendIds = await FriendModel.friendIds(userId);
  } catch (err) {
    console.error('[ws] presence friendIds xatosi:', err.message);
    return;
  }
  const data = { userId, online, lastSeen: new Date().toISOString() };
  for (const id of friendIds) sendToUser(id, 'presence:update', data);
}

function isAuthorizedCallPeer(callId, userId, targetId) {
  const session = activeCalls.get(callId);
  if (!session) return false;
  return (
    (session.callerId === userId && session.receiverId === targetId) ||
    (session.receiverId === userId && session.callerId === targetId)
  );
}

async function endCall(callId, status, { notifyBoth = false, fromId = null, reasonForCaller, reasonForReceiver } = {}) {
  const session = activeCalls.get(callId);
  if (!session) return null;
  clearTimeout(session.timeoutHandle);
  activeCalls.delete(callId);
  const durationSec = session.answeredAt ? Math.max(1, Math.round((Date.now() - session.answeredAt) / 1000)) : 0;
  const finalStatus = status === 'auto' ? (session.answeredAt ? 'ended' : 'missed') : status;
  await CallModel.update(callId, { status: finalStatus, durationSec, endedAt: new Date().toISOString() });
  return { session, durationSec, notifyBoth, fromId, reasonForCaller, reasonForReceiver };
}

/** Foydalanuvchining barcha ulanishlarini uzadi va qo'ng'iroqlarini tugatadi (ban, parol o'zgarishi va h.k.). */
function disconnectUser(userId, code = 4000, reason = 'Disconnected') {
  const sockets = onlineSockets.get(userId);
  if (sockets) for (const ws of sockets) ws.close(code, reason);
  for (const [callId, s] of [...activeCalls.entries()]) {
    if (s.callerId !== userId && s.receiverId !== userId) continue;
    const peer = s.callerId === userId ? s.receiverId : s.callerId;
    endCall(callId, 'auto')
      .then(() => sendToUser(peer, 'call:hangup', { callId, fromId: userId }))
      .catch((e) => console.error('[ws] disconnectUser endCall:', e.message));
  }
}

async function authenticate(req) {
  const url = new URL(req.url, 'http://localhost');
  let userId = null;

  const ticket = url.searchParams.get('ticket');
  if (ticket) {
    userId = consumeWsTicket(ticket);
  } else {
    const header = req.headers.authorization || '';
    const payload = header.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
    if (payload && payload.scope === 'user' && payload.userId) {
      const u = await UserModel.findById(payload.userId);
      if (u && (payload.tv || 0) === u.tokenVersion) userId = u.id;
    }
  }
  if (!userId) return null;
  const user = await UserModel.findById(userId);
  return user && !user.isBanned ? user : null;
}

async function canInteract(userId, otherId) {
  if (!isUuid(otherId) || otherId === userId) return null;
  const other = await UserModel.findById(otherId);
  if (!other || other.isBanned) return null;
  if (await FriendModel.isBlockedBetween(userId, otherId)) return null;
  return other;
}

function attachWebSocket(wss) {
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', async (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', (e) => console.error('[ws] socket xatosi:', e.message));

    // Autentifikatsiya tugaguncha kelgan xabarlarni yo'qotmaslik uchun listener'ni darhol qo'shamiz
    let user = null;
    const ready = (async () => {
      try {
        user = await authenticate(req);
      } catch (err) {
        console.error('[ws] autentifikatsiya xatosi:', err.message);
      }
      if (!user) { ws.close(4001, 'Unauthorized'); return; }
      if ((onlineSockets.get(user.id) || new Set()).size >= MAX_SOCKETS_PER_USER) {
        ws.close(4008, 'Too many connections');
        user = null;
        return;
      }
      ws.userId = user.id;
      ws.rateWindow = { count: 0, resetAt: Date.now() + 10000 };
      if (disconnectTimers.has(user.id)) {
        clearTimeout(disconnectTimers.get(user.id));
        disconnectTimers.delete(user.id);
      }
      const wasOnline = isOnline(user.id);
      if (!onlineSockets.has(user.id)) onlineSockets.set(user.id, new Set());
      onlineSockets.get(user.id).add(ws);
      if (!wasOnline) broadcastPresence(user.id, true);
    })();

    ws.on('message', async (raw) => {
      await ready;
      if (!user) return;
      try {
        await handleMessage(ws, user, raw);
      } catch (err) {
        // Hech qanday xato jarayonni o'chirmasligi kerak
        console.error(`[ws] ${user.id} handler xatosi:`, err.message);
        if (ws.readyState === 1) ws.send(JSON.stringify({ event: 'error', data: { message: 'Ichki xatolik' } }));
      }
    });

    ws.on('close', async () => {
      await ready.catch(() => {});
      if (!user) return;
      const uid = user.id;
      const set = onlineSockets.get(uid);
      if (!set) return;
      set.delete(ws);
      if (set.size > 0) return;
      onlineSockets.delete(uid);
      try {
        await UserModel.updateLastSeen(uid);
      } catch (e) {
        console.error('[ws] lastSeen xatosi:', e.message);
      }
      broadcastPresence(uid, false);

      // Aloqa uzilganda qo'ng'iroqni 12 soniya kutib tugatish (ICE restart uchun)
      const timer = setTimeout(async () => {
        disconnectTimers.delete(uid);
        if (isOnline(uid)) return;
        for (const [callId, s] of [...activeCalls.entries()]) {
          if (s.callerId !== uid && s.receiverId !== uid) continue;
          try {
            await endCall(callId, 'auto');
            sendToUser(s.callerId === uid ? s.receiverId : s.callerId, 'call:hangup', { callId, fromId: uid });
          } catch (e) {
            console.error('[ws] disconnect cleanup xatosi:', e.message);
          }
        }
      }, DISCONNECT_GRACE_MS);
      timer.unref();
      disconnectTimers.set(uid, timer);
    });
  });
}

async function handleMessage(ws, user, raw) {
  const now = Date.now();
  if (now > ws.rateWindow.resetAt) ws.rateWindow = { count: 0, resetAt: now + 10000 };
  ws.rateWindow.count += 1;
  if (ws.rateWindow.count > 120) {
    return ws.send(JSON.stringify({ event: 'error', data: { message: 'Juda ko‘p so‘rov' } }));
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.event !== 'string') return;
  const event = parsed.event;
  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};

  switch (event) {
    case 'ping':
      ws.send(JSON.stringify({ event: 'pong', data: { ts: Number(data.ts) || Date.now() } }));
      break;

    case 'chat:send': {
      const type = isString(data.type) && MESSAGE_TYPES.has(data.type) ? data.type : 'text';
      const text = isString(data.text) ? data.text.trim() : '';
      if (text.length > MAX_MESSAGE_LENGTH) {
        return ws.send(JSON.stringify({ event: 'error', data: { message: 'Xabar juda uzun' } }));
      }
      const receiver = await canInteract(user.id, data.receiverId);
      if (!receiver) {
        return ws.send(JSON.stringify({ event: 'error', data: { message: 'Xabar yuborib bo‘lmadi' } }));
      }

      let mediaUrl = null;
      if (type === 'text') {
        if (!text) return;
      } else {
        const stored = parseMediaUrl(data.mediaUrl);
        const upload = stored ? await UploadModel.find(stored) : null;
        if (!upload || upload.owner_id !== user.id) {
          return ws.send(JSON.stringify({ event: 'error', data: { message: 'Noto‘g‘ri fayl havolasi' } }));
        }
        mediaUrl = `/uploads/${stored}`;
      }

      const msg = await MessageModel.create({ senderId: user.id, receiverId: receiver.id, text, type, mediaUrl });
      sendToUser(user.id, 'chat:message', msg);
      sendToUser(receiver.id, 'chat:message', msg);
      break;
    }

    case 'chat:typing':
      if (await canInteract(user.id, data.receiverId)) {
        sendToUser(data.receiverId, 'chat:typing', { userId: user.id, isTyping: Boolean(data.isTyping) });
      }
      break;

    case 'chat:read':
      if (isUuid(data.peerId)) {
        await MessageModel.markRead(user.id, data.peerId);
        if (!(await FriendModel.isBlockedBetween(user.id, data.peerId))) {
          sendToUser(data.peerId, 'chat:read', { byUserId: user.id });
        }
      }
      break;

    case 'call:invite': {
      const receiver = await canInteract(user.id, data.receiverId);
      if (!receiver) {
        return ws.send(JSON.stringify({ event: 'call:unavailable', data: { receiverId: data.receiverId, reason: 'Qo‘ng‘iroq qilib bo‘lmaydi' } }));
      }
      const receiverId = receiver.id;
      const callId = crypto.randomUUID();
      const type = data.callType === 'video' ? 'video' : 'audio';

      if (!isOnline(receiverId)) {
        await CallModel.create({ id: callId, callerId: user.id, receiverId, callType: type, status: 'missed' });
        sendToUser(user.id, 'call:unavailable', { callId, receiverId, reason: 'Foydalanuvchi hozir oflayn' });
        return;
      }
      if (isUserInCall(receiverId) || isUserInCall(user.id)) {
        await CallModel.create({ id: callId, callerId: user.id, receiverId, callType: type, status: 'missed' });
        sendToUser(user.id, 'call:unavailable', { callId, receiverId, reason: 'Foydalanuvchi boshqa qo‘ng‘iroqda band' });
        return;
      }

      await CallModel.create({ id: callId, callerId: user.id, receiverId, callType: type, status: 'ringing' });
      const timeoutHandle = setTimeout(async () => {
        try {
          const s = activeCalls.get(callId);
          if (s && !s.answeredAt) {
            await endCall(callId, 'missed');
            sendToUser(s.callerId, 'call:timeout', { callId, reason: 'Javob berilmadi' });
            sendToUser(s.receiverId, 'call:timeout', { callId, reason: 'O‘tkazib yuborilgan qo‘ng‘iroq' });
          }
        } catch (e) {
          console.error('[ws] call timeout xatosi:', e.message);
        }
      }, CALL_RING_TIMEOUT_MS);
      timeoutHandle.unref();

      activeCalls.set(callId, { callerId: user.id, receiverId, callType: type, answeredAt: null, timeoutHandle });
      sendToUser(user.id, 'call:created', { callId, receiverId, callType: type });
      // Qabul qiluvchiga faqat ommaviy profil yuboriladi (email/telefonsiz)
      sendToUser(receiverId, 'call:incoming', { callId, callType: type, caller: publicUser(user) });
      break;
    }

    case 'call:accept': {
      const session = activeCalls.get(data.callId);
      if (!session || session.receiverId !== user.id || session.answeredAt) return;
      clearTimeout(session.timeoutHandle);
      session.answeredAt = Date.now();
      await CallModel.update(data.callId, { status: 'active' });
      sendToUser(session.callerId, 'call:accepted', { callId: data.callId, receiverId: user.id });
      break;
    }

    case 'call:reject': {
      const session = activeCalls.get(data.callId);
      if (!session || (session.callerId !== user.id && session.receiverId !== user.id)) return;
      await endCall(data.callId, 'rejected');
      sendToUser(session.callerId === user.id ? session.receiverId : session.callerId, 'call:rejected', { callId: data.callId });
      break;
    }

    case 'call:offer':
    case 'call:answer':
    case 'call:ice':
    case 'call:hold':
      if (isString(data.callId) && isString(data.targetId) && isAuthorizedCallPeer(data.callId, user.id, data.targetId)) {
        if (JSON.stringify(data).length > MAX_SIGNAL_BYTES) return;
        sendToUser(data.targetId, event, { ...data, fromId: user.id });
      }
      break;

    case 'call:hangup': {
      const session = activeCalls.get(data.callId);
      if (session && (session.callerId === user.id || session.receiverId === user.id)) {
        await endCall(data.callId, 'auto');
        sendToUser(session.callerId === user.id ? session.receiverId : session.callerId, 'call:hangup', { callId: data.callId, fromId: user.id });
      }
      break;
    }

    default:
      break;
  }
}

module.exports = { isOnline, sendToUser, disconnectUser, attachWebSocket };
