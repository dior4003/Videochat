'use strict';
process.env.JWT_SECRET = 'x'.repeat(48);
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const auth = require('../src/auth');

test('scrypt parol xeshi: to‘g‘ri/noto‘g‘ri parol', async () => {
  const hash = await auth.hashPassword('StrongPass123!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.strictEqual(await auth.verifyPassword('StrongPass123!', hash), true);
  assert.strictEqual(await auth.verifyPassword('WrongPass', hash), false);
  assert.strictEqual(auth.needsRehash(hash), false);
});

test('eski PBKDF2 xeshlari hamon tekshiriladi va qayta xeshlanishi belgilanadi', async () => {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.pbkdf2Sync('oldpass1', salt, 100000, 32, 'sha256').toString('hex');
  const legacy = `${salt}:${key}`;
  assert.strictEqual(await auth.verifyPassword('oldpass1', legacy), true);
  assert.strictEqual(await auth.verifyPassword('nope', legacy), false);
  assert.strictEqual(auth.needsRehash(legacy), true);
});

test('JWT: imzo, scope va muddat', () => {
  const token = auth.signUserToken({ id: 'u1', tokenVersion: 3 });
  const decoded = auth.verifyToken(token);
  assert.strictEqual(decoded.userId, 'u1');
  assert.strictEqual(decoded.tv, 3);
  assert.strictEqual(decoded.scope, 'user');
  assert.strictEqual(auth.verifyToken(token + 'x'), null);
  assert.strictEqual(auth.verifyToken(token.slice(0, -2) + 'AA'), null);
  assert.strictEqual(auth.verifyToken(auth.signToken({ userId: 'u1' }, -10)), null); // muddati o'tgan
});

test('JWT: alg=none hujumi rad etiladi', () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const forged = `${b({ alg: 'none', typ: 'JWT' })}.${b({ userId: 'admin', scope: 'moderator', exp: 9999999999 })}.`;
  assert.strictEqual(auth.verifyToken(forged), null);
});

test('moderator va media tokenlari alohida scope’ga ega', () => {
  const mod = auth.verifyToken(auth.signModToken({ id: 'm1', tokenVersion: 0, role: 'moderator' }));
  assert.strictEqual(mod.scope, 'moderator');
  const media = auth.verifyToken(auth.signMediaToken('u1', 'f.png'));
  assert.strictEqual(media.scope, 'media');
  assert.strictEqual(media.file, 'f.png');
});

test('WebSocket bileti bir martalik', () => {
  const t = auth.issueWsTicket('u1');
  assert.strictEqual(auth.consumeWsTicket(t), 'u1');
  assert.strictEqual(auth.consumeWsTicket(t), null);
  assert.strictEqual(auth.consumeWsTicket('yo‘q'), null);
});
