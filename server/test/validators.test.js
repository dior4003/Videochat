'use strict';
const test = require('node:test');
const assert = require('node:assert');
const v = require('../src/utils/validators');

test('email normalizatsiyasi', () => {
  assert.strictEqual(v.normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com');
  assert.strictEqual(v.normalizeEmail('bad'), null);
  assert.strictEqual(v.normalizeEmail({ a: 1 }), null);
  assert.strictEqual(v.normalizeEmail(`${'a'.repeat(200)}@x.com`), null);
});

test('parol qoidalari', () => {
  assert.ok(v.validatePassword('1234'));
  assert.ok(v.validatePassword(['aaaaaaaa']));
  assert.ok(v.validatePassword('a'.repeat(129)));
  assert.strictEqual(v.validatePassword('12345678'), null);
});

test('username: format va band qilingan nomlar', () => {
  assert.strictEqual(v.validateUsername('john_doe'), null);
  assert.ok(v.validateUsername('ab'));
  assert.ok(v.validateUsername('admin'));
  assert.ok(v.validateUsername('a b c'));
});

test('mediaUrl: tashqi domen/yo‘l hujumlari rad etiladi (token sizishi himoyasi)', () => {
  const ok = '/uploads/123e4567-e89b-12d3-a456-426614174000.png';
  assert.strictEqual(v.parseMediaUrl(ok), '123e4567-e89b-12d3-a456-426614174000.png');
  for (const bad of ['@evil.com/x', 'http://evil.com/a.png', '/uploads/../../etc/passwd', '//evil.com/uploads/x.png',
    '/uploads/123e4567-e89b-12d3-a456-426614174000.html', '/uploads/123e4567-e89b-12d3-a456-426614174000.png?x=1', null, 5]) {
    assert.strictEqual(v.parseMediaUrl(bad), null, String(bad));
  }
});

test('LIKE belgilari escape qilinadi', () => {
  assert.strictEqual(v.escapeLike('100%_a\\'), '100\\%\\_a\\\\');
});

test('fayl mazmuni kengaytmaga mos kelishi (magic bytes)', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  assert.strictEqual(v.sniffFile(png, '.png').ok, true);
  assert.strictEqual(v.sniffFile(png, '.pdf').ok, false);
  assert.strictEqual(v.sniffFile(Buffer.from('<html><script>alert(1)</script>'), '.png').ok, false);
  assert.strictEqual(v.sniffFile(Buffer.from('%PDF-1.7 ...'), '.pdf').ok, true);
  assert.strictEqual(v.sniffFile(Buffer.from([0x50, 0x4b, 0x03, 0x04]), '.zip').ok, true);
  assert.strictEqual(v.sniffFile(Buffer.from('salom'), '.txt').ok, true);
  assert.strictEqual(v.sniffFile(Buffer.from([1, 0, 2]), '.txt').ok, false);
  assert.strictEqual(v.sniffFile(png, '.exe').ok, false);
});

test('matn tozalash: boshqaruv belgilari va uzunlik', () => {
  assert.strictEqual(v.cleanText(' hi\u0000 ', 10), 'hi');
  assert.strictEqual(v.cleanText('a'.repeat(11), 10), null);
  assert.strictEqual(v.cleanText(42, 10), null);
});
